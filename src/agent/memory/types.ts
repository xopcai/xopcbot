// Memory backend types and interfaces
import type { MemoryMatch } from '../prompt/memory/index.js';

// =============================================================================
// Types
// =============================================================================

export type MemoryCategory = 'preference' | 'fact' | 'decision' | 'entity' | 'other';

export interface MemoryEntry {
  id: string;
  text: string;
  vector: number[];
  importance: number;
  category: MemoryCategory;
  createdAt: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface MemoryBackendConfig {
  backend: 'builtin' | 'lancedb';
  // Builtin config
  maxResults?: number;
  minScore?: number;
  // LanceDB config
  lancedb?: {
    dbPath?: string;
    provider?: 'openai' | 'kimi' | 'voyage';
    apiKey?: string;
    model?: string;
    autoRecall?: boolean;
    autoCapture?: boolean;
    captureMaxChars?: number;
  };
}

export interface MemorySearchOptions {
  maxResults?: number;
  minScore?: number;
  sessionKey?: string;
}

export interface MemoryReadResult {
  path: string;
  text: string;
  lineNumbers?: { start: number; end: number };
  disabled?: boolean;
  error?: string;
}

// =============================================================================
// Memory Backend Interface
// =============================================================================

export interface MemoryBackend {
  /**
   * Search memories by semantic similarity
   */
  search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
  
  /**
   * Read a file from the memory workspace
   */
  readFile(params: { relPath: string; from?: number; lines?: number }): Promise<MemoryReadResult>;
  
  /**
   * Get backend status
   */
  status(): {
    backend: string;
    provider?: string;
    model?: string;
    fallback?: boolean;
    custom?: Record<string, unknown>;
  };
  
  /**
   * Store a new memory (for LanceDB backend)
   */
  store?(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry>;
  
  /**
   * Delete a memory (for LanceDB backend)
   */
  delete?(id: string): Promise<boolean>;
  
  /**
   * Sync index (for vector backends)
   */
  sync?(params?: { reason?: string; force?: boolean }): Promise<void>;
  
  /**
   * Close backend
   */
  close?(): Promise<void>;
}

// =============================================================================
// Memory Match Adapter
// Converts MemorySearchResult to legacy MemoryMatch format
// =============================================================================

export function toLegacyMemoryMatch(result: MemorySearchResult): MemoryMatch {
  return {
    file: result.entry.id,
    lines: result.entry.text,
    score: result.score,
    lineNumbers: [Math.floor(result.entry.createdAt / 1000)], // Use timestamp as pseudo line
  };
}
