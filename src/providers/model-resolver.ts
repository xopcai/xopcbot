/**
 * Model Resolver
 * 
 * OpenClaw-style model resolution with aliases and fallbacks.
 */

import type { Config, ModelSelection } from '../config/schema.js';
import { parseModelRef } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ModelResolver');

export interface ResolvedModel {
  provider: string;
  model: string;
  fullId: string;
}

export interface ResolvedModelWithFallbacks {
  primary: ResolvedModel;
  fallbacks: ResolvedModel[];
}

/**
 * Build alias map from config.
 * Maps alias -> full model ID (provider/model)
 */
export function buildAliasMap(config: Config): Map<string, string> {
  const aliasMap = new Map<string, string>();
  const models = config.agents?.defaults?.models ?? {};

  for (const [fullId, aliasConfig] of Object.entries(models)) {
    if (aliasConfig?.alias) {
      aliasMap.set(aliasConfig.alias.toLowerCase(), fullId);
      log.debug({ alias: aliasConfig.alias, fullId }, 'Registered model alias');
    }
  }

  // Built-in aliases
  const builtIn: Record<string, string> = {
    'opus': 'anthropic/claude-opus-4-5',
    'sonnet': 'anthropic/claude-sonnet-4-5',
    'gpt': 'openai/gpt-4o',
    'gpt-mini': 'openai/gpt-4o-mini',
    'gemini': 'google/gemini-2.5-pro',
    'gemini-flash': 'google/gemini-2.5-flash',
  };

  for (const [alias, fullId] of Object.entries(builtIn)) {
    if (!aliasMap.has(alias)) {
      aliasMap.set(alias, fullId);
    }
  }

  return aliasMap;
}

/**
 * Resolve a model reference (possibly an alias) to full model ID.
 */
export function resolveModelRef(ref: string, config: Config): ResolvedModel {
  const aliasMap = buildAliasMap(config);
  const normalizedRef = ref.toLowerCase();

  // Check if it's an alias
  const aliased = aliasMap.get(normalizedRef);
  if (aliased) {
    log.debug({ ref, resolved: aliased }, 'Resolved model alias');
    const parsed = parseModelRef(aliased);
    return { ...parsed, fullId: aliased };
  }

  const parsed = parseModelRef(ref);
  return { ...parsed, fullId: `${parsed.provider}/${parsed.model}` };
}

/**
 * Resolve model configuration with fallbacks.
 */
export function resolveModelWithFallbacks(
  modelConfig: ModelSelection | undefined,
  config: Config
): ResolvedModelWithFallbacks | null {
  if (!modelConfig) return null;

  if (typeof modelConfig === 'string') {
    return {
      primary: resolveModelRef(modelConfig, config),
      fallbacks: [],
    };
  }

  const primary = modelConfig.primary
    ? resolveModelRef(modelConfig.primary, config)
    : null;

  if (!primary) return null;

  const fallbacks = (modelConfig.fallbacks ?? [])
    .map((ref) => resolveModelRef(ref, config))
    .filter(Boolean);

  return { primary, fallbacks };
}

/**
 * Get the primary model for the agent.
 */
export function getPrimaryModel(config: Config): ResolvedModel {
  const modelConfig = config.agents?.defaults?.model;
  const resolved = resolveModelWithFallbacks(modelConfig, config);

  return resolved?.primary ?? { provider: 'anthropic', model: 'claude-sonnet-4-5', fullId: 'anthropic/claude-sonnet-4-5' };
}

/**
 * Get all fallback models in order.
 */
export function getFallbackModels(config: Config): ResolvedModel[] {
  const modelConfig = config.agents?.defaults?.model;
  const resolved = resolveModelWithFallbacks(modelConfig, config);
  return resolved?.fallbacks ?? [];
}

/**
 * Get image model configuration.
 */
export function getImageModel(config: Config): ResolvedModelWithFallbacks | null {
  const imageModelConfig = config.agents?.defaults?.imageModel;
  return resolveModelWithFallbacks(imageModelConfig, config);
}

/**
 * Check if a string is a valid model reference.
 */
export function isValidModelRef(ref: string): boolean {
  if (!ref || typeof ref !== 'string') return false;
  return ref.includes('/') || ref.length > 0;
}
