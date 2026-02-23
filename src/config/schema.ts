import { z } from 'zod';
import { homedir } from 'os';

// ============================================
// OpenClaw-Style Model Configuration
// ============================================

// Model cost schema
export const ModelCostSchema = z.object({
  input: z.number().default(0),
  output: z.number().default(0),
  cacheRead: z.number().default(0),
  cacheWrite: z.number().default(0),
});

// Model definition in providers
export const ModelDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean().default(false),
  input: z.array(z.enum(['text', 'image'])).default(['text']),
  cost: ModelCostSchema.default({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
  contextWindow: z.number().default(128000),
  maxTokens: z.number().default(16384),
});

// Provider configuration (OpenClaw-style)
export const ProviderConfigSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  api: z.enum([
    'openai-completions',
    'openai-responses',
    'anthropic-messages',
    'google-generative-ai',
    'github-copilot',
    'bedrock-converse-stream',
  ]).optional(),
  models: z.array(ModelDefSchema).optional(),
});

// Models configuration (OpenClaw-style models.providers)
export const ModelsConfigSchema = z.object({
  mode: z.enum(['merge', 'replace']).default('merge'),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
});

// Model alias configuration
export const ModelAliasSchema = z.object({
  alias: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

// Model selection with fallbacks
export const ModelSelectionSchema = z.union([
  z.string(),
  z.object({
    primary: z.string(),
    fallbacks: z.array(z.string()).optional(),
  }),
]);

// ============================================
// Agent Configs
// ============================================

export const AgentDefaultsSchema = z.object({
  workspace: z.string().default('~/.xopcbot/workspace'),
  // Model selection: string or { primary, fallbacks }
  model: ModelSelectionSchema.default('anthropic/claude-sonnet-4-5'),
  // Model aliases map: { "provider/model": { alias: "shortname" } }
  models: z.record(z.string(), ModelAliasSchema).default({}),
  // Image model configuration
  imageModel: ModelSelectionSchema.optional(),
  maxTokens: z.number().default(8192),
  temperature: z.number().default(0.7),
  maxToolIterations: z.number().default(20),
  compaction: z.object({
    enabled: z.boolean().default(true),
    mode: z.enum(['default', 'safeguard']).default('default'),
    reserveTokens: z.number().default(8000),
    triggerThreshold: z.number().min(0.5).max(0.95).default(0.8),
    minMessagesBeforeCompact: z.number().default(10),
    keepRecentMessages: z.number().default(5),
  }).optional(),
  pruning: z.object({
    enabled: z.boolean().default(true),
    maxToolResultChars: z.number().default(10000),
    headKeepRatio: z.number().default(0.3),
    tailKeepRatio: z.number().default(0.3),
  }).optional(),
});

export const AgentsConfigSchema = z.object({
  defaults: AgentDefaultsSchema.default({}),
});

// ============================================
// Channel Configs
// ============================================

export const TelegramTopicConfigSchema = z.object({
  topicId: z.string(),
  requireMention: z.boolean().optional(),
  enabled: z.boolean().optional(),
  allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  systemPrompt: z.string().optional(),
});

export const TelegramGroupConfigSchema = z.object({
  groupId: z.string(),
  requireMention: z.boolean().optional(),
  enabled: z.boolean().optional(),
  allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  systemPrompt: z.string().optional(),
  topics: z.record(z.string(), TelegramTopicConfigSchema).optional(),
});

export const TelegramAccountConfigSchema = z.object({
  accountId: z.string(),
  name: z.string().optional(),
  enabled: z.boolean().default(true),
  token: z.string().default(''),
  tokenFile: z.string().optional(),
  allowFrom: z.array(z.union([z.string(), z.number()])).default([]),
  groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  dmPolicy: z.enum(['pairing', 'allowlist', 'open', 'disabled']).default('pairing'),
  groupPolicy: z.enum(['open', 'disabled', 'allowlist']).default('open'),
  replyToMode: z.enum(['off', 'first', 'all']).default('off'),
  groups: z.record(z.string(), TelegramGroupConfigSchema).optional(),
  historyLimit: z.number().default(50),
  textChunkLimit: z.number().default(4000),
  streamMode: z.enum(['off', 'partial', 'block']).default('partial'),
  proxy: z.string().optional(),
  apiRoot: z.string().optional(),
});

export const TelegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().default(''),
  allowFrom: z.array(z.union([z.string(), z.number()])).default([]),
  apiRoot: z.string().optional(),
  debug: z.boolean().default(false),
  accounts: z.record(z.string(), TelegramAccountConfigSchema).optional(),
  dmPolicy: z.enum(['pairing', 'allowlist', 'open', 'disabled']).default('pairing'),
  groupPolicy: z.enum(['open', 'disabled', 'allowlist']).default('open'),
});

export const WhatsAppConfigSchema = z.object({
  enabled: z.boolean().default(false),
  bridgeUrl: z.string().default('ws://localhost:3001'),
  allowFrom: z.array(z.string()).default([]),
});

export const ChannelsConfigSchema = z.object({
  telegram: TelegramConfigSchema.default({}),
  whatsapp: WhatsAppConfigSchema.default({}),
});

// ============================================
// Tools Config
// ============================================

export const WebSearchConfigSchema = z.object({
  apiKey: z.string().default(''),
  maxResults: z.number().default(5),
});

export const ToolsConfigSchema = z.object({
  web: z.object({
    search: WebSearchConfigSchema.default({}),
  }).default({}),
});

// ============================================
// Gateway Config
// ============================================

export const GatewayAuthSchema = z.object({
  mode: z.enum(['none', 'token']).default('token'),
  token: z.string().optional(),
});

export const GatewayConfigSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().default(18790),
  auth: GatewayAuthSchema.default({}),
  heartbeat: z.object({
    enabled: z.boolean().default(true),
    intervalMs: z.number().default(60000),
  }).default({}),
  maxSseConnections: z.number().default(100),
  corsOrigins: z.array(z.string()).default(['*']),
});

// ============================================
// Other Configs
// ============================================

export const CronConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxConcurrentJobs: z.number().default(5),
  defaultTimezone: z.string().default('UTC'),
  historyRetentionDays: z.number().default(7),
  enableMetrics: z.boolean().default(true),
});

export const ModelsDevConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

export const PluginsConfigSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.array(z.string()), z.record(z.string(), z.unknown())])
).default({});

// ============================================
// Root Config (OpenClaw-Style)
// ============================================

export const ConfigSchema = z.object({
  agents: AgentsConfigSchema.default({}),
  channels: ChannelsConfigSchema.default({}),
  // OpenClaw-style models configuration
  models: ModelsConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  tools: ToolsConfigSchema.default({}),
  cron: CronConfigSchema.default({}),
  plugins: PluginsConfigSchema,
  modelsDev: ModelsDevConfigSchema.default({}),
});

// ============================================
// Type Exports
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type AgentDefaults = z.infer<typeof AgentDefaultsSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ModelDef = z.infer<typeof ModelDefSchema>;
export type ModelAlias = z.infer<typeof ModelAliasSchema>;
export type ModelSelection = z.infer<typeof ModelSelectionSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

// ============================================
// Environment Variable Substitution
// ============================================

/**
 * Resolve environment variables in config values.
 * Supports ${VAR_NAME} syntax.
 */
export function resolveEnvVars(value: string): string {
  const match = /^\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(value);
  if (match) {
    const envValue = process.env[match[1]];
    if (envValue) return envValue;
    throw new Error(`Environment variable ${match[1]} is not set`);
  }
  return value;
}

/**
 * Recursively resolve environment variables in an object.
 */
export function resolveEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsInObject) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsInObject(value);
    }
    return result as unknown as T;
  }
  return obj;
}

// ============================================
// Helper Functions
// ============================================

export interface ParsedModelRef {
  provider: string;
  model: string;
}

export function parseModelRef(modelId: string): ParsedModelRef {
  if (modelId.includes('/')) {
    const [provider, model] = modelId.split('/');
    return { provider: provider.toLowerCase(), model };
  }
  return { provider: detectProvider(modelId), model: modelId };
}

function detectProvider(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return 'openai';
  if (lower.startsWith('claude-')) return 'anthropic';
  if (lower.startsWith('gemini-')) return 'google';
  if (lower.startsWith('kimi')) return 'kimi';
  if (lower.startsWith('deepseek')) return 'deepseek';
  if (lower.startsWith('qwen')) return 'qwen';
  if (lower.startsWith('glm')) return 'zhipu';
  if (lower.startsWith('minimax')) return 'minimax';
  return 'openai';
}

export function getWorkspacePath(config: Config): string {
  const workspace = config.agents.defaults.workspace;
  if (workspace.startsWith('~')) {
    return workspace.replace('~', homedir());
  }
  return workspace;
}
