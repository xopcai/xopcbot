import { z } from 'zod';

// Provider Config Schemas
export const ProviderConfigSchema = z.object({
  api_key: z.string().default(''),
  api_base: z.string().optional(),
});

export const AnthropicConfigSchema = ProviderConfigSchema;
export const OpenAIConfigSchema = ProviderConfigSchema;
export const OpenRouterConfigSchema = ProviderConfigSchema;
export const GroqConfigSchema = ProviderConfigSchema;
export const ZhipuConfigSchema = ProviderConfigSchema;
export const VLLMConfigSchema = ProviderConfigSchema;
export const GeminiConfigSchema = ProviderConfigSchema;

// Provider Aggregate
export const ProvidersConfigSchema = z.object({
  anthropic: AnthropicConfigSchema.default({}),
  openai: OpenAIConfigSchema.default({}),
  openrouter: OpenRouterConfigSchema.default({}),
  groq: GroqConfigSchema.default({}),
  zhipu: ZhipuConfigSchema.default({}),
  vllm: VLLMConfigSchema.default({}),
  gemini: GeminiConfigSchema.default({}),
});

// Channel Configs
export const TelegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().default(''),
  allow_from: z.array(z.string()).default([]),
});

export const WhatsAppConfigSchema = z.object({
  enabled: z.boolean().default(false),
  bridge_url: z.string().default('ws://localhost:3001'),
  allow_from: z.array(z.string()).default([]),
});

export const ChannelsConfigSchema = z.object({
  telegram: TelegramConfigSchema.default({}),
  whatsapp: WhatsAppConfigSchema.default({}),
});

// Agent Defaults
export const AgentDefaultsSchema = z.object({
  workspace: z.string().default('~/.xopcbot/workspace'),
  model: z.string().default('anthropic/claude-opus-4-5'),
  max_tokens: z.number().default(8192),
  temperature: z.number().default(0.7),
  max_tool_iterations: z.number().default(20),
});

export const AgentsConfigSchema = z.object({
  defaults: AgentDefaultsSchema.default({}),
});

// Tools Config
export const WebSearchConfigSchema = z.object({
  api_key: z.string().default(''),
  max_results: z.number().default(5),
});

export const WebToolsConfigSchema = z.object({
  search: WebSearchConfigSchema.default({}),
});

export const ToolsConfigSchema = z.object({
  web: WebToolsConfigSchema.default({}),
});

// Gateway
export const GatewayConfigSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().default(18790),
});

// Root Config
export const ConfigSchema = z.object({
  agents: AgentsConfigSchema.default({}),
  channels: ChannelsConfigSchema.default({}),
  providers: ProvidersConfigSchema.default({}),
  gateway: GatewayConfigSchema.default({}),
  tools: ToolsConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AgentDefaults = z.infer<typeof AgentDefaultsSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

// Helper functions
export function getApiKey(config: Config): string | null {
  return (
    config.providers.openrouter?.api_key ||
    config.providers.anthropic?.api_key ||
    config.providers.openai?.api_key ||
    config.providers.gemini?.api_key ||
    config.providers.zhipu?.api_key ||
    config.providers.groq?.api_key ||
    config.providers.vllm?.api_key ||
    null
  );
}

export function getApiBase(config: Config): string | null {
  if (config.providers.openrouter?.api_key) {
    return config.providers.openrouter?.api_base || 'https://openrouter.ai/api/v1';
  }
  if (config.providers.zhipu?.api_key) {
    return config.providers.zhipu?.api_base || null;
  }
  if (config.providers.vllm?.api_base) {
    return config.providers.vllm?.api_base;
  }
  return null;
}

export function getWorkspacePath(config: Config): string {
  return config.agents.defaults.workspace;
}
