/**
 * Harbor Extension for xopcbot
 * 
 * Simple standalone extension that doesn't depend on xopcbot core types.
 * Compatible with xopcbot Extension API.
 */

import { HarborCli, type HarborRunOptions } from './utils/harbor-cli.js';
import { RunTracker } from './services/run-tracker.js';
import { HarborCache } from './utils/cache.js';
import { createLogger } from './utils/internal-logger.js';

const log = createLogger('HarborExtension');

// Extension API types (simplified)
interface ExtensionApi {
  registerTool: (tool: { name: string; description: string; parameters: Record<string, unknown>; execute: (params: Record<string, unknown>) => Promise<string> }) => void;
  registerCommand: (cmd: { name: string; description: string; handler: (args: string[]) => Promise<string> | string }) => void;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  config: Record<string, unknown>;
}

export async function register(api: ExtensionApi): Promise<void> {
  log.info('Registering Harbor extension');

  const config = api.config as {
    pythonPath?: string;
    maxConcurrentRuns?: number;
    cacheTtlMs?: number;
    workspaceDir?: string;
  };

  const maxConcurrentRuns = config.maxConcurrentRuns || 5;
  const cacheTtlMs = config.cacheTtlMs || 60 * 1000;

  // Initialize services
  const harborCli = new HarborCli(config.pythonPath || 'python3');
  // Use workspace dir from config or fallback to temp
  const workspaceDir = config.workspaceDir || '/tmp/harbor';
  const runTracker = new RunTracker(workspaceDir);
  const cache = new HarborCache({ defaultTtlMs: cacheTtlMs, maxSize: 50 });

  // Check Harbor installation
  let harborAvailable = false;
  try {
    await harborCli.ensureInstalled();
    harborAvailable = true;
    log.info('Harbor CLI is available');
  } catch (error) {
    log.warn('Harbor CLI not installed - tools will fail until installed');
  }

  // Register harbor_run tool
  api.registerTool({
    name: 'harbor_run',
    description: 'Run a Harbor benchmark evaluation. Supports Terminal-Bench-2.0, SWE-Bench, and other datasets.',
    parameters: {
      type: 'object',
      properties: {
        dataset: { type: 'string', description: 'Dataset to evaluate (e.g., terminal-bench@2.0)' },
        agent: { type: 'string', description: 'Agent to evaluate (default: xopcbot)' },
        model: { type: 'string', description: 'Model to use' },
        nConcurrent: { type: 'number', description: 'Number of concurrent environments' },
        provider: { type: 'string', description: 'Provider: docker, daytona, modal, e2b' },
      },
      required: ['dataset'],
    },
    execute: async (params: Record<string, unknown>): Promise<string> => {
      if (!harborAvailable) {
        return '❌ Harbor CLI not installed. Run: uv tool install harbor';
      }

      const dataset = params.dataset as string;
      if (!dataset) return '❌ dataset is required';
      
      // Validate dataset format (basic security)
      if (!/^[a-zA-Z0-9@._-]+$/.test(dataset)) {
        return '❌ Invalid dataset format. Use format like: terminal-bench@2.0';
      }

      // Check concurrency
      if (runTracker.getActiveRunCount() >= maxConcurrentRuns) {
        return `❌ Maximum concurrent runs (${maxConcurrentRuns}) reached`;
      }

      const options: HarborRunOptions = {
        dataset,
        agent: params.agent as string | undefined,
        model: params.model as string | undefined,
        nConcurrent: params.nConcurrent as number | undefined,
        provider: params.provider as 'docker' | 'daytona' | 'modal' | 'e2b' | undefined,
      };

      try {
        const result = await harborCli.run(options);
        runTracker.addRun({
          runId: result.runId,
          status: 'running',
          startedAt: Date.now(),
          options,
        });
        cache.invalidate('datasets');

        return `✅ Harbor evaluation started

**Run ID**: \`${result.runId}\`
**Dataset**: ${result.dataset}
**Agent**: ${result.agent}
**Concurrent**: ${result.nConcurrent}
**Provider**: ${result.provider}

Use \`harbor_status\` with runId to check progress.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Log full error internally, show simplified message to user
        log.error({ err: error }, 'harbor_run failed');
        return `❌ Harbor run failed: ${msg.slice(0, 200)}`;
      }
    },
  });

  // Register harbor_datasets tool
  api.registerTool({
    name: 'harbor_datasets',
    description: 'List available Harbor datasets and benchmarks.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category (e.g., coding, reasoning)' },
      },
      required: [],
    },
    execute: async (params: Record<string, unknown>): Promise<string> => {
      if (!harborAvailable) {
        return '❌ Harbor CLI not installed';
      }

      const category = params.category as string | undefined;

      try {
        let datasets = await harborCli.listDatasets();
        
        // Filter by category if specified
        if (category) {
          datasets = datasets.filter(d => 
            d.category.toLowerCase().includes(category.toLowerCase())
          );
        }

        const formatted = datasets
          .map((d) => `**${d.name}** (\`${d.id}\`) - ${d.tasksCount} tasks - ${d.category}`)
          .join('\n');
        
        const header = category 
          ? `📊 Harbor Datasets (category: ${category})`
          : `📊 Available Harbor Datasets`;
          
        return `${header} (${datasets.length})\n\n${formatted}`;
      } catch (error) {
        log.error({ err: error }, 'harbor_datasets failed');
        return `❌ Failed to list datasets`;
      }
    },
  });

  // Register harbor_status tool
  api.registerTool({
    name: 'harbor_status',
    description: 'Get the current status of a Harbor benchmark run.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run ID from harbor_run' },
      },
      required: ['runId'],
    },
    execute: async (params: Record<string, unknown>): Promise<string> => {
      if (!harborAvailable) return '❌ Harbor CLI not installed';

      const runId = params.runId as string;
      if (!runId) return '❌ runId is required';

      try {
        const status = await harborCli.getStatus(runId);
        const progress = status.tasksTotal
          ? `${Math.round(((status.tasksCompleted || 0) / status.tasksTotal) * 100)}%`
          : 'N/A';

        return `📊 Harbor Run Status

**Run ID**: \`${status.runId}\`
**Dataset**: ${status.dataset}
**Status**: ${status.status}
**Progress**: ${progress}
**Tasks**: ${status.tasksCompleted || 0}/${status.tasksTotal || '?'}`;
      } catch (error) {
        return `❌ Failed to get status: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  // Register harbor_results tool
  api.registerTool({
    name: 'harbor_results',
    description: 'Get evaluation results for a completed Harbor run.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run ID from harbor_run' },
        includeLogs: { type: 'boolean', description: 'Include detailed task logs' },
      },
      required: ['runId'],
    },
    execute: async (params: Record<string, unknown>): Promise<string> => {
      if (!harborAvailable) return '❌ Harbor CLI not installed';

      const runId = params.runId as string;
      const includeLogs = params.includeLogs as boolean | false;

      try {
        const results = await harborCli.getResults(runId);
        const s = results.summary;

        let content = `📊 Harbor Evaluation Results

**Run ID**: \`${results.runId}\`
**Status**: ${results.status}

**Summary**:
- Total: ${s.totalTasks}
- Passed: ${s.passedTasks} ✅
- Failed: ${s.failedTasks} ❌
- Pass Rate: ${(s.passRate * 100).toFixed(1)}%`;

        if (includeLogs && results.detailedLogs?.length > 0) {
          content += '\n\n**Tasks**:\n';
          results.detailedLogs.slice(0, 10).forEach((t) => {
            const icon = t.status === 'passed' ? '✅' : '❌';
            content += `${icon} ${t.taskId}: ${t.status}\n`;
          });
        }

        return content;
      } catch (error) {
        return `❌ Failed to get results: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  // Register /harbor command
  api.registerCommand({
    name: 'harbor',
    description: 'Harbor benchmark management. Usage: /harbor <command> [options]',
    handler: async (args: string[]): Promise<string> => {
      const command = args[0]?.toLowerCase();
      const subArgs = args.slice(1);

      switch (command) {
        case 'run': {
          const dataset = subArgs.find((a) => !a.startsWith('--'));
          if (!dataset) return '❌ Usage: /harbor run <dataset> [--agent x] [--model y]';
          return `🚀 Starting evaluation for ${dataset}... (use harbor_run tool for full options)`;
        }
        case 'datasets': {
          try {
            const datasets = await harborCli.listDatasets();
            return datasets.map((d) => `• ${d.name} (${d.id})`).join('\n');
          } catch (error) {
            return `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        case 'status': {
          if (!subArgs[0]) return '❌ Usage: /harbor status <runId>';
          try {
            const status = await harborCli.getStatus(subArgs[0]);
            return `**${status.runId}**: ${status.status}`;
          } catch (error) {
            return `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        case 'list': {
          const runs = runTracker.getActiveRuns();
          if (runs.length === 0) return '📊 No active runs';
          return runs.map((r) => `🔄 ${r.runId}: ${r.options.dataset}`).join('\n');
        }
        case 'help':
        default:
          return `📊 Harbor Commands

**Usage**: /harbor <command> [options]

**Commands**:
  run <dataset>  - Start evaluation
  datasets       - List datasets
  status <id>    - Check run status
  list           - List active runs
  help           - Show this help`;
      }
    },
  });

  log.info('Harbor extension registered successfully');
}
