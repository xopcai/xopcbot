/**
 * Simple cache utility with TTL support
 */

import { createLogger } from './internal-logger.js';

const log = createLogger('HarborCache');

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export interface CacheOptions {
  defaultTtlMs?: number;
  maxSize?: number;
}

export class HarborCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTtlMs: number;
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs || 60 * 1000; // 1 minute default
    this.maxSize = options.maxSize || 100;
  }

  /**
   * Get cached value
   * Returns undefined if not found or expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttlMs) {
      log.debug({ key, age: Math.round(age / 1000) }, 'Cache entry expired');
      this.cache.delete(key);
      return undefined;
    }

    log.debug({ key, age: Math.round(age / 1000) }, 'Cache hit');
    return entry.data;
  }

  /**
   * Set cached value
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        log.debug({ key: oldestKey }, 'Cache eviction (max size reached)');
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs: ttlMs || this.defaultTtlMs,
    });

    log.debug({ key, ttlMs: ttlMs || this.defaultTtlMs }, 'Cache set');
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    log.debug({ key }, 'Cache invalidated');
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    log.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    const now = Date.now();
    const validEntries: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp <= entry.ttlMs) {
        validEntries.push(key);
      } else {
        this.cache.delete(key);
      }
    }

    return {
      size: validEntries.length,
      keys: validEntries,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned up expired cache entries');
    }

    return cleaned;
  }
}
