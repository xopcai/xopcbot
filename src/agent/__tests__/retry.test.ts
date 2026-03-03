import { describe, it, expect, vi } from 'vitest';
import {
  retryWithBackoff,
  retryWithResult,
  withRetry,
  RetryManager,
  DEFAULT_RETRY_CONFIG,
} from '../retry.js';

describe('Retry Module', () => {
  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(operation, { maxAttempts: 3 });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const result = await retryWithBackoff(operation, { 
        maxAttempts: 3, 
        initialDelayMs: 10 
      });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      
      await expect(
        retryWithBackoff(operation, { 
          maxAttempts: 3, 
          initialDelayMs: 10 
        })
      ).rejects.toThrow('timeout');
      
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable error', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('not found'));
      
      await expect(
        retryWithBackoff(operation, { maxAttempts: 3 })
      ).rejects.toThrow('not found');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');
      
      const onRetry = vi.fn((_, __, delayMs) => {
        delays.push(delayMs);
      });
      
      await retryWithBackoff(operation, { 
        maxAttempts: 3, 
        initialDelayMs: 100,
        backoffFactor: 2,
        onRetry,
      });
      
      expect(delays.length).toBe(2);
      // Second delay should be roughly 2x the first (with some jitter tolerance)
      // Jitter is ±25%, so second delay should be between 1.5x and 2.5x
      expect(delays[1]).toBeGreaterThan(delays[0] * 1.2);
      expect(delays[1]).toBeLessThan(delays[0] * 3);
    });
  });

  describe('retryWithResult', () => {
    it('should return success result', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await retryWithResult(operation, { maxAttempts: 3 });
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
    });

    it('should return failure result', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fatal'));
      
      const result = await retryWithResult(operation, { maxAttempts: 3 });
      
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
      
      const wrapped = withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
      
      const result = await wrapped('arg1', 'arg2');
      
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
      
      await manager.execute(operation1, { maxAttempts: 3, initialDelayMs: 10 });
      await manager.execute(operation2, { maxAttempts: 3 });
      
      const stats = manager.getStats();
      
      expect(stats.totalAttempts).toBe(3); // 2 for first, 1 for second
      expect(stats.successfulRetries).toBe(1);
    });

    it('should reset statistics', async () => {
      const manager = new RetryManager();
      
      await manager.execute(() => Promise.resolve('success'), { maxAttempts: 3 });
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
