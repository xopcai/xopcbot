import { LLMProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { Config } from '../types/index.js';

export function createProvider(config: Config): LLMProvider {
  const providers = config.providers || {};
  const openrouter = providers.openrouter;
  const anthropic = providers.anthropic;
  const openai = providers.openai;
  const vllm = providers.vllm;

  const apiKey = openrouter?.api_key || anthropic?.api_key || openai?.api_key || vllm?.api_key || '';
  const apiBase = openrouter?.api_base || vllm?.api_base;
  const model = config.agents.defaults.model;

  // OpenRouter
  if (openrouter?.api_key) {
    return new OpenAIProvider(apiKey, apiBase, model);
  }

  // Anthropic
  if (model.includes('anthropic') || model.includes('claude')) {
    return new AnthropicProvider(anthropic?.api_key || apiKey, model.replace('anthropic/', ''));
  }

  // OpenAI compatible
  if (model.includes('gpt') || model.includes('openai')) {
    return new OpenAIProvider(openai?.api_key || apiKey, openai?.api_base, model.replace('openai/', ''));
  }

  // vLLM
  if (vllm?.api_base) {
    return new OpenAIProvider(vllm.api_key || 'dummy', vllm.api_base, model);
  }

  // Default
  return new OpenAIProvider(apiKey, apiBase, model);
}

export * from './base.js';
export * from './openai.js';
export * from './anthropic.js';
