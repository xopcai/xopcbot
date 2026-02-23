/**
 * Model Registry
 * 
 * OpenClaw-style model registry.
 * Loads models from:
 * 1. Built-in pi-ai models
 * 2. Custom models from config.models.providers
 * 3. Ollama auto-discovery
 */

import {
	getModels,
	getProviders,
	type Api,
	type Model,
	type KnownProvider,
} from '@mariozechner/pi-ai';
import type { Config, ModelDef, ProviderConfig } from '../config/schema.js';
import { resolveEnvVars } from '../config/schema.js';
import { resolveModelRef } from './model-resolver.js';
import { createProviderConfig } from './config.js';

const providerConfig = createProviderConfig();
const OLLAMA_API_BASE = providerConfig.ollamaBaseUrl;
const OLLAMA_TAGS_URL = `${OLLAMA_API_BASE}/api/tags`;
const OLLAMA_TIMEOUT_MS = providerConfig.ollamaTimeoutMs;

interface OllamaModel {
	name: string;
	model: string;
	modified_at: string;
	size: number;
	digest: string;
}

interface OllamaTagsResponse {
	models: OllamaModel[];
}

export class ModelRegistry {
	private models: Model<Api>[] = [];
	private config: Config | null = null;
	private ollamaEnabled = true;

	constructor(config?: Config | null, options?: { ollamaEnabled?: boolean }) {
		this.config = config ?? null;
		this.ollamaEnabled = options?.ollamaEnabled ?? true;
		this.loadModels();
	}

	updateConfig(config: Config): void {
		this.config = config;
		this.models = [];
		this.loadModels();
	}

	private loadModels(): void {
		// Load built-in models from pi-ai
		this.loadBuiltInModels();

		// Load custom models from config.models.providers
		this.loadCustomModels();

		// Discover Ollama models
		if (this.ollamaEnabled) {
			this.discoverOllamaModels();
		}
	}

	private loadBuiltInModels(): void {
		try {
			const providers = getProviders() as string[];
			for (const provider of providers) {
				const builtInModels = getModels(provider as KnownProvider) as Model<Api>[];
				this.models.push(...builtInModels);
			}
		} catch (error) {
			console.warn('Failed to load built-in models:', error);
		}
	}

	private loadCustomModels(): void {
		if (!this.config?.models?.providers) return;

		for (const [providerName, providerCfg] of Object.entries(this.config.models.providers)) {
			if (!providerCfg?.models?.length) continue;

			// Resolve API key with env variable support
			let apiKey = providerCfg.apiKey ?? '';
			if (apiKey?.startsWith('${') && apiKey?.endsWith('}')) {
				try {
					apiKey = resolveEnvVars(apiKey);
				} catch (err) {
					console.warn(`[ModelRegistry] Failed to resolve env var for ${providerName}: ${apiKey}`);
				}
			}

			const api = (providerCfg.api ?? 'openai-completions') as Api;
			const baseUrl = providerCfg.baseUrl ?? '';

			for (const modelDef of providerCfg.models) {
				const exists = this.models.some(
					(m) => m.provider === providerName && m.id === modelDef.id
				);

				if (!exists) {
					this.models.push({
						id: modelDef.id,
						name: modelDef.name,
						api,
						provider: providerName,
						baseUrl,
						reasoning: modelDef.reasoning ?? false,
						input: modelDef.input ?? ['text'],
						cost: {
							input: modelDef.cost?.input ?? 0,
							output: modelDef.cost?.output ?? 0,
							cacheRead: modelDef.cost?.cacheRead ?? 0,
							cacheWrite: modelDef.cost?.cacheWrite ?? 0,
						},
						contextWindow: modelDef.contextWindow ?? 128000,
						maxTokens: modelDef.maxTokens ?? 16384,
						headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
					} as Model<Api>);

					console.log(`[ModelRegistry] Registered model: ${providerName}/${modelDef.id}`);
				}
			}
		}
	}

	private async discoverOllamaModels(): Promise<void> {
		try {
			const response = await fetch(OLLAMA_TAGS_URL, { 
				signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS) 
			});
			if (!response.ok) return;

			const data = (await response.json()) as OllamaTagsResponse;
			if (!data.models?.length) return;

			for (const model of data.models) {
				const exists = this.models.some((m) => m.provider === 'ollama' && m.id === model.name);
				if (!exists) {
					this.models.push({
						id: model.name,
						name: model.name,
						api: 'openai-completions' as Api,
						provider: 'ollama',
						baseUrl: `${OLLAMA_API_BASE}/v1`,
						reasoning: model.name.toLowerCase().includes('r1'),
						input: ['text'],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 131072,
						maxTokens: 4096,
					} as Model<Api>);
				}
			}
		} catch {
			// Ignore Ollama discovery errors
		}
	}

	/**
	 * Find model by provider and ID.
	 */
	find(provider: string, modelId: string): Model<Api> | undefined {
		return this.models.find(
			(m) =>
				m.provider.toLowerCase() === provider.toLowerCase() &&
				m.id.toLowerCase() === modelId.toLowerCase()
		);
	}

	/**
	 * Find model by reference string.
	 * Supports aliases if config is available.
	 */
	findByRef(ref: string): Model<Api> | undefined {
		// Resolve alias if config is available
		if (this.config) {
			const resolved = resolveModelRef(ref, this.config);
			return this.find(resolved.provider, resolved.model);
		}

		// Direct lookup
		const slashIndex = ref.indexOf('/');
		if (slashIndex === -1) {
			return this.models.find((m) => m.id.toLowerCase() === ref.toLowerCase());
		}
		const provider = ref.substring(0, slashIndex);
		const modelId = ref.substring(slashIndex + 1);
		return this.find(provider, modelId);
	}

	/**
	 * Get all models.
	 */
	getAll(): Model<Api>[] {
		return this.models;
	}

	/**
	 * Get models grouped by provider.
	 */
	getByProvider(): Map<string, Model<Api>[]> {
		const byProvider = new Map<string, Model<Api>[]>();
		for (const model of this.models) {
			const list = byProvider.get(model.provider) ?? [];
			list.push(model);
			byProvider.set(model.provider, list);
		}
		return byProvider;
	}

	/**
	 * Get models for a specific provider.
	 */
	getByProviderName(provider: string): Model<Api>[] {
		return this.models.filter((m) => m.provider.toLowerCase() === provider.toLowerCase());
	}

	refresh(): void {
		this.models = [];
		this.loadModels();
	}
}

/**
 * Create a model registry from config.
 */
export function createModelRegistry(config?: Config): ModelRegistry {
	return new ModelRegistry(config);
}
