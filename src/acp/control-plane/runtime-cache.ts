/**
 * ACP Runtime Cache
 *
 * Caches ACP runtime handles with TTL-based eviction.
 */

import type { CachedRuntimeState } from '../manager.types.js';

type CacheEntry = {
  state: CachedRuntimeState;
  lastTouchedAt: number;
};

export class RuntimeCache {
  private cache = new Map<string, CacheEntry>();

  get(actorKey: string): CachedRuntimeState | null {
    const entry = this.cache.get(actorKey);
    if (!entry) return null;
    entry.lastTouchedAt = Date.now();
    return entry.state;
  }

  peek(actorKey: string): CachedRuntimeState | null {
    const entry = this.cache.get(actorKey);
    return entry?.state ?? null;
  }

  set(actorKey: string, state: CachedRuntimeState): void {
    this.cache.set(actorKey, {
      state,
      lastTouchedAt: Date.now(),
    });
  }

  clear(actorKey: string): void {
    this.cache.delete(actorKey);
  }

  has(actorKey: string): boolean {
    return this.cache.has(actorKey);
  }

  size(): number {
    return this.cache.size;
  }

  getLastTouchedAt(actorKey: string): number | undefined {
    return this.cache.get(actorKey)?.lastTouchedAt;
  }

  collectIdleCandidates(params: { maxIdleMs: number; now: number }): Array<{
    actorKey: string;
    state: CachedRuntimeState;
  }> {
    const candidates: Array<{ actorKey: string; state: CachedRuntimeState }> = [];
    for (const [actorKey, entry] of this.cache) {
      if (params.now - entry.lastTouchedAt >= params.maxIdleMs) {
        candidates.push({ actorKey, state: entry.state });
      }
    }
    return candidates;
  }

  clearAll(): void {
    this.cache.clear();
  }
}
