import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryWithBackoff,
  retryWithResult,
  withRetry,
  RetryManager,
  DEFAULT_RETRY_CONFIG,
} from '../retry.js';

describe('Retry Module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const promise = retryWithBackoff(operation, { initialDelayMs: 1000 });
      
      // Fast-forward past the retry delay
      await vi.advanceTimersByTimeAsync(1000);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      
      const promise = retryWithBackoff(operation, { 
        maxAttempts: 3, 
        initialDelayMs: 1000 
      });
      
      // Fast-forward past all retry delays
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      
      await expect(promise).rejects.toThrow('timeout');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable error', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('not found'));
      
      await expect(retryWithBackoff(operation)).rejects.toThrow('not found');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const onRetry = vi.fn();
      const promise = retryWithBackoff(operation, { 
        initialDelayMs: 1000,
        backoffFactor: 2,
        onRetry,
      });
      
      // First retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
      
      // Second retry after 2000ms (exponential)
      await vi.advanceTimersByTimeAsync(2000);
      
      await promise;
      
      const firstDelay = onRetry.mock.calls[0][2];
      const secondDelay = onRetry.mock.calls[1][2];
      expect(secondDelay).toBeGreaterThan(firstDelay * 1.5); // Allow for jitter
    });
  });

  describe('retryWithResult', () => {
    it('should return success result', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await retryWithResult(operation);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
    });

    it('should return failure result', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fatal'));
      
      const result = await retryWithResult(operation);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.attempts).toBe(1);
    });
  });

  describe('withRetry', () => {
    it('should wrap function with retry', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const wrapped = withRetry(fn, { initialDelayMs: 1000 });
      
      const promise = wrapped('arg1', 'arg2');
      await vi.advanceTimersByTimeAsync(1000);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('RetryManager', () => {
    it('should track retry statistics', async () => {
      const manager = new RetryManager();
      
      const operation1 = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const operation2 = vi.fn().mockResolvedValue('success');
      
      await manager.execute(operation1, { initialDelayMs: 100 });
      await vi.advanceTimersByTimeAsync(100);
      
      await manager.execute(operation2);
      
      const stats = manager.getStats();
      
      expect(stats.totalAttempts).toBe(3); // 2 for first, 1 for second
      expect(stats.successfulRetries).toBe(1);
    });

    it('should reset statistics', async () => {
      const manager = new RetryManager();
      
      await manager.execute(() => Promise.resolve('success'));
      manager.resetStats();
      
      const stats = manager.getStats();
      
      expect(stats.totalAttempts).toBe(0);
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.backoffFactor).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(429);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toContain(500);
    });
  });
});
