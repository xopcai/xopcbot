/**
 * Models API Client
 *
 * Unified client for fetching AI models from backend.
 * Supports Models.dev integration with enhanced metadata.
 */

export interface ModelCapabilityInfo {
  text: boolean;
  image: boolean;
  reasoning: boolean;
  toolCall: boolean;
}

export interface ModelLimitsInfo {
  context: number;
  output: number;
}

export interface ModelPricingInfo {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ModelAuthStatus {
  supportedTypes: ('api_key' | 'oauth' | 'token' | 'none')[];
  hasOAuth: boolean;
  configured: boolean;
}

export interface ModelInfo {
  id: string;              // provider/model
  name: string;
  provider: string;
  providerName: string;
  logoUrl?: string;
  capabilities: ModelCapabilityInfo;
  limits: ModelLimitsInfo;
  pricing?: ModelPricingInfo;
  authStatus: ModelAuthStatus;
  isNew?: boolean;
  source: 'pi-ai' | 'models.dev' | 'custom';
}

export interface ModelsResponse {
  models: ModelInfo[];
  total: number;
  source: string;
  lastUpdated?: string;
}

export class ModelsApi {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Get all available models with enhanced metadata
   */
  async getModels(): Promise<ModelsResponse> {
    const response = await fetch(`${this.baseUrl}/api/models`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Failed to fetch models');
    }

    return data.payload;
  }

  /**
   * Force refresh models cache from Models.dev API
   */
  async refreshModels(): Promise<{ message: string; lastUpdated?: string }> {
    const response = await fetch(`${this.baseUrl}/api/models/refresh`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh models: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Failed to refresh models');
    }

    return {
      message: data.message,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * Filter models by capability
   */
  filterByCapability(
    models: ModelInfo[],
    capability: keyof ModelCapabilityInfo
  ): ModelInfo[] {
    return models.filter((m) => m.capabilities[capability]);
  }

  /**
   * Filter models by provider
   */
  filterByProvider(models: ModelInfo[], provider: string): ModelInfo[] {
    return models.filter((m) => m.provider === provider);
  }

  /**
   * Filter models by authentication status
   */
  filterByAuthStatus(
    models: ModelInfo[],
    status: 'configured' | 'oauth' | 'api_key'
  ): ModelInfo[] {
    switch (status) {
      case 'configured':
        return models.filter((m) => m.authStatus.configured);
      case 'oauth':
        return models.filter((m) => m.authStatus.hasOAuth);
      case 'api_key':
        return models.filter((m) =>
          m.authStatus.supportedTypes.includes('api_key')
        );
      default:
        return models;
    }
  }

  /**
   * Sort models by pricing (input cost)
   */
  sortByPrice(models: ModelInfo[], direction: 'asc' | 'desc' = 'asc'): ModelInfo[] {
    return [...models].sort((a, b) => {
      const priceA = a.pricing?.input ?? Infinity;
      const priceB = b.pricing?.input ?? Infinity;
      return direction === 'asc' ? priceA - priceB : priceB - priceA;
    });
  }

  /**
   * Sort models by context window
   */
  sortByContextWindow(
    models: ModelInfo[],
    direction: 'asc' | 'desc' = 'desc'
  ): ModelInfo[] {
    return [...models].sort((a, b) => {
      const ctxA = a.limits.context;
      const ctxB = b.limits.context;
      return direction === 'asc' ? ctxA - ctxB : ctxB - ctxA;
    });
  }

  /**
   * Group models by provider
   */
  groupByProvider(models: ModelInfo[]): Map<string, ModelInfo[]> {
    const grouped = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const list = grouped.get(model.provider) ?? [];
      list.push(model);
      grouped.set(model.provider, list);
    }
    return grouped;
  }

  /**
   * Format price for display
   */
  formatPrice(price: number): string {
    if (price === 0) return 'Free';
    if (price < 0.01) return `$${(price * 100).toFixed(2)}¢ / 1M tokens`;
    return `$${price.toFixed(2)} / 1M tokens`;
  }

  /**
   * Get capability tags for a model
   */
  getCapabilityTags(model: ModelInfo): string[] {
    const tags: string[] = [];
    if (model.capabilities.image) tags.push('vision');
    if (model.capabilities.reasoning) tags.push('reasoning');
    if (model.capabilities.toolCall) tags.push('tools');
    if (model.isNew) tags.push('new');
    if (model.pricing && model.pricing.input < 1) tags.push('cheap');
    return tags;
  }
}

// Singleton instance
let globalApi: ModelsApi | null = null;

export function getModelsApi(baseUrl?: string, token?: string): ModelsApi {
  if (!globalApi && baseUrl) {
    globalApi = new ModelsApi(baseUrl, token);
  } else if (globalApi && baseUrl) {
    // Update if params changed
    globalApi = new ModelsApi(baseUrl, token);
  } else if (!globalApi) {
    throw new Error('ModelsApi not initialized');
  }
  return globalApi;
}
