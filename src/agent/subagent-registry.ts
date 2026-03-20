import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { resolveSubagentRegistryPath } from '../config/paths.js';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RunResult {
  success: boolean;
  summary?: string;
  error?: string;
}

export interface SubagentRun {
  runId: string;
  parentAgentId: string;
  childAgentId: string;
  task: string;
  status: RunStatus;
  cleanup: 'keep' | 'delete';
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  cleanupHandled?: boolean;
  result?: RunResult;
  requesterOrigin?: Record<string, unknown>;
}

export interface RunsFile {
  version: number;
  runs: Record<string, SubagentRun>;
}

const EMPTY: RunsFile = { version: 2, runs: {} };

export class SubagentRegistry {
  constructor(private readonly filePath: string = resolveSubagentRegistryPath()) {}

  private load(): RunsFile {
    if (!existsSync(this.filePath)) return { ...EMPTY, runs: {} };
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf-8')) as RunsFile;
      if (!data.runs || typeof data.runs !== 'object') return { ...EMPTY, runs: {} };
      return data;
    } catch {
      return { ...EMPTY, runs: {} };
    }
  }

  private save(data: RunsFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  async register(run: SubagentRun): Promise<void> {
    const data = this.load();
    data.runs[run.runId] = run;
    this.save(data);
  }

  async updateStatus(runId: string, status: RunStatus, result?: RunResult): Promise<void> {
    const data = this.load();
    const run = data.runs[runId];
    if (!run) return;
    run.status = status;
    if (result) run.result = result;
    if (status === 'running' && !run.startedAt) run.startedAt = Date.now();
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      run.endedAt = Date.now();
    }
    this.save(data);
  }

  async markCleanupHandled(runId: string): Promise<void> {
    const data = this.load();
    const run = data.runs[runId];
    if (!run) return;
    run.cleanupHandled = true;
    this.save(data);
  }

  async getPendingCleanups(parentAgentId: string): Promise<SubagentRun[]> {
    const data = this.load();
    return Object.values(data.runs).filter(
      (r) =>
        r.parentAgentId === parentAgentId &&
        r.status === 'completed' &&
        !r.cleanupHandled &&
        r.cleanup === 'delete',
    );
  }

  async listRuns(filter?: { parentAgentId?: string; status?: RunStatus }): Promise<SubagentRun[]> {
    let list = Object.values(this.load().runs);
    if (filter?.parentAgentId) {
      list = list.filter((r) => r.parentAgentId === filter.parentAgentId);
    }
    if (filter?.status) {
      list = list.filter((r) => r.status === filter.status);
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  async pruneCompleted(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 86400000;
    const data = this.load();
    let n = 0;
    for (const [id, run] of Object.entries(data.runs)) {
      if (run.status !== 'completed' && run.status !== 'failed' && run.status !== 'cancelled') continue;
      const t = run.endedAt ?? run.createdAt;
      if (t < cutoff) {
        delete data.runs[id];
        n++;
      }
    }
    if (n) this.save(data);
    return n;
  }
}
