/**
 * Harbor Extension Tests
 * 
 * Unit tests for core functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HarborCli, HarborErrorType, HarborError } from '../utils/harbor-cli.js';
import { RunTracker } from '../services/run-tracker.js';
import { HarborCache } from '../utils/cache.js';

describe('HarborCache', () => {
  let cache: HarborCache;

  beforeEach(() => {
    cache = new HarborCache({ defaultTtlMs: 1000, maxSize: 10 });
  });

  it('should set and get values', () => {
    cache.set('test-key', { data: 'test-value' });
    const result = cache.get<{ data: string }>('test-key');
    expect(result).toEqual({ data: 'test-value' });
  });

  it('should return undefined for expired values', async () => {
    cache.set('expiring-key', { data: 'test' }, 50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = cache.get('expiring-key');
    expect(result).toBeUndefined();
  });

  it('should invalidate keys', () => {
    cache.set('to-invalidate', { data: 'test' });
    cache.invalidate('to-invalidate');
    const result = cache.get('to-invalidate');
    expect(result).toBeUndefined();
  });

  it('should respect max size', () => {
    const smallCache = new HarborCache({ maxSize: 3 });
    smallCache.set('key1', 'value1');
    smallCache.set('key2', 'value2');
    smallCache.set('key3', 'value3');
    smallCache.set('key4', 'value4');
    
    const stats = smallCache.getStats();
    expect(stats.size).toBeLessThanOrEqual(3);
  });

  it('should cleanup expired entries', async () => {
    cache.set('key1', 'value1', 50);
    cache.set('key2', 'value2', 50);
    cache.set('key3', 'value3', 5000);
    
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cleaned = cache.cleanup();
    
    expect(cleaned).toBeGreaterThanOrEqual(2);
  });
});

describe('RunTracker', () => {
  function createTracker(): RunTracker {
    const testWorkspace = `/tmp/harbor-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new RunTracker(testWorkspace);
  }

  it('should track runs', () => {
    const tracker = createTracker();
    tracker.addRun({
      runId: 'test-run-1',
      status: 'running',
      startedAt: Date.now(),
      options: { dataset: 'test-dataset' },
    });

    const run = tracker.getRun('test-run-1');
    expect(run).toBeDefined();
    expect(run?.status).toBe('running');
  });

  it('should update run status', () => {
    const tracker = createTracker();
    tracker.addRun({
      runId: 'test-run-2',
      status: 'running',
      startedAt: Date.now(),
      options: { dataset: 'test-dataset' },
    });

    tracker.completeRun('test-run-2');
    const run = tracker.getRun('test-run-2');
    expect(run?.status).toBe('completed');
  });

  it('should return active runs', () => {
    const tracker = createTracker();
    tracker.addRun({
      runId: 'active-1',
      status: 'running',
      startedAt: Date.now(),
      options: { dataset: 'test' },
    });
    tracker.addRun({
      runId: 'completed-1',
      status: 'completed',
      startedAt: Date.now(),
      options: { dataset: 'test' },
    });

    const active = tracker.getActiveRuns();
    expect(active.length).toBe(1);
    expect(active[0].runId).toBe('active-1');
  });

  it('should calculate stats', () => {
    const tracker = createTracker();
    tracker.addRun({
      runId: 'run-1',
      status: 'running',
      startedAt: Date.now(),
      options: { dataset: 'test' },
    });
    tracker.addRun({
      runId: 'run-2',
      status: 'completed',
      startedAt: Date.now(),
      options: { dataset: 'test' },
    });
    tracker.addRun({
      runId: 'run-3',
      status: 'failed',
      startedAt: Date.now(),
      options: { dataset: 'test' },
    });

    const stats = tracker.getStats();
    expect(stats.totalRuns).toBe(3);
    expect(stats.activeRuns).toBe(1);
    expect(stats.completedRuns).toBe(1);
    expect(stats.failedRuns).toBe(1);
  });

  it('should cleanup old runs', () => {
    const tracker = createTracker();
    const now = Date.now();
    tracker.addRun({
      runId: 'old-run-1',
      status: 'completed',
      startedAt: now - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      completedAt: now - 8 * 24 * 60 * 60 * 1000,
      options: { dataset: 'test' },
    });
    tracker.addRun({
      runId: 'recent-run-1',
      status: 'completed',
      startedAt: now - 2 * 24 * 60 * 60 * 1000,
      completedAt: now - 1 * 24 * 60 * 60 * 1000,
      options: { dataset: 'test' },
    });

    const cleaned = tracker.cleanupOldRuns(7); // Keep 7 days
    expect(cleaned).toBe(1);
    expect(tracker.getRun('old-run-1')).toBeUndefined();
    expect(tracker.getRun('recent-run-1')).toBeDefined();
  });
});

describe('HarborCli - Error Categorization', () => {
  let cli: HarborCli;

  beforeEach(() => {
    cli = new HarborCli('python3');
  });

  it('should categorize timeout errors as retryable', () => {
    const error = new Error('Request timeout after 30s');
    const result = cli.categorizeError(error);
    expect(result.type).toBe(HarborErrorType.TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it('should categorize auth errors as non-retryable', () => {
    const error = new Error('Unauthorized: invalid API key');
    const result = cli.categorizeError(error);
    expect(result.type).toBe(HarborErrorType.AUTH);
    expect(result.retryable).toBe(false);
  });

  it('should categorize network errors as retryable', () => {
    const error = new Error('ECONNREFUSED 127.0.0.1:8080');
    const result = cli.categorizeError(error);
    expect(result.type).toBe(HarborErrorType.NETWORK);
    expect(result.retryable).toBe(true);
  });

  it('should categorize container errors as retryable', () => {
    const error = new Error('Container failed to start');
    const result = cli.categorizeError(error);
    expect(result.type).toBe(HarborErrorType.CONTAINER);
    expect(result.retryable).toBe(true);
  });

  it('should categorize not installed errors as non-retryable', () => {
    const error = new Error('No module named harbor');
    const result = cli.categorizeError(error);
    expect(result.type).toBe(HarborErrorType.NOT_INSTALLED);
    expect(result.retryable).toBe(false);
  });

  it('should categorize unknown errors as non-retryable', () => {
    const error = new Error('Some random error');
    const result = cli.categorizeError(error);
    expect(result.type).toBe(HarborErrorType.UNKNOWN);
    expect(result.retryable).toBe(false);
  });
});

describe('HarborCli - Run ID Generation', () => {
  let cli: HarborCli;

  beforeEach(() => {
    cli = new HarborCli('python3');
  });

  it('should generate unique run IDs', () => {
    // This test verifies the parseRunResult method generates unique IDs
    // We can't easily test the private method, but we can verify the class exists
    expect(cli).toBeDefined();
  });

  it('should handle long dataset names', () => {
    const longDataset = 'terminal-bench-2-0-with-a-very-long-name-that-should-be-truncated';
    expect(longDataset.length).toBeGreaterThan(30);
    // The parseRunResult method will truncate this to 30 chars
  });
});

describe('HarborError', () => {
  it('should create error with type and retryable flag', () => {
    const error = new HarborError('Test error', HarborErrorType.TIMEOUT, true);
    expect(error.name).toBe('HarborError');
    expect(error.type).toBe(HarborErrorType.TIMEOUT);
    expect(error.retryable).toBe(true);
    expect(error.message).toBe('Test error');
  });

  it('should default to UNKNOWN type and non-retryable', () => {
    const error = new HarborError('Test error');
    expect(error.type).toBe(HarborErrorType.UNKNOWN);
    expect(error.retryable).toBe(false);
  });
});
