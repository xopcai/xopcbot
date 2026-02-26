// LanceDB Memory Backend Implementation
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { MemoryBackend, MemoryBackendConfig, MemoryEntry, MemoryReadResult, MemorySearchOptions, MemorySearchResult } from './types.js';

const TABLE_NAME = 'memories';

interface LanceDB {
  connect: (dbPath: string) => Promise<Connection>;
}

interface Connection {
  tableNames: () => Promise<string[]>;
  openTable: (name: string) => Promise<Table>;
  createTable: (name: string, data: unknown[]) => Promise<Table>;
}

interface Table {
  add: (data: MemoryEntry[]) => Promise<void>;
  vectorSearch: (vector: number[]) => { limit: (n: number) => { toArray: () => Promise<Row[]> } };
  delete: (filter: string) => Promise<void>;
  countRows: () => Promise<number>;
}

interface Row {
  _distance?: number;
  id: string;
  text: string;
  vector: number[];
  importance: number;
  category: string;
  createdAt: number;
}

// =============================================================================
// Embedding Providers
// =============================================================================

interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private baseURL = 'https://api.openai.com/v1';
  private model: string;

  constructor(private apiKey: string, model?: string) {
    this.model = model || 'text-embedding-3-small';
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }
}

class KimiEmbeddingProvider implements EmbeddingProvider {
  private baseURL = 'https://api.moonshot.cn/v1';
  private model: string;

  constructor(private apiKey: string, model?: string) {
    this.model = model || 'emb-text-256v1';
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Kimi embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }
}

// =============================================================================
// Vector Dimensions for Models
// =============================================================================

export function getVectorDim(provider: string, _model?: string): number {
  if (provider === 'kimi') {
    // emb-text-256v1 = 2560 dimensions
    return 2560;
  }
  // Default: text-embedding-3-small = 1536 dimensions
  return 1536;
}

// =============================================================================
// LanceDB Memory Backend
// =============================================================================

export class LanceDBMemoryBackend implements MemoryBackend {
  private db: Connection | null = null;
  private table: Table | null = null;
  private initPromise: Promise<void> | null = null;
  private embeddings: EmbeddingProvider;
  private vectorDim: number;

  constructor(
    private dbPath: string,
    private config: NonNullable<MemoryBackendConfig['lancedb']>,
  ) {
    this.vectorDim = getVectorDim(config.provider || 'openai', config.model);
    
    // Initialize embedding provider
    if (!config.apiKey) {
      throw new Error('LanceDB memory: API key is required');
    }
    
    switch (config.provider) {
      case 'kimi':
        this.embeddings = new KimiEmbeddingProvider(config.apiKey, config.model);
        break;
      default:
        this.embeddings = new OpenAIEmbeddingProvider(config.apiKey, config.model);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.table) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    // Dynamic import LanceDB
    let lancedb: LanceDB;
    try {
      const mod = await import('@lancedb/lancedb');
      lancedb = mod;
    } catch (err) {
      throw new Error(`LanceDB memory: failed to load LanceDB. Install with: npm install @lancedb/lancedb. Error: ${err}`);
    }

    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();

    if (tables.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    } else {
      // Create table with schema
      const schema = {
        id: '__schema__',
        text: '',
        vector: Array.from({ length: this.vectorDim }).fill(0),
        importance: 0,
        category: 'other',
        createdAt: 0,
      };
      this.table = await this.db.createTable(TABLE_NAME, [schema]);
      // Delete schema placeholder
      await this.table.delete('id = "__schema__"');
    }
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();

    const { maxResults = 5, minScore = 0.3 } = options;

    const vector = await this.embeddings.embed(query);
    const results = await this.table!.vectorSearch(vector)
      .limit(maxResults * 2) // Get more to filter
      .toArray();

    // Convert L2 distance to similarity score
    const mapped: MemorySearchResult[] = results.map((row) => {
      const distance = row._distance ?? 0;
      // sim = 1 / (1 + d)
      const score = 1 / (1 + distance);
      return {
        entry: {
          id: row.id,
          text: row.text,
          vector: row.vector,
          importance: row.importance,
          category: row.category as MemoryEntry['category'],
          createdAt: row.createdAt,
        },
        score,
      };
    });

    return mapped.filter((r) => r.score >= minScore).slice(0, maxResults);
  }

  async readFile(_params: { relPath: string; from?: number; lines?: number }): Promise<MemoryReadResult> {
    // LanceDB backend doesn't support file reading in the traditional sense
    // Return empty result - this is used for the legacy memory_get tool compatibility
    return {
      path: _params.relPath,
      text: '',
      error: 'LanceDB backend: file reading not supported',
      disabled: true,
    };
  }

  status() {
    return {
      backend: 'lancedb',
      provider: this.config.provider || 'openai',
      model: this.config.model || 'text-embedding-3-small',
    };
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
    await this.ensureInitialized();

    // Compute embedding if not provided
    let vector = entry.vector;
    if (!vector || vector.length === 0) {
      vector = await this.embeddings.embed(entry.text);
    }

    const fullEntry: MemoryEntry = {
      ...entry,
      vector,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    await this.table!.add([fullEntry]);
    return fullEntry;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new Error(`Invalid memory ID: ${id}`);
    }
    
    await this.table!.delete(`id = '${id}'`);
    return true;
  }

  async close(): Promise<void> {
    this.db = null;
    this.table = null;
    this.initPromise = null;
  }
}

// =============================================================================
// Backend Factory
// =============================================================================

export async function createMemoryBackend(
  config: MemoryBackendConfig,
  workspaceDir: string,
): Promise<MemoryBackend> {
  if (config.backend === 'lancedb' && config.lancedb) {
    const dbPath = config.lancedb.dbPath || path.join(workspaceDir, '.memory', 'lancedb');
    return new LanceDBMemoryBackend(dbPath, config.lancedb);
  }

  // Default: return builtin (fuzzy search) - import from existing memory
  const { memorySearch, memoryGet } = await import('../prompt/memory/index.js');
  
  return {
    async search(query: string, options: MemorySearchOptions = {}) {
      const { maxResults = 5, minScore = 0.3 } = options;
      const legacyResults = await memorySearch(workspaceDir, query, { maxResults, minScore });
      
      // Convert legacy format to new format
      return legacyResults.map((r) => ({
        entry: {
          id: r.file,
          text: r.lines,
          vector: [],
          importance: r.score,
          category: 'other' as const,
          createdAt: Date.now(),
        },
        score: r.score,
      }));
    },

    async readFile(params) {
      const result = memoryGet(workspaceDir, params.relPath, params.from, params.lines);
      if (!result) {
        return { path: params.relPath, text: '', error: 'File not found' };
      }
      return {
        path: params.relPath,
        text: result.content,
        lineNumbers: result.lineNumbers,
      };
    },

    status() {
      return { backend: 'builtin', provider: 'fuzzy', model: 'simple' };
    },
  };
}
