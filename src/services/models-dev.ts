/**
 * Models.dev Service
 *
 * Provides AI model data from built-in static data with optional
 * network refresh from models.dev API.
 *
 * Built-in data serves as the primary source for reliability,
 * with network fetch as an optional enhancement.
 *
 * @see https://models.dev
 */

import { homedir } from 'os';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { dirname, join } from 'path';
import type {
  ModelsDevApiResponse,
  ModelsDevRawProvider,
  ModelsDevRawModel,
  ModelsDevCacheEntry,
  ModelsDevServiceConfig,
  ModelsDevProvider,
  ModelsDevModel,
  ProviderIdMap,
  AuthType,
  ModelFilterOptions,
  ModelSortOptions,
} from '../types/models-dev.js';
import { BUILT_IN_PROVIDERS, BUILT_IN_METADATA } from './models-dev-data.js';

// ============================================
// Constants
// ============================================

const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const DEFAULT_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILE_NAME = 'models-dev-cache.json';
const NEW_MODEL_THRESHOLD_DAYS = 30;

// Provider ID mapping: models.dev -> internal
const PROVIDER_ID_MAP: ProviderIdMap = {
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
  ollama: 'ollama',
  ollama_cloud: 'ollama',
  nvidia: 'nvidia',
  fireworks: 'fireworks',
  together: 'together',
  perplexity: 'perplexity',
  ai21: 'ai21',
  voyageai: 'voyageai',
};

// OAuth provider configurations (models.dev doesn't provide these)
const OAUTH_PROVIDERS: Record<string, { type: 'oauth'; oauthProviderId: string }> =
  {
    anthropic: { type: 'oauth', oauthProviderId: 'anthropic' },
    kimi: { type: 'oauth', oauthProviderId: 'kimi-coding' },
    minimax: { type: 'oauth', oauthProviderId: 'minimax-portal' },
    'minimax-cn': { type: 'oauth', oauthProviderId: 'minimax-cn' },
    zai: { type: 'oauth', oauthProviderId: 'zai' },
  };

// ============================================
// Service Class
// ============================================

export class ModelsDevService {
  private cache: ModelsDevCacheEntry | null = null;
  private cacheFilePath: string;
  private config: ModelsDevServiceConfig;
  private fetchPromise: Promise<void> | null = null;
  private initialized = false;

  // In-memory indexes for fast lookup
  private providerMap = new Map<string, ModelsDevProvider>();
  private modelMap = new Map<string, ModelsDevModel>(); // key: "provider/model"

  constructor(config?: Partial<ModelsDevServiceConfig>) {
    this.config = {
      apiUrl: MODELS_DEV_API_URL,
      cacheDurationMs: DEFAULT_CACHE_DURATION_MS,
      enabled: true,
      ...config,
    };

    this.cacheFilePath = join(
      homedir(),
      '.xopcbot',
      'cache',
      CACHE_FILE_NAME
    );
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Check if service is enabled and ready
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if data is loaded
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Initialize service - load from built-in data first,
   * then try to update from network cache if available and fresh
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      // Always start with built-in data for immediate availability
      this.loadBuiltInData();
      this.initialized = true;

      console.log(
        `[ModelsDev] Loaded ${BUILT_IN_METADATA.totalProviders} providers, ${BUILT_IN_METADATA.totalModels} models from built-in data`
      );

      // Try to update from file cache if it's fresh (async, don't block)
      this.tryUpdateFromCache().catch(() => {
        // Silent fail - built-in data is already loaded
      });

      return true;
    } catch (error) {
      console.warn('[ModelsDev] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Force refresh from API - fetches latest data from models.dev
   */
  async refresh(): Promise<boolean> {
    if (!this.config.enabled) return false;

    try {
      await this.fetchFromApi();
      return true;
    } catch (error) {
      console.warn('[ModelsDev] Failed to refresh from API:', error);
      return false;
    }
  }

  /**
   * Get all providers
   */
  getProviders(): ModelsDevProvider[] {
    return Array.from(this.providerMap.values());
  }

  /**
   * Get provider by ID
   */
  getProvider(id: string): ModelsDevProvider | undefined {
    return this.providerMap.get(id);
  }

  /**
   * Get all models
   */
  getAllModels(): ModelsDevModel[] {
    return Array.from(this.modelMap.values());
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(providerId: string): ModelsDevModel[] {
    const provider = this.providerMap.get(providerId);
    return provider?.models ?? [];
  }

  /**
   * Find model by ID (supports "provider/model" or just "model")
   */
  findModel(modelRef: string): ModelsDevModel | undefined {
    // Try direct lookup first
    if (this.modelMap.has(modelRef)) {
      return this.modelMap.get(modelRef);
    }

    // Parse "provider/model" format
    if (modelRef.includes('/')) {
      const [providerId, modelId] = modelRef.split('/', 2);
      const key = `${this.mapProviderId(providerId)}/${modelId}`;
      return this.modelMap.get(key);
    }

    // Search by model ID only (return first match)
    for (const [key, model] of this.modelMap) {
      if (key.endsWith(`/${modelRef}`) || model.id === modelRef) {
        return model;
      }
    }

    return undefined;
  }

  /**
   * Filter and sort models
   */
  filterModels(
    options: ModelFilterOptions = {},
    sort?: ModelSortOptions
  ): ModelsDevModel[] {
    let models = this.getAllModels();

    // Apply filters
    if (options.provider) {
      models = models.filter((m) => m.provider === options.provider);
    }

    if (options.capabilities?.length) {
      models = models.filter((m) =>
        options.capabilities!.every((cap) => m.capabilities[cap])
      );
    }

    if (options.authType) {
      models = models.filter((m) => m.auth.types.includes(options.authType!));
    }

    if (options.maxPrice !== undefined) {
      models = models.filter(
        (m) => !m.pricing || m.pricing.input <= options.maxPrice!
      );
    }

    if (options.minContextWindow) {
      models = models.filter(
        (m) => m.limits.context >= options.minContextWindow!
      );
    }

    if (!options.includeDeprecated) {
      // Note: models.dev doesn't mark deprecated, but we could add logic
      models = models.filter((m) => !m.metadata.openWeights); // Keep non-open as they are more likely current
    }

    if (options.onlyNew) {
      models = models.filter((m) => m.metadata.isNew);
    }

    // Apply sorting
    if (sort) {
      models = this.sortModels(models, sort);
    }

    return models;
  }

  /**
   * Get last updated timestamp
   */
  getLastUpdated(): Date | null {
    return this.cache ? new Date(this.cache.timestamp) : new Date(BUILT_IN_METADATA.lastUpdated);
  }

  /**
   * Get cache age in milliseconds
   */
  getCacheAge(): number {
    if (!this.cache) return Infinity;
    return Date.now() - this.cache.timestamp;
  }

  /**
   * Get built-in metadata
   */
  getBuiltInMetadata(): typeof BUILT_IN_METADATA {
    return BUILT_IN_METADATA;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Load built-in data as primary source
   */
  private loadBuiltInData(): void {
    // Apply filters to built-in data
    const filteredProviders = BUILT_IN_PROVIDERS.filter((p) => {
      if (this.config.excludeProviders?.includes(p.id)) return false;
      if (
        this.config.includeProviders?.length &&
        !this.config.includeProviders.includes(p.id)
      ) {
        return false;
      }
      return true;
    });

    this.cache = {
      data: filteredProviders,
      timestamp: new Date(BUILT_IN_METADATA.lastUpdated).getTime(),
      source: 'built-in',
    };

    this.buildIndexes();
  }

  /**
   * Try to update from file cache if available and fresh
   */
  private async tryUpdateFromCache(): Promise<void> {
    try {
      const cached = await this.loadFromFileCache();
      if (cached && !this.isCacheExpired(cached.timestamp)) {
        // Merge: built-in data takes precedence, but add new models from cache
        this.mergeWithCache(cached);
        console.log('[ModelsDev] Updated from file cache');
      }
    } catch {
      // Silent fail - built-in data is sufficient
    }
  }

  /**
   * Merge cached data with built-in data
   * Built-in data takes precedence for existing models
   * Cached data adds new providers/models not in built-in
   */
  private mergeWithCache(cached: ModelsDevCacheEntry): void {
    if (!this.cache) return;

    const builtInProviderIds = new Set(this.cache.data.map((p) => p.id));

    // Add new providers from cache that aren't in built-in
    for (const cachedProvider of cached.data) {
      if (!builtInProviderIds.has(cachedProvider.id)) {
        this.cache.data.push(cachedProvider);
      }
    }

    // Update timestamp to cache time
    this.cache.timestamp = cached.timestamp;
    this.cache.etag = cached.etag;

    // Rebuild indexes
    this.buildIndexes();
  }

  private async fetchFromApi(): Promise<void> {
    // Prevent concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.doFetch();
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async doFetch(): Promise<void> {
    console.log('[ModelsDev] Fetching from API...');

    const response = await fetch(this.config.apiUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as ModelsDevApiResponse;

    // Process and cache
    const providers = this.processApiResponse(data);

    // Merge with built-in: API data adds new providers, built-in keeps existing
    const mergedProviders = this.mergeWithApiData(providers);

    this.cache = {
      data: mergedProviders,
      timestamp: Date.now(),
      etag: response.headers.get('etag') ?? undefined,
      source: 'api',
    };

    // Build indexes
    this.buildIndexes();

    // Save to file cache
    await this.saveToFileCache();

    console.log(
      `[ModelsDev] Loaded ${providers.length} providers from API, ${this.modelMap.size} total models`
    );
  }

  /**
   * Merge API data with built-in data
   * API data adds new providers not in built-in
   * Built-in data takes precedence for existing providers
   */
  private mergeWithApiData(apiProviders: ModelsDevRawProvider[]): ModelsDevRawProvider[] {
    const builtInIds = new Set(BUILT_IN_PROVIDERS.map((p) => p.id));

    // Start with built-in providers
    const merged = [...BUILT_IN_PROVIDERS];

    // Add new providers from API
    for (const apiProvider of apiProviders) {
      if (!builtInIds.has(apiProvider.id)) {
        merged.push(apiProvider);
      }
    }

    return merged;
  }

  private processApiResponse(data: ModelsDevApiResponse): ModelsDevRawProvider[] {
    const providers: ModelsDevRawProvider[] = [];

    for (const [id, provider] of Object.entries(data)) {
      // Apply filters
      if (this.config.excludeProviders?.includes(id)) continue;
      if (
        this.config.includeProviders?.length &&
        !this.config.includeProviders.includes(id)
      ) {
        continue;
      }

      providers.push(provider);
    }

    return providers;
  }

  private buildIndexes(): void {
    this.providerMap.clear();
    this.modelMap.clear();

    if (!this.cache) return;

    for (const rawProvider of this.cache.data) {
      const provider = this.convertProvider(rawProvider);
      this.providerMap.set(provider.id, provider);

      for (const model of provider.models) {
        const key = `${model.provider}/${model.id}`;
        this.modelMap.set(key, model);
        // Also index by raw model ID for lookup
        this.modelMap.set(model.id, model);
      }
    }
  }

  private convertProvider(raw: ModelsDevRawProvider): ModelsDevProvider {
    const internalId = this.mapProviderId(raw.id);

    // Determine auth type
    const auth = this.inferAuthConfig(raw, internalId);

    const provider: ModelsDevProvider = {
      id: internalId,
      name: raw.name,
      sources: {
        modelsDev: true,
        piAi: false, // Will be updated by ModelRegistry
      },
      api: {
        baseUrl: raw.api,
        npmPackage: raw.npm,
        docUrl: raw.doc,
      },
      auth,
      logoUrl: `https://models.dev/logos/${raw.id}.svg`,
      models: Object.values(raw.models).map((m) =>
        this.convertModel(m, internalId, raw.name)
      ),
    };

    return provider;
  }

  private convertModel(
    raw: ModelsDevRawModel,
    providerId: string,
    providerName: string
  ): ModelsDevModel {
    const now = new Date();
    const releaseDate = new Date(raw.release_date);
    const isNew =
      (now.getTime() - releaseDate.getTime()) /
        (1000 * 60 * 60 * 24) <=
      NEW_MODEL_THRESHOLD_DAYS;

    // Infer auth types for this model
    const authTypes = this.inferModelAuthTypes(providerId);

    return {
      id: raw.id,
      name: raw.name,
      provider: providerId,
      providerName,
      source: 'models.dev',
      capabilities: {
        text: raw.modalities.input.includes('text'),
        image: raw.modalities.input.includes('image'),
        audio: raw.modalities.input.includes('audio'),
        video: raw.modalities.input.includes('video'),
        pdf: raw.modalities.input.includes('pdf'),
        reasoning: raw.reasoning,
        toolCall: raw.tool_call,
        attachment: raw.attachment,
        temperature: raw.temperature,
      },
      limits: {
        context: raw.limit.context,
        output: raw.limit.output,
      },
      pricing: raw.cost
        ? {
            input: raw.cost.input,
            output: raw.cost.output,
            cacheRead: raw.cost.cache_read,
            cacheWrite: raw.cost.cache_write,
          }
        : undefined,
      auth: {
        required: authTypes.length > 0,
        types: authTypes,
      },
      metadata: {
        family: raw.family,
        releaseDate,
        lastUpdated: new Date(raw.last_updated),
        knowledgeCutoff: raw.knowledge,
        openWeights: raw.open_weights,
        isNew,
      },
    };
  }

  private inferAuthConfig(
    raw: ModelsDevRawProvider,
    internalId: string
  ): ModelsDevProvider['auth'] {
    // Check if it's an OAuth provider
    const oauthConfig = OAUTH_PROVIDERS[internalId];
    if (oauthConfig) {
      return {
        type: 'oauth',
        oauthConfig: {
          providerId: oauthConfig.oauthProviderId,
          usePKCE: true,
        },
      };
    }

    // Check for API key auth
    if (raw.env && raw.env.length > 0) {
      return {
        type: 'api_key',
        envKeys: raw.env,
        headerName: 'Authorization',
        headerPrefix: 'Bearer ',
      };
    }

    // Default to none (local providers like Ollama)
    return { type: 'none' };
  }

  private inferModelAuthTypes(providerId: string): AuthType[] {
    const types: AuthType[] = [];

    // Check OAuth
    if (OAUTH_PROVIDERS[providerId]) {
      types.push('oauth');
    }

    // Check API key (most providers)
    if (!['ollama'].includes(providerId)) {
      types.push('api_key');
    }

    // Local providers don't need auth
    if (providerId === 'ollama') {
      return [];
    }

    return types;
  }

  private mapProviderId(modelsDevId: string): string {
    return PROVIDER_ID_MAP[modelsDevId] ?? modelsDevId;
  }

  private sortModels(
    models: ModelsDevModel[],
    sort: ModelSortOptions
  ): ModelsDevModel[] {
    return [...models].sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'releaseDate':
          comparison =
            (a.metadata.releaseDate?.getTime() ?? 0) -
            (b.metadata.releaseDate?.getTime() ?? 0);
          break;
        case 'pricing':
          comparison = (a.pricing?.input ?? Infinity) - (b.pricing?.input ?? Infinity);
          break;
        case 'contextWindow':
          comparison = a.limits.context - b.limits.context;
          break;
      }

      return sort.direction === 'desc' ? -comparison : comparison;
    });
  }

  // ============================================
  // File Cache Management
  // ============================================

  private async loadFromFileCache(): Promise<ModelsDevCacheEntry | null> {
    try {
      await access(this.cacheFilePath);
      const data = await readFile(this.cacheFilePath, 'utf-8');
      const cache: ModelsDevCacheEntry = JSON.parse(data);

      // Validate cache structure
      if (!cache.data || !cache.timestamp) {
        console.warn('[ModelsDev] Invalid cache structure');
        return null;
      }

      return cache;
    } catch {
      return null;
    }
  }

  private async saveToFileCache(): Promise<void> {
    if (!this.cache) return;

    try {
      // Ensure directory exists
      await mkdir(dirname(this.cacheFilePath), { recursive: true });

      // Save cache
      await writeFile(
        this.cacheFilePath,
        JSON.stringify(this.cache, null, 2),
        'utf-8'
      );

      console.log('[ModelsDev] Saved to file cache');
    } catch (error) {
      console.warn('[ModelsDev] Failed to save cache:', error);
    }
  }

  private isCacheExpired(timestamp?: number): boolean {
    const ts = timestamp ?? this.cache?.timestamp ?? 0;
    return Date.now() - ts > this.config.cacheDurationMs;
  }
}

// ============================================
// Singleton Instance
// ============================================

let globalService: ModelsDevService | null = null;

/**
 * Get or create global ModelsDevService instance
 */
export function getModelsDevService(
  config?: Partial<ModelsDevServiceConfig>
): ModelsDevService {
  if (!globalService) {
    globalService = new ModelsDevService(config);
  }
  return globalService;
}

/**
 * Reset global instance (for testing)
 */
export function resetModelsDevService(): void {
  globalService = null;
}
