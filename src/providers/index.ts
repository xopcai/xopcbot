import { LLMProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { Config } from '../config/index.js';

export function createProvider(config: Config): LLMProvider {
  const apiKey = config.providers.openrouter?.api_key ||
    config.providers.anthropic?.api_key ||
    config.providers.openai?.api_key ||
    '';

  const apiBase = config.providers.openrouter?.api_base;

  // Determine provider type based on model or config
  const model = config.agents.defaults.model;

  // OpenRouter (recommended - supports all models)
  if (config.providers.openrouter?.api_key) {
    return new OpenAIProvider(apiKey, apiBase, model);
  }

  // Anthropic
  if (model.includes('anthropic') || model.includes('claude')) {
    return new AnthropicProvider(
      config.providers.anthropic?.api_key || apiKey,
      model.replace('anthropic/', '')
    );
  }

  // OpenAI compatible (OpenAI, Azure, etc.)
  if (model.includes('gpt') || model.includes('openai')) {
    return new OpenAIProvider(
      config.providers.openai?.api_key || apiKey,
      config.providers.openai?.api_base,
      model.replace('openai/', '')
    );
  }

  // vLLM or other OpenAI-compatible endpoints
  if (config.providers.vllm?.api_base) {
    return new OpenAIProvider(
      config.providers.vllm?.api_key || 'dummy',
      config.providers.vllm.api_base,
      model
    );
  }

  // Default to OpenAI compatible with OpenRouter-style model names
  return new OpenAIProvider(apiKey, apiBase, model);
}

export * from './base.js';
export * from './openai.js';
export * from './anthropic.js';
