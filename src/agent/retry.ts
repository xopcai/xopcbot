/**
 * Retry Module - Exponential backoff retry mechanism
 *
 * Provides resilient API calls with exponential backoff retry strategy.
 * Based on Forge's retry pattern and industry best practices.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('Retry');

export interface RetryConfig {
  maxAttempts: number;           // Maximum retry attempts (default: 3)
  initialDelayMs: number;        // Initial delay in ms (default: 1000)
  backoffFactor: number;         // Exponential backoff factor (default: 2)
  maxDelayMs: number;            // Maximum delay cap (default: 30000)
  retryableStatusCodes: number[]; // HTTP status codes to retry (default: [429, 500, 502, 503, 504])
  retryableErrors: string[];     // Error message patterns to retry (default: common network errors)
  onRetry?: (error: Error, attempt: number, delayMs: number) => void; // Callback on retry
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
  maxDelayMs: 30000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: [
    'timeout',
    'timed out',
    'etimedout',
    'econnreset',
    'econnrefused',
    'enotfound',
    'socket hang up',
    'network error',
    'temporary failure',
    'rate limit',
    'too many requests',
  ],
};

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

export interface RetryStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  totalDelayMs: number;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: initialDelay * (factor ^ attempt)
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  const delayWithJitter = exponentialDelay + jitter;

  // Cap at max delay
  return Math.min(delayWithJitter, config.maxDelayMs);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: Error, config: RetryConfig): boolean {
  const message = error.message.toLowerCase();

  // Check HTTP status codes in error message
  for (const code of config.retryableStatusCodes) {
    if (message.includes(` ${code} `) || message.includes(`status ${code}`)) {
      log.debug({ code, error: message }, 'Retryable HTTP status code detected');
      return true;
    }
  }

  // Check error message patterns
  for (const pattern of config.retryableErrors) {
    if (message.includes(pattern.toLowerCase())) {
      log.debug({ pattern, error: message }, 'Retryable error pattern detected');
      return true;
    }
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute operation with exponential backoff retry
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => callLLM(messages),
 *   { maxAttempts: 3, initialDelayMs: 1000 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error;
  let totalDelay = 0;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      const result = await operation();

      if (attempt > 0) {
        log.info(
          { attempts: attempt + 1, totalDelayMs: totalDelay },
          'Operation succeeded after retry'
        );
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === fullConfig.maxAttempts - 1) {
        log.error(
          { attempts: attempt + 1, error: lastError.message },
          'Operation failed after all retry attempts'
        );
        break;
      }

      if (!isRetryableError(lastError, fullConfig)) {
        log.warn(
          { error: lastError.message },
          'Non-retryable error, stopping retry'
        );
        throw lastError;
      }

      // Calculate delay for next attempt
      const delayMs = calculateDelay(attempt, fullConfig);
      totalDelay += delayMs;

      log.warn(
        {
          attempt: attempt + 1,
          maxAttempts: fullConfig.maxAttempts,
          delayMs,
          error: lastError.message.slice(0, 100),
        },
        'Operation failed, retrying with backoff'
      );

      // Call retry callback if provided
      fullConfig.onRetry?.(lastError, attempt + 1, delayMs);

      // Wait before retry
      await sleep(delayMs);
    }
  }

  throw lastError!;
}

/**
 * Execute operation with retry and return detailed result
 */
export async function retryWithResult<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error;
  let totalDelay = 0;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      const result = await operation();

      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalDelayMs: totalDelay,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === fullConfig.maxAttempts - 1 || !isRetryableError(lastError, fullConfig)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          totalDelayMs: totalDelay,
        };
      }

      const delayMs = calculateDelay(attempt, fullConfig);
      totalDelay += delayMs;
      fullConfig.onRetry?.(lastError, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError!,
    attempts: fullConfig.maxAttempts,
    totalDelayMs: totalDelay,
  };
}

/**
 * Create a retry wrapper for a function
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return retryWithBackoff(() => fn(...args), config);
  };
}

/**
 * Retry manager for tracking retry statistics
 */
export class RetryManager {
  private stats: RetryStats = {
    totalAttempts: 0,
    successfulRetries: 0,
    failedRetries: 0,
    totalDelayMs: 0,
  };

  /**
   * Execute with retry and track statistics
   */
  async execute<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const result = await retryWithResult(operation, config);

    this.stats.totalAttempts += result.attempts;
    this.stats.totalDelayMs += result.totalDelayMs;

    if (result.success) {
      if (result.attempts > 1) {
        this.stats.successfulRetries++;
      }
      return result.result!;
    } else {
      this.stats.failedRetries++;
      throw result.error!;
    }
  }

  /**
   * Get retry statistics
   */
  getStats(): RetryStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelayMs: 0,
    };
  }
}

// Convenience exports
export { DEFAULT_CONFIG as DEFAULT_RETRY_CONFIG };
