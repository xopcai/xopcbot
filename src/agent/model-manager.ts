/**
 * Model Manager
 * 
 * OpenClaw-style model management with aliases and fallbacks.
 */

import { Agent, type AgentMessage } from '@mariozechner/pi-agent-core';
import type { Model, Api } from '@mariozechner/pi-ai';
import type { Config } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
import { ModelRegistry } from '../providers/registry.js';
import { resolveModelWithFallbacks, getPrimaryModel } from '../providers/model-resolver.js';

const log = createLogger('ModelManager');

export interface ModelManagerConfig {
  config?: Config;
  defaultModel?: string;
}

export interface RunResult {
  content: string | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getLastAssistantContent(agent: Agent): string | null {
  const messages = agent.state.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      return msg.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join('');
    }
  }
  return null;
}

export class ModelManager {
  private modelRegistry: ModelRegistry;
  private config?: Config;
  private sessionModels: Map<string, string> = new Map();
  private defaultModelRef?: string;
  private channelManager: any = null;

  constructor(config: ModelManagerConfig = {}) {
    this.config = config.config;
    this.defaultModelRef = config.defaultModel;
    this.modelRegistry = new ModelRegistry(config.config ?? null, { ollamaEnabled: false });
  }

  getRegistry(): ModelRegistry {
    return this.modelRegistry;
  }

  /**
   * Get the default model from config.
   */
  getDefaultModel(): Model<Api> | undefined {
    if (!this.config) return undefined;
    const primary = getPrimaryModel(this.config);
    return this.modelRegistry.find(primary.provider, primary.model);
  }

  /**
   * Switch model for a specific session.
   */
  async switchModelForSession(sessionKey: string, modelRef: string): Promise<boolean> {
    if (!this.config) return false;

    const resolved = resolveModelWithFallbacks(modelRef, this.config);
    if (!resolved?.primary) {
      log.warn({ modelRef }, 'Could not resolve model reference');
      return false;
    }

    const found = this.modelRegistry.find(resolved.primary.provider, resolved.primary.model);
    if (!found) {
      log.warn({ modelRef, resolved }, 'Model not found in registry');
      return false;
    }

    this.sessionModels.set(sessionKey, modelRef);
    log.info({ sessionKey, modelRef, resolved }, 'Model switched for session');
    return true;
  }

  /**
   * Get model for session, checking session override first.
   */
  getModelForSession(sessionKey: string): Model<Api> | undefined {
    if (!this.config) return undefined;

    // Check session override
    const sessionRef = this.sessionModels.get(sessionKey);
    if (sessionRef) {
      const resolved = resolveModelWithFallbacks(sessionRef, this.config);
      if (resolved?.primary) {
        return this.modelRegistry.find(resolved.primary.provider, resolved.primary.model);
      }
    }

    // Use default
    return this.getDefaultModel();
  }

  /**
   * Apply model to agent for session.
   */
  async applyModelForSession(agent: Agent, sessionKey: string): Promise<void> {
    const model = this.getModelForSession(sessionKey);
    if (!model) {
      log.warn({ sessionKey }, 'No model found for session');
      return;
    }

    agent.setModel(model);
    log.info({ sessionKey, model: `${model.provider}/${model.id}` }, 'Applied model for session');
  }

  /**
   * Run agent with automatic fallback on failure.
   */
  async runWithFallback(
    agent: Agent,
    sessionKey: string,
    userMessage: AgentMessage
  ): Promise<RunResult> {
    if (!this.config) {
      throw new Error('Config not available');
    }

    const modelSelection = this.sessionModels.get(sessionKey) ?? this.config.agents.defaults.model;
    const resolved = resolveModelWithFallbacks(modelSelection, this.config);

    if (!resolved?.primary) {
      throw new Error('No primary model configured');
    }

    const candidates = [resolved.primary, ...resolved.fallbacks];
    let lastError: unknown;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const candidateModel = this.modelRegistry.find(candidate.provider, candidate.model);

      if (!candidateModel) {
        log.warn({ provider: candidate.provider, model: candidate.model }, 'Model not found in registry');
        continue;
      }

      log.info({ attempt: i + 1, total: candidates.length, model: candidate.fullId }, 'Attempting model');

      try {
        agent.setModel(candidateModel);
        await agent.prompt(userMessage);
        await agent.waitForIdle();

        const usage = (agent.state as any).lastUsage;
        return { content: getLastAssistantContent(agent), usage };
      } catch (err) {
        lastError = err;
        log.warn({ err, model: candidate.fullId }, 'Model call failed');
      }
    }

    if (lastError) throw lastError;
    return { content: null };
  }

  findByRef(ref: string): Model<Api> | undefined {
    return this.modelRegistry.findByRef(ref);
  }

  find(provider: string, modelId: string): Model<Api> | undefined {
    return this.modelRegistry.find(provider, modelId);
  }

  getAllModels(): Model<Api>[] {
    return this.modelRegistry.getAll();
  }

  getModelsByProvider(): Map<string, Model<Api>[]> {
    return this.modelRegistry.getByProvider();
  }

  /**
   * Set channel manager reference (for streaming control).
   */
  setChannelManager(channelManager: any): void {
    this.channelManager = channelManager;
  }

  /**
   * Get current model reference string.
   */
  getCurrentModel(): string {
    if (this.defaultModelRef) {
      return this.defaultModelRef;
    }
    if (this.config?.agents?.defaults?.model) {
      const modelConfig = this.config.agents.defaults.model;
      if (typeof modelConfig === 'string') {
        return modelConfig;
      }
      return modelConfig.primary;
    }
    return 'anthropic/claude-sonnet-4-5';
  }

  /**
   * Get current provider from model reference.
   */
  getCurrentProvider(): string {
    const modelRef = this.getCurrentModel();
    const slashIndex = modelRef.indexOf('/');
    if (slashIndex === -1) {
      return 'anthropic';
    }
    return modelRef.substring(0, slashIndex);
  }
}
