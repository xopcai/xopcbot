/**
 * Harbor CLI Wrapper
 * 
 * Interfaces with the Harbor Python CLI for running benchmarks.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { createLogger } from './internal-logger.js';

const execAsync = promisify(exec);

// Timeout configuration
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for most operations
const LONG_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes for long-running evaluations

const log = createLogger('HarborCli');

// Retry configuration constants
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;
const LONG_RETRY_DELAY_MS = 3000;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Error categories for retry logic
 */
export enum HarborErrorType {
  NETWORK = 'NETWORK',
  CONTAINER = 'CONTAINER',
  AUTH = 'AUTH',
  TIMEOUT = 'TIMEOUT',
  NOT_INSTALLED = 'NOT_INSTALLED',
  UNKNOWN = 'UNKNOWN',
}

export class HarborError extends Error {
  type: HarborErrorType;
  retryable: boolean;

  constructor(message: string, type: HarborErrorType = HarborErrorType.UNKNOWN, retryable = false) {
    super(message);
    this.name = 'HarborError';
    this.type = type;
    this.retryable = retryable;
  }
}

export interface HarborRunOptions {
  dataset: string;
  agent?: string;
  model?: string;
  nConcurrent?: number;
  provider?: 'docker' | 'daytona' | 'modal' | 'e2b';
  outputDir?: string;
}

export interface HarborRunResult {
  runId: string;
  status: 'running' | 'completed' | 'failed';
  dataset: string;
  agent: string;
  model?: string;
  nConcurrent: number;
  provider: string;
  startedAt: string;
  estimatedTime?: number;
  tasksTotal?: number;
  tasksCompleted?: number;
}

export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  tasksCount: number;
  category: string;
}

export interface EvaluationResults {
  runId: string;
  status: 'running' | 'completed' | 'failed';
  summary: {
    totalTasks: number;
    completedTasks: number;
    passedTasks: number;
    failedTasks: number;
    passRate: number;
    averageTime: number;
  };
  detailedLogs: TaskResult[];
}

export interface TaskResult {
  taskId: string;
  status: 'passed' | 'failed' | 'error' | 'timeout';
  agentOutput: string;
  executionTime: number;
  error?: string;
}

export interface HarborRetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  retryableErrors?: string[];
  timeoutMs?: number;
}

export class HarborCli {
  private pythonPath: string;
  private installed: boolean | null = null;

  constructor(pythonPath: string = 'python3') {
    this.pythonPath = pythonPath;
  }

  /**
   * Categorize error type for retry logic
   * @visibleForTesting
   */
  categorizeError(error: Error): { type: HarborErrorType; retryable: boolean } {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return { type: HarborErrorType.TIMEOUT, retryable: true };
    }
    if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
      return { type: HarborErrorType.NETWORK, retryable: true };
    }
    if (message.includes('container') || message.includes('docker')) {
      return { type: HarborErrorType.CONTAINER, retryable: true };
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
      return { type: HarborErrorType.AUTH, retryable: false };
    }
    if (message.includes('not installed') || message.includes('not found') || message.includes('no module')) {
      return { type: HarborErrorType.NOT_INSTALLED, retryable: false };
    }

    return { type: HarborErrorType.UNKNOWN, retryable: false };
  }

  /**
   * Execute operation with retry logic and timeout
   */
  private async execWithRetry<T>(
    operation: () => Promise<T>,
    options: HarborRetryOptions = {},
    context: string = 'Harbor operation'
  ): Promise<T> {
    const { 
      maxRetries = DEFAULT_MAX_RETRIES, 
      retryDelayMs = DEFAULT_RETRY_DELAY_MS, 
      retryableErrors = [],
      timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options;

    let lastError: Error;
    const categorizedErrors: Array<{ attempt: number; error: string; type: string }> = [];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wrap operation with timeout
        return await Promise.race([
          operation(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs / 1000}s`)), timeoutMs)
          ),
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const { type, retryable } = this.categorizeError(lastError);

        const isTimeout = lastError.message.includes('timeout');
        categorizedErrors.push({
          attempt,
          error: lastError.message.slice(0, 200),
          type: isTimeout ? 'TIMEOUT' : type,
        });

        // Check if error is retryable (timeouts are retryable)
        const isRetryable = retryable || isTimeout || retryableErrors.some((e) => lastError.message.includes(e));

        if (!isRetryable || attempt === maxRetries) {
          log.error(
            {
              context,
              attempts: categorizedErrors,
              finalError: lastError.message,
            },
            'Operation failed after retries'
          );
          throw new HarborError(
            lastError.message,
            isTimeout ? HarborErrorType.TIMEOUT : type,
            false
          );
        }

        log.warn(
          {
            attempt,
            maxRetries,
            delayMs: retryDelayMs * attempt,
            err: lastError.message,
          },
          'Retrying Harbor operation'
        );

        // Exponential backoff
        await sleep(retryDelayMs * attempt);
      }
    }

    throw lastError!;
  }

  /**
   * Check if Harbor is installed
   */
  async ensureInstalled(): Promise<boolean> {
    if (this.installed !== null) {
      return this.installed;
    }

    try {
      await execAsync(`${this.pythonPath} -m harbor --version`);
      this.installed = true;
      log.info('Harbor CLI is installed');
      return true;
    } catch (error) {
      this.installed = false;
      log.error({ err: error }, 'Harbor CLI not found');
      throw new HarborError(
        'Harbor not installed. Run: uv tool install harbor\nOr: pip install harbor',
        HarborErrorType.NOT_INSTALLED,
        false
      );
    }
  }

  /**
   * Run a Harbor benchmark evaluation
   */
  async run(options: HarborRunOptions): Promise<HarborRunResult> {
    await this.ensureInstalled();

    const args = ['run'];
    args.push(`--dataset "${options.dataset}"`);
    
    if (options.agent) {
      args.push(`--agent "${options.agent}"`);
    }
    
    if (options.model) {
      args.push(`--model "${options.model}"`);
    }
    
    if (options.nConcurrent) {
      args.push(`--n-concurrent ${options.nConcurrent}`);
    }
    
    if (options.provider) {
      args.push(`--env ${options.provider}`);
    }

    if (options.outputDir) {
      args.push(`--output-dir "${options.outputDir}"`);
    }

    const command = `${this.pythonPath} -m harbor ${args.join(' ')}`;
    log.info({ command, dataset: options.dataset }, 'Running Harbor benchmark');

    // Use long timeout for benchmark runs (they can take a while)
    return this.execWithRetry(
      async () => {
        const { stdout, stderr } = await execAsync(command);
        if (stderr) {
          log.warn({ stderr: stderr.slice(0, 200) }, 'Harbor CLI produced stderr output');
        }
        return this.parseRunResult(stdout, options);
      },
      {
        maxRetries: DEFAULT_MAX_RETRIES,
        retryDelayMs: LONG_RETRY_DELAY_MS,
        retryableErrors: ['timeout', 'container failed', 'connection refused'],
        timeoutMs: LONG_TIMEOUT_MS,
      },
      `harbor run --dataset ${options.dataset}`
    );
  }

  /**
   * List available datasets
   */
  async listDatasets(): Promise<DatasetInfo[]> {
    await this.ensureInstalled();

    return this.execWithRetry(
      async () => {
        const { stdout } = await execAsync(
          `${this.pythonPath} -m harbor datasets list --format json`
        );
        return JSON.parse(stdout);
      },
      { maxRetries: 2, retryDelayMs: DEFAULT_RETRY_DELAY_MS / 2 },
      'harbor datasets list'
    );
  }

  /**
   * Get results for a specific run
   */
  async getResults(runId: string): Promise<EvaluationResults> {
    await this.ensureInstalled();

    return this.execWithRetry(
      async () => {
        const { stdout } = await execAsync(
          `${this.pythonPath} -m harbor results ${runId} --format json`
        );
        return JSON.parse(stdout);
      },
      { maxRetries: 2, retryDelayMs: DEFAULT_RETRY_DELAY_MS / 2 },
      `harbor results ${runId}`
    );
  }

  /**
   * Get status of a running evaluation
   */
  async getStatus(runId: string): Promise<HarborRunResult> {
    await this.ensureInstalled();

    return this.execWithRetry(
      async () => {
        const { stdout } = await execAsync(
          `${this.pythonPath} -m harbor status ${runId} --format json`
        );
        return JSON.parse(stdout);
      },
      { maxRetries: 2, retryDelayMs: DEFAULT_RETRY_DELAY_MS / 2 },
      `harbor status ${runId}`
    );
  }

  /**
   * Stop a running evaluation
   */
  async stop(runId: string): Promise<void> {
    await this.ensureInstalled();

    return this.execWithRetry(
      async () => {
        await execAsync(`${this.pythonPath} -m harbor stop ${runId}`);
      },
      { maxRetries: 2, retryDelayMs: DEFAULT_RETRY_DELAY_MS / 2 },
      `harbor stop ${runId}`
    );
  }

  /**
   * Parse Harbor CLI output into structured result
   */
  private parseRunResult(stdout: string, options: HarborRunOptions): HarborRunResult {
    // Generate a unique run ID with timestamp and random suffix
    const randomSuffix = randomBytes(4).toString('hex');
    // Shorten dataset name to keep run ID reasonable length
    const datasetSlug = options.dataset.replace(/[^a-z0-9]/gi, '-').slice(0, 30);
    const runId = `harbor-${Date.now()}-${randomSuffix}-${datasetSlug}`;
    
    // Try to parse JSON output first
    try {
      const parsed = JSON.parse(stdout);
      return {
        runId: parsed.run_id || runId,
        status: parsed.status || 'running',
        dataset: options.dataset,
        agent: options.agent || 'xopcbot',
        model: options.model,
        nConcurrent: options.nConcurrent || 1,
        provider: options.provider || 'docker',
        startedAt: new Date().toISOString(),
        estimatedTime: parsed.estimated_time,
        tasksTotal: parsed.tasks_total,
        tasksCompleted: parsed.tasks_completed || 0,
      };
    } catch {
      // Fallback: parse text output
      return {
        runId,
        status: 'running',
        dataset: options.dataset,
        agent: options.agent || 'xopcbot',
        model: options.model,
        nConcurrent: options.nConcurrent || 1,
        provider: options.provider || 'docker',
        startedAt: new Date().toISOString(),
        tasksCompleted: 0,
      };
    }
  }
}
