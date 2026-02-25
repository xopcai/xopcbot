/**
 * Models.dev → Pi-AI Adapter
 *
 * Converts models.dev data to Pi-AI compatible format.
 * This allows seamless integration with the existing Pi-AI SDK.
 */

import type { Model, Api, Provider } from '@mariozechner/pi-ai';
import type {
  ModelsDevProvider,
  ModelsDevModel,
  ModelsDevRawProvider,
  ModelsDevRawModel,
} from '../types/models-dev.js';

// ============================================
// Provider ID Mapping
// ============================================

/**
 * Maps models.dev provider IDs to internal/Pi-AI provider IDs
 */
export const PROVIDER_ID_MAP: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  xai: 'xai',
  groq: 'groq',
  mistral: 'mistral',
  cerebras: 'cerebras',
  openrouter: 'openrouter',
  cohere: 'cohere',
  // Chinese providers
  alibaba: 'qwen',
  moonshotai: 'kimi',
  'moonshotai-cn': 'kimi',
  zai: 'zai',
  minimax: 'minimax',
  'minimax-cn': 'minimax-cn',
  deepseek: 'deepseek',
  // Others
  ollama_cloud: 'ollama',
  nvidia: 'nvidia',
  fireworks: 'fireworks',
  together: 'together',
  perplexity: 'perplexity',
  ai21: 'ai21',
  voyageai: 'voyageai',
};

/**
 * Reverse mapping: internal ID → models.dev ID
 */
export const REVERSE_PROVIDER_ID_MAP: Record<string, string> =
  Object.fromEntries(
    Object.entries(PROVIDER_ID_MAP).map(([k, v]) => [v, k])
  );

// ============================================
// API Type Mapping
// ============================================

/**
 * Maps provider to Pi-AI API strategy
 */
const API_STRATEGY_MAP: Record<string, Api> = {
  openai: 'openai-completions',
  anthropic: 'anthropic-messages',
  google: 'google-generative-ai',
  xai: 'openai-completions',
  groq: 'openai-completions',
  mistral: 'openai-completions',
  cerebras: 'openai-completions',
  openrouter: 'openai-completions',
  cohere: 'openai-completions',
  // Chinese providers
  qwen: 'openai-completions',
  kimi: 'openai-completions',
  zai: 'openai-completions',
  minimax: 'anthropic-messages',
  'minimax-cn': 'anthropic-messages',
  deepseek: 'openai-completions',
  // Local
  ollama: 'openai-completions',
};

/**
 * Base URLs for providers
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1',
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  // Chinese providers
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi: 'https://api.moonshot.cn/v1',
  zai: 'https://api.z.ai/v1',
  minimax: 'https://api.minimaxi.com/anthropic',
  'minimax-cn': 'https://api.minimaxi.com/anthropic',
  deepseek: 'https://api.deepseek.com/v1',
  // Local
  ollama: 'http://localhost:11434/v1',
};

// ============================================
// Conversion Functions
// ============================================

/**
 * Convert models.dev model to Pi-AI Model format
 */
export function convertToPiAIModel(
  devModel: ModelsDevModel | ModelsDevRawModel,
  providerId: string,
  isRaw = false
): Model<Api> {
  // Handle both raw and processed models
  const raw = isRaw ? (devModel as ModelsDevRawModel) : null;
  const processed = !isRaw ? (devModel as ModelsDevModel) : null;

  // Get API strategy
  const api = API_STRATEGY_MAP[providerId] || 'openai-completions';

  // Build input modalities
  const input: ('text' | 'image')[] = ['text']; // Always support text
  if (raw?.modalities?.input?.includes('image') || processed?.capabilities?.image) {
    input.push('image');
  }

  // Get pricing
  const cost = raw?.cost
    ? {
        input: raw.cost.input,
        output: raw.cost.output,
        cacheRead: raw.cost.cache_read ?? 0,
        cacheWrite: raw.cost.cache_write ?? 0,
      }
    : processed?.pricing
      ? {
          input: processed.pricing.input,
          output: processed.pricing.output,
          cacheRead: processed.pricing.cacheRead ?? 0,
          cacheWrite: processed.pricing.cacheWrite ?? 0,
        }
      : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  // Get limits
  const contextWindow = raw?.limit?.context ?? processed?.limits?.context ?? 128000;
  const maxTokens = raw?.limit?.output ?? processed?.limits?.output ?? 4096;

  // Get reasoning capability
  const reasoning = raw?.reasoning ?? processed?.capabilities?.reasoning ?? false;

  // Build model
  const model: Model<Api> = {
    id: raw?.id ?? processed?.id ?? '',
    name: raw?.name ?? processed?.name ?? '',
    api,
    provider: providerId as Provider,
    baseUrl: PROVIDER_BASE_URLS[providerId],
    reasoning,
    input,
    cost,
    contextWindow,
    maxTokens,
  };

  // Add compatibility hints based on provider
  if (api === 'anthropic-messages' || providerId.startsWith('minimax')) {
    (model as unknown as Record<string, unknown>).compat = {
      thinkingFormat: 'anthropic',
      supportsToolCalling: raw?.tool_call ?? processed?.capabilities?.toolCall ?? true,
    };
  }

  return model;
}

/**
 * Convert raw models.dev provider data to Pi-AI models
 */
export function convertRawProviderToPiAiModels(
  rawProvider: ModelsDevRawProvider
): Model<Api>[] {
  const providerId = mapProviderId(rawProvider.id);

  return Object.values(rawProvider.models).map((rawModel) =>
    convertToPiAIModel(rawModel, providerId, true)
  );
}

/**
 * Convert processed models.dev provider to Pi-AI models
 */
export function convertProviderToPiAiModels(
  provider: ModelsDevProvider
): Model<Api>[] {
  return provider.models.map((model) =>
    convertToPiAIModel(model, provider.id, false)
  );
}

/**
 * Map models.dev provider ID to internal ID
 */
export function mapProviderId(modelsDevId: string): string {
  return PROVIDER_ID_MAP[modelsDevId] ?? modelsDevId;
}

/**
 * Map internal provider ID to models.dev ID
 */
export function unmapProviderId(internalId: string): string | undefined {
  return REVERSE_PROVIDER_ID_MAP[internalId];
}

// ============================================
// Model Merging
// ============================================

/**
 * Merge Pi-AI model with models.dev data
 * Pi-AI model takes precedence for API configuration
 */
export function mergeModels(
  piAiModel: Model<Api>,
  devModel?: ModelsDevModel
): Model<Api> {
  if (!devModel) {
    return piAiModel;
  }

  // Create merged model - Pi-AI config is primary
  const merged: Model<Api> = {
    ...piAiModel,
    // Update pricing from models.dev (more current)
    cost: devModel.pricing
      ? {
          input: devModel.pricing.input,
          output: devModel.pricing.output,
          cacheRead: devModel.pricing.cacheRead ?? piAiModel.cost.cacheRead,
          cacheWrite: devModel.pricing.cacheWrite ?? piAiModel.cost.cacheWrite,
        }
      : piAiModel.cost,
  };

  // Add metadata from models.dev
  (merged as unknown as Record<string, unknown>).metadata = {
    family: devModel.metadata?.family,
    releaseDate: devModel.metadata?.releaseDate?.toISOString(),
    knowledgeCutoff: devModel.metadata?.knowledgeCutoff,
    openWeights: devModel.metadata?.openWeights,
    isNew: devModel.metadata?.isNew,
    source: 'merged',
  };

  return merged;
}

/**
 * Check if a Pi-AI model exists in models.dev data
 */
export function modelExistsInModelsDev(
  piAiModel: Model<Api>,
  devService: { findModel: (ref: string) => ModelsDevModel | undefined }
): boolean {
  const ref = `${piAiModel.provider}/${piAiModel.id}`;
  return devService.findModel(ref) !== undefined;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get provider display name
 */
export function getProviderDisplayName(providerId: string): string {
  const displayNames: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI (Grok)',
    groq: 'Groq',
    mistral: 'Mistral AI',
    cerebras: 'Cerebras',
    openrouter: 'OpenRouter',
    cohere: 'Cohere',
    qwen: 'Qwen (通义千问)',
    kimi: 'Kimi (月之暗面)',
    zai: 'Z.AI (智谱)',
    minimax: 'MiniMax',
    'minimax-cn': 'MiniMax CN',
    deepseek: 'DeepSeek',
    ollama: 'Ollama',
  };

  return displayNames[providerId] ?? providerId;
}

/**
 * Check if provider supports OAuth
 */
export function providerSupportsOAuth(providerId: string): boolean {
  const oauthProviders = [
    'anthropic',
    'kimi',
    'minimax',
    'minimax-cn',
    'zai',
    'google',
  ];
  return oauthProviders.includes(providerId);
}

/**
 * Infer authentication type for provider
 */
export function inferAuthType(providerId: string): 'api_key' | 'oauth' | 'none' {
  if (providerId === 'ollama') return 'none';
  if (providerSupportsOAuth(providerId)) return 'oauth';
  return 'api_key';
}

/**
 * Get environment variable names for provider API keys
 */
export function getProviderEnvKeys(providerId: string): string[] {
  const envKeyMap: Record<string, string[]> = {
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    xai: ['XAI_API_KEY'],
    groq: ['GROQ_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    cerebras: ['CEREBRAS_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    cohere: ['COHERE_API_KEY'],
    qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
    kimi: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    zai: ['ZAI_API_KEY'],
    minimax: ['MINIMAX_API_KEY'],
    'minimax-cn': ['MINIMAX_CN_API_KEY', 'MINIMAX_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
  };

  return envKeyMap[providerId] ?? [`${providerId.toUpperCase()}_API_KEY`];
}
