// Memory tools factory - creates tools based on configuration
import { Type, type Static } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { memorySearch, memoryGet } from '../prompt/memory/index.js';
import type { MemoryBackendConfig } from '../memory/types.js';
import { createMemoryBackend, type MemoryBackend } from '../memory/lancedb.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('memory-tools');

// =============================================================================
// Backend Cache
// =============================================================================

const backendCache = new Map<string, MemoryBackend>();
const configCache = new Map<string, MemoryBackendConfig>();

function getCacheKey(workspaceDir: string, config?: MemoryBackendConfig): string {
  return workspaceDir + (config ? JSON.stringify(config) : '');
}

async function getOrCreateBackend(workspaceDir: string, config?: MemoryBackendConfig): Promise<MemoryBackend | null> {
  const key = getCacheKey(workspaceDir, config);
  
  // Check if config changed
  const existingConfig = configCache.get(key);
  if (existingConfig && JSON.stringify(existingConfig) !== JSON.stringify(config)) {
    const oldBackend = backendCache.get(key);
    if (oldBackend?.close) {
      await oldBackend.close();
    }
    backendCache.delete(key);
    configCache.delete(key);
  }

  let backend = backendCache.get(key);
  if (!backend && config) {
    try {
      backend = await createMemoryBackend(config, workspaceDir);
      backendCache.set(key, backend);
      configCache.set(key, config);
      log.info({ backend: config.backend }, 'Memory backend initialized');
    } catch (err) {
      log.error({ err }, 'Failed to create memory backend');
      return null;
    }
  }
  
  return backend ?? null;
}

// =============================================================================
// Schema Definitions
// =============================================================================

const MemorySearchSchema = Type.Object({
  query: Type.String(),
  maxResults: Type.Optional(Type.Number()),
  minScore: Type.Optional(Type.Number()),
});

const MemoryGetSchema = Type.Object({
  path: Type.String(),
  from: Type.Optional(Type.Number()),
  lines: Type.Optional(Type.Number()),
});

const MemoryStoreSchema = Type.Object({
  text: Type.String(),
  importance: Type.Optional(Type.Number()),
  category: Type.Optional(Type.Union([
    Type.Literal('preference'),
    Type.Literal('fact'),
    Type.Literal('decision'),
    Type.Literal('entity'),
    Type.Literal('other'),
  ])),
});

const MemoryForgetSchema = Type.Object({
  memoryId: Type.String(),
});

// =============================================================================
// Builtin Memory Tools (Fuzzy Search)
// =============================================================================

function createBuiltinMemorySearchTool(workspaceDir: string): AgentTool<typeof MemorySearchSchema, {}> {
  return {
    name: 'memory_search',
    label: '🔍 Memory Search',
    description: 'Mandatory recall step: semantically search MEMORY.md + memory/*.md before answering questions about prior work, decisions, dates, people, preferences, or todos; returns top snippets with path + lines.',
    parameters: MemorySearchSchema,

    async execute(
      _toolCallId: string,
      params: Static<typeof MemorySearchSchema>,
      _signal?: AbortSignal
    ): Promise<AgentToolResult<{}>> {
      const { query, maxResults = 5, minScore = 0.3 } = params;

      try {
        const results = await memorySearch(workspaceDir, query, { maxResults, minScore });
        const withCitations = results.map(entry => ({
          ...entry,
          citation: `${entry.file}#L${entry.lineNumbers[0]}${entry.lineNumbers.length > 1 ? `-L${entry.lineNumbers[entry.lineNumbers.length - 1]}` : ''}`,
          snippet: `${entry.lines.trim()}\n\nSource: ${entry.file}#L${entry.lineNumbers[0]}${entry.lineNumbers.length > 1 ? `-L${entry.lineNumbers[entry.lineNumbers.length - 1]}` : ''}`,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify({ results: withCitations, provider: 'fuzzy' }, null, 2) }],
          details: { results: withCitations, backend: 'builtin' },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Search error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

function createBuiltinMemoryGetTool(workspaceDir: string): AgentTool<typeof MemoryGetSchema, {}> {
  return {
    name: 'memory_get',
    label: '📄 Memory Get',
    description: 'Safe snippet read from MEMORY.md or memory/*.md with optional from/lines; use after memory_search to pull only the needed lines and keep context small.',
    parameters: MemoryGetSchema,

    async execute(
      _toolCallId: string,
      params: Static<typeof MemoryGetSchema>,
      _signal?: AbortSignal
    ): Promise<AgentToolResult<{}>> {
      const { path, from, lines } = params;

      try {
        const result = memoryGet(workspaceDir, path, from, lines);
        if (!result) {
          return {
            content: [{ type: 'text', text: `File not found: ${path}` }],
            details: { path, text: '' },
          };
        }
        return {
          content: [{ type: 'text', text: result.content }],
          details: { path, text: result.content, lineNumbers: result.lineNumbers },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Read error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

// =============================================================================
// LanceDB Memory Tools (Vector Search)
// =============================================================================

function createLanceDBMemorySearchTool(workspaceDir: string, config: NonNullable<MemoryBackendConfig['lancedb']>): AgentTool<typeof MemorySearchSchema, {}> {
  const backendConfig: MemoryBackendConfig = { backend: 'lancedb', lancedb: config };
  
  return {
    name: 'memory_search',
    label: '🔍 Memory Search',
    description: 'Semantic vector search through long-term memories. Searches by meaning, not just keywords.',
    parameters: MemorySearchSchema,

    async execute(
      _toolCallId: string,
      params: Static<typeof MemorySearchSchema>,
      _signal?: AbortSignal
    ): Promise<AgentToolResult<{}>> {
      const { query, maxResults = 5, minScore = 0.3 } = params;

      try {
        const backend = await getOrCreateBackend(workspaceDir, backendConfig);
        
        if (!backend) {
          return {
            content: [{ type: 'text', text: 'Memory backend unavailable. Please check configuration.' }],
            details: { error: 'backend_unavailable', backend: 'lancedb' },
          };
        }

        const results = await backend.search(query, { maxResults, minScore });
        const status = backend.status();
        
        const withCitations = results.map((entry) => ({
          file: entry.entry.id,
          lines: entry.entry.text,
          score: entry.score,
          lineNumbers: [1],
          category: entry.entry.category,
          importance: entry.entry.importance,
          citation: `[${entry.entry.category}] ${entry.entry.text.slice(0, 80)}...`,
          snippet: `${entry.entry.text}\n\nSource: memory:${entry.entry.id}`,
        }));

        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              results: withCitations, 
              provider: status.provider || 'lancedb',
              model: status.model,
              backend: status.backend,
            }, null, 2) 
          }],
          details: { results: withCitations, backend: status.backend },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Search error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

function createLanceDBMemoryGetTool(workspaceDir: string, config: NonNullable<MemoryBackendConfig['lancedb']>): AgentTool<typeof MemoryGetSchema, {}> {
  const backendConfig: MemoryBackendConfig = { backend: 'lancedb', lancedb: config };
  
  return {
    name: 'memory_get',
    label: '📄 Memory Get',
    description: 'Read a specific memory by ID (for LanceDB backend).',
    parameters: MemoryGetSchema,

    async execute(
      _toolCallId: string,
      params: Static<typeof MemoryGetSchema>,
      _signal?: AbortSignal
    ): Promise<AgentToolResult<{}>> {
      const { path } = params; // path = memory ID for LanceDB

      try {
        const backend = await getOrCreateBackend(workspaceDir, backendConfig);
        
        if (!backend) {
          return {
            content: [{ type: 'text', text: 'Memory backend unavailable' }],
            details: { disabled: true },
          };
        }

        const result = await backend.readFile({ relPath: path });
        
        if (result.disabled || result.error) {
          return {
            content: [{ type: 'text', text: result.error || 'Read unavailable' }],
            details: { path, text: '', disabled: true },
          };
        }
        
        return {
          content: [{ type: 'text', text: result.text }],
          details: { path, text: result.text },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Read error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

function createLanceDBMemoryStoreTool(workspaceDir: string, config: NonNullable<MemoryBackendConfig['lancedb']>): AgentTool<typeof MemoryStoreSchema, {}> {
  const backendConfig: MemoryBackendConfig = { backend: 'lancedb', lancedb: config };
  
  return {
    name: 'memory_store',
    label: '💾 Memory Store',
    description: 'Save important information in long-term memory. Use for preferences, facts, decisions.',
    parameters: MemoryStoreSchema,

    async execute(
      _toolCallId: string,
      params: Static<typeof MemoryStoreSchema>,
      _signal?: AbortSignal
    ): Promise<AgentToolResult<{}>> {
      const { text, importance = 0.7, category = 'other' } = params;

      try {
        const backend = await getOrCreateBackend(workspaceDir, backendConfig);
        
        if (!backend || !backend.store) {
          return {
            content: [{ type: 'text', text: 'Memory store not available' }],
            details: { error: 'not_supported' },
          };
        }

        const entry = await backend.store({ text, vector: [], importance, category });
        
        return {
          content: [{ type: 'text', text: `Stored: "${text.slice(0, 50)}..." (id: ${entry.id})` }],
          details: { action: 'created', id: entry.id },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Store error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

function createLanceDBMemoryForgetTool(workspaceDir: string, config: NonNullable<MemoryBackendConfig['lancedb']>): AgentTool<typeof MemoryForgetSchema, {}> {
  const backendConfig: MemoryBackendConfig = { backend: 'lancedb', lancedb: config };
  
  return {
    name: 'memory_forget',
    label: '🗑️ Memory Forget',
    description: 'Delete a specific memory by ID.',
    parameters: MemoryForgetSchema,

    async execute(
      _toolCallId: string,
      params: Static<typeof MemoryForgetSchema>,
      _signal?: AbortSignal
    ): Promise<AgentToolResult<{}>> {
      const { memoryId } = params;

      try {
        const backend = await getOrCreateBackend(workspaceDir, backendConfig);
        
        if (!backend || !backend.delete) {
          return {
            content: [{ type: 'text', text: 'Memory delete not available' }],
            details: { error: 'not_supported' },
          };
        }

        await backend.delete(memoryId);
        
        return {
          content: [{ type: 'text', text: `Memory ${memoryId} forgotten.` }],
          details: { action: 'deleted', id: memoryId },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Delete error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

// =============================================================================
// Factory Functions
// =============================================================================

export interface MemoryToolsOptions {
  workspaceDir: string;
  backendConfig?: MemoryBackendConfig;
}

/**
 * Creates memory search tool based on configuration
 */
export function createMemorySearchTool(options: MemoryToolsOptions): AgentTool<typeof MemorySearchSchema, {}> {
  const { workspaceDir, backendConfig } = options;
  
  if (backendConfig?.backend === 'lancedb' && backendConfig.lancedb?.apiKey) {
    return createLanceDBMemorySearchTool(workspaceDir, backendConfig.lancedb);
  }
  
  return createBuiltinMemorySearchTool(workspaceDir);
}

/**
 * Creates memory get tool based on configuration
 */
export function createMemoryGetTool(options: MemoryToolsOptions): AgentTool<typeof MemoryGetSchema, {}> {
  const { workspaceDir, backendConfig } = options;
  
  if (backendConfig?.backend === 'lancedb' && backendConfig.lancedb?.apiKey) {
    return createLanceDBMemoryGetTool(workspaceDir, backendConfig.lancedb);
  }
  
  return createBuiltinMemoryGetTool(workspaceDir);
}

/**
 * Creates memory store tool - only available for LanceDB backend
 * Returns null if not configured
 */
export function createMemoryStoreTool(options: MemoryToolsOptions): AgentTool<typeof MemoryStoreSchema, {}> | null {
  const { workspaceDir, backendConfig } = options;
  
  if (backendConfig?.backend === 'lancedb' && backendConfig.lancedb?.apiKey) {
    return createLanceDBMemoryStoreTool(workspaceDir, backendConfig.lancedb);
  }
  
  return null;
}

/**
 * Creates memory forget tool - only available for LanceDB backend
 * Returns null if not configured
 */
export function createMemoryForgetTool(options: MemoryToolsOptions): AgentTool<typeof MemoryForgetSchema, {}> | null {
  const { workspaceDir, backendConfig } = options;
  
  if (backendConfig?.backend === 'lancedb' && backendConfig.lancedb?.apiKey) {
    return createLanceDBMemoryForgetTool(workspaceDir, backendConfig.lancedb);
  }
  
  return null;
}

/**
 * Check if LanceDB backend is properly configured
 */
export function isLanceDBConfigured(config?: MemoryBackendConfig): boolean {
  return config?.backend === 'lancedb' && !!config.lancedb?.apiKey;
}

// =============================================================================
// Auto-Recall Functions
// =============================================================================

/**
 * Performs auto-recall: searches memory and returns formatted context string
 * to be injected into agent context
 */
export async function performAutoRecall(
  workspaceDir: string,
  prompt: string,
  config: MemoryBackendConfig
): Promise<{ context: string; count: number } | null> {
  // Only work with LanceDB backend for auto-recall
  if (config.backend !== 'lancedb' || !config.lancedb?.apiKey) {
    return null;
  }

  // Check if auto-recall is enabled
  if (!config.lancedb.autoRecall) {
    return null;
  }

  try {
    const backendConfig: MemoryBackendConfig = { backend: 'lancedb', lancedb: config.lancedb };
    const backend = await getOrCreateBackend(workspaceDir, backendConfig);
    
    if (!backend) {
      log.warn('Auto-recall: backend unavailable');
      return null;
    }

    // Search with higher threshold to avoid noise
    const results = await backend.search(prompt, { 
      maxResults: 3, 
      minScore: 0.4  // Higher threshold for auto-recall
    });

    if (results.length === 0) {
      return null;
    }

    // Format as context
    const memories = results.map((r, i) => 
      `${i + 1}. [${r.entry.category}] ${r.entry.text}`
    ).join('\n');

    const context = `<relevant-memories>
The following memories may be relevant to this conversation:
${memories}
</relevant-memories>`;

    log.info({ count: results.length, scores: results.map(r => r.score) }, 'Auto-recall: injected memories');

    return { context, count: results.length };
  } catch (err) {
    log.error({ err }, 'Auto-recall failed');
    return null;
  }
}

/**
 * Check if auto-recall is enabled in config
 */
export function isAutoRecallEnabled(config?: MemoryBackendConfig): boolean {
  return config?.backend === 'lancedb' && config.lancedb?.autoRecall === true;
}

// =============================================================================
// Auto-Capture Functions
// =============================================================================

// Trigger patterns for detecting important information
const MEMORY_TRIGGERS = [
  /zapamatuj si|pamatuj|remember/i,
  /preferuji|radši|nechci|prefer/i,
  /rozhodli jsme|budeme používat/i,
  /decided|will use|going to|i'll|i will/i,
  /\+\d{10,}/,  // Phone numbers
  /[\w.-]+@[\w.-]+\.\w+/,  // Emails
  /můj\s+\w+\s+je|je\s+můj/i,  // "my X is Y" in Czech
  /my\s+\w+\s+(is|called|name)/i,  // "my X is Y" in English
  /i (like|prefer|hate|love|want|need)/i,
  /always|never|important/i,
];

// Patterns to skip (likely not important)
const SKIP_PATTERNS = [
  /^[\s]*$/,  // Empty
  /^[\s]*$/,  // Just whitespace
  /^(hi|hello|hey|thanks|thank you)/i,  // Greetings
];

// Prompt injection detection
const PROMPT_INJECTION_PATTERNS = [
  /ignore (all|any|previous|above|prior) instructions/i,
  /do not follow (the )?(system|developer)/i,
  /system prompt/i,
  /developer message/i,
  /<\s*(system|assistant|developer|tool|function)\b/i,
];

/**
 * Check if text looks like a prompt injection attempt
 */
function looksLikePromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Detect category of the memory text
 */
export function detectCategory(text: string): MemoryCategory {
  const lower = text.toLowerCase();
  
  // Entity (names, contacts) - check first to prioritize specific patterns
  if (/\+\d{10,}|@[\w.-]+\.\w+|is called|jmenuje se|call (her|him)|wife|husband|dad|mom|friend|name is/i.test(lower)) {
    return 'entity';
  }
  
  // Preference
  if (/prefer|radši|like|love|hate|want|don't like/i.test(lower)) {
    return 'preference';
  }
  
  // Decision
  if (/rozhodli|decided|will use|budeme|let's|i will|going to/i.test(lower)) {
    return 'decision';
  }
  
  // Fact
  if (/is |are |has |have |je |má |jsou/i.test(lower)) {
    return 'fact';
  }
  
  return 'other';
}

/**
 * Determine if a message should be captured as a memory
 */
export function shouldCaptureMemory(
  text: string,
  options?: { maxChars?: number; minChars?: number }
): boolean {
  const maxChars = options?.maxChars ?? 2000;
  const minChars = options?.minChars ?? 10;
  
  // Length check
  if (text.length < minChars || text.length > maxChars) {
    return false;
  }
  
  // Skip empty
  if (!text.trim()) {
    return false;
  }
  
  // Skip prompt injection
  if (looksLikePromptInjection(text)) {
    return false;
  }
  
  // Skip short greetings
  if (SKIP_PATTERNS[0].test(text) || SKIP_PATTERNS[1].test(text) || SKIP_PATTERNS[2].test(text)) {
    return false;
  }
  
  // Check if matches trigger patterns
  return MEMORY_TRIGGERS.some(pattern => pattern.test(text));
}

/**
 * Extract text content from messages (handles various message formats)
 */
function extractUserMessages(messages: unknown[]): string[] {
  const texts: string[] = [];
  
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    
    const msgObj = msg as Record<string, unknown>;
    const role = msgObj.role;
    
    // Only process user messages
    if (role !== 'user') continue;
    
    const content = msgObj.content;
    
    // String content
    if (typeof content === 'string') {
      texts.push(content);
      continue;
    }
    
    // Array content (content blocks)
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          'type' in block &&
          (block as Record<string, unknown>).type === 'text' &&
          'text' in block &&
          typeof (block as Record<string, unknown>).text === 'string'
        ) {
          texts.push((block as Record<string, unknown>).text as string);
        }
      }
    }
  }
  
  return texts;
}

/**
 * Performs auto-capture: analyzes messages and stores important info
 */
export async function performAutoCapture(
  workspaceDir: string,
  messages: unknown[],
  config: MemoryBackendConfig
): Promise<{ captured: number; skipped: number }> {
  // Only work with LanceDB backend
  if (config.backend !== 'lancedb' || !config.lancedb?.apiKey) {
    return { captured: 0, skipped: 0 };
  }

  // Check if auto-capture is enabled
  if (!config.lancedb.autoCapture) {
    return { captured: 0, skipped: 0 };
  }

  const maxChars = config.lancedb.captureMaxChars ?? 2000;
  const backendConfig: MemoryBackendConfig = { backend: 'lancedb', lancedb: config.lancedb };

  try {
    const backend = await getOrCreateBackend(workspaceDir, backendConfig);
    
    if (!backend || !backend.store) {
      log.warn('Auto-capture: backend unavailable');
      return { captured: 0, skipped: 0 };
    }

    // Extract user messages
    const userMessages = extractUserMessages(messages);
    
    if (userMessages.length === 0) {
      return { captured: 0, skipped: 0 };
    }

    let captured = 0;
    let skipped = 0;
    const maxCapture = 3;  // Limit captures per conversation

    for (const text of userMessages) {
      if (captured >= maxCapture) break;
      
      // Check if should capture
      if (!shouldCaptureMemory(text, { maxChars })) {
        skipped++;
        continue;
      }

      // Detect category
      const category = detectCategory(text);

      // Check for duplicates (high similarity)
      try {
        const existing = await backend.search(text, { maxResults: 1, minScore: 0.95 });
        if (existing.length > 0) {
          skipped++;
          log.debug({ text: text.slice(0, 30) }, 'Auto-capture: duplicate detected, skipping');
          continue;
        }
      } catch {
        // Search failed, proceed with storing
      }

      // Store the memory
      await backend.store({
        text,
        vector: [],  // Backend will compute embedding
        importance: 0.7,
        category,
      });

      captured++;
      log.info({ category, text: text.slice(0, 30) }, 'Auto-capture: stored memory');
    }

    if (captured > 0) {
      log.info({ captured, skipped }, 'Auto-capture: complete');
    }

    return { captured, skipped };
  } catch (err) {
    log.error({ err }, 'Auto-capture failed');
    return { captured: 0, skipped: 0 };
  }
}

/**
 * Check if auto-capture is enabled in config
 */
export function isAutoCaptureEnabled(config?: MemoryBackendConfig): boolean {
  return config?.backend === 'lancedb' && config.lancedb?.autoCapture === true;
}
