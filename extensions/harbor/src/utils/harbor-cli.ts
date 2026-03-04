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

const log = createLogger('HarborCli');

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
   * Execute operation with retry logic
   */
  private async execWithRetry<T>(
    operation: () => Promise<T>,
    options: HarborRetryOptions = {},
    context: string = 'Harbor operation'
  ): Promise<T> {
    const { maxRetries = 3, retryDelayMs = 2000, retryableErrors = [] } = options;

    let lastError: Error;
    const categorizedErrors: Array<{ attempt: number; error: string; type: string }> = [];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const { type, retryable } = this.categorizeError(lastError);

        categorizedErrors.push({
          attempt,
          error: lastError.message.slice(0, 200),
          type,
        });

        // Check if error is retryable
        const isRetryable =
          retryable || retryableErrors.some((e) => lastError.message.includes(e));

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
            type,
            false // Already exhausted retries
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
    log.info({ command, options }, 'Running Harbor benchmark');

    return this.execWithRetry(
      async () => {
        const { stdout, stderr } = await execAsync(command);
        if (stderr) {
          log.warn({ stderr }, 'Harbor CLI produced stderr output');
        }
        return this.parseRunResult(stdout, options);
      },
      {
        maxRetries: 3,
        retryDelayMs: 3000,
        retryableErrors: ['timeout', 'container failed', 'connection refused'],
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
      { maxRetries: 2, retryDelayMs: 1000 },
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
      { maxRetries: 2, retryDelayMs: 1000 },
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
      { maxRetries: 2, retryDelayMs: 1000 },
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
      { maxRetries: 2, retryDelayMs: 1000 },
      `harbor stop ${runId}`
    );
  }

  /**
   * Parse Harbor CLI output into structured result
   */
  private parseRunResult(stdout: string, options: HarborRunOptions): HarborRunResult {
    // Generate a unique run ID with timestamp and random suffix
    const randomSuffix = randomBytes(4).toString('hex');
    const runId = `harbor-${Date.now()}-${randomSuffix}-${options.dataset.replace(/[^a-z0-9]/gi, '-').slice(0, 50)}`;
    
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
