/**
 * Run Tracker Service
 * 
 * Tracks Harbor run state across xopcbot restarts.
 * Persists state to workspace for durability.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createLogger } from '../utils/internal-logger.js';
import type { HarborRunOptions, HarborRunResult } from '../utils/harbor-cli.js';

const log = createLogger('HarborRunTracker');

export interface HarborRunState {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  options: HarborRunOptions;
  lastCheckedAt?: number;
  lastStatus?: HarborRunResult;
  errorMessage?: string;
}

export interface RunTrackerStats {
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  failedRuns: number;
}

export class RunTracker {
  private runs = new Map<string, HarborRunState>();
  private stateFile: string;

  constructor(workspaceDir: string) {
    this.stateFile = join(workspaceDir, '.harbor-runs.json');
    this.load();
    log.debug({ stateFile: this.stateFile }, 'RunTracker initialized');
  }

  /**
   * Add a new run to tracking
   */
  addRun(state: HarborRunState): void {
    this.runs.set(state.runId, state);
    this.save();
    log.info({ runId: state.runId, dataset: state.options.dataset }, 'Run added to tracker');
  }

  /**
   * Get run state by ID
   */
  getRun(runId: string): HarborRunState | undefined {
    return this.runs.get(runId);
  }

  /**
   * Update run state
   */
  updateRun(runId: string, updates: Partial<HarborRunState>): void {
    const run = this.runs.get(runId);
    if (!run) {
      log.warn({ runId }, 'Attempted to update non-existent run');
      return;
    }

    Object.assign(run, updates);
    run.lastCheckedAt = Date.now();
    this.save();
    log.debug({ runId, status: updates.status }, 'Run updated');
  }

  /**
   * Mark run as completed
   */
  completeRun(runId: string, result?: HarborRunResult): void {
    this.updateRun(runId, {
      status: 'completed',
      completedAt: Date.now(),
      lastStatus: result,
    });
    log.info({ runId }, 'Run marked as completed');
  }

  /**
   * Mark run as failed
   */
  failRun(runId: string, errorMessage: string): void {
    this.updateRun(runId, {
      status: 'failed',
      completedAt: Date.now(),
      errorMessage,
    });
    log.warn({ runId, errorMessage }, 'Run marked as failed');
  }

  /**
   * Mark run as cancelled
   */
  cancelRun(runId: string): void {
    this.updateRun(runId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });
    log.info({ runId }, 'Run marked as cancelled');
  }

  /**
   * Get all active (running) runs
   */
  getActiveRuns(): HarborRunState[] {
    return Array.from(this.runs.values()).filter((r) => r.status === 'running');
  }

  /**
   * Get all runs (optionally filtered by status)
   */
  getAllRuns(status?: HarborRunState['status']): HarborRunState[] {
    const runs = Array.from(this.runs.values());
    if (status) {
      return runs.filter((r) => r.status === status);
    }
    return runs;
  }

  /**
   * Get tracker statistics
   */
  getStats(): RunTrackerStats {
    const runs = Array.from(this.runs.values());
    return {
      totalRuns: runs.length,
      activeRuns: runs.filter((r) => r.status === 'running').length,
      completedRuns: runs.filter((r) => r.status === 'completed').length,
      failedRuns: runs.filter((r) => r.status === 'failed' || r.status === 'cancelled').length,
    };
  }

  /**
   * Get count of active runs (for concurrency control)
   */
  getActiveRunCount(): number {
    return this.getActiveRuns().length;
  }

  /**
   * Clean up old completed runs (older than specified days)
   */
  cleanupOldRuns(daysToKeep: number = 7): number {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [runId, run] of this.runs.entries()) {
      if (run.status !== 'running' && run.completedAt && run.completedAt < cutoff) {
        this.runs.delete(runId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.save();
      log.info({ cleaned }, 'Cleaned up old runs');
    }

    return cleaned;
  }

  /**
   * Load state from disk
   */
  private load(): void {
    if (!existsSync(this.stateFile)) {
      log.debug('No existing state file found');
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this.stateFile, 'utf-8'));
      this.runs = new Map(Object.entries(data) as Array<[string, HarborRunState]>);
      
      // Mark any "running" runs as potentially stale (xopcbot was restarted)
      let staleCount = 0;
      for (const [runId, run] of this.runs.entries()) {
        if (run.status === 'running') {
          // Don't automatically mark as failed - let user check status
          log.warn({ runId }, 'Found potentially stale running run after restart');
          staleCount++;
        }
      }

      if (staleCount > 0) {
        log.warn({ staleCount }, 'Some runs may need status refresh after restart');
      }

      log.info({ count: this.runs.size }, 'Loaded run tracker state');
    } catch (error) {
      log.error({ err: error }, 'Failed to load run tracker state');
      this.runs.clear();
    }
  }

  /**
   * Save state to disk
   */
  private save(): void {
    try {
      const data = Object.fromEntries(this.runs);
      // Ensure directory exists
      const dir = dirname(this.stateFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.stateFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log.debug({ err: error }, 'Failed to save run tracker state (non-fatal)');
    }
  }
}
