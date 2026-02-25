/**
 * Models.dev Types
 *
 * Type definitions for models.dev API data structures.
 * models.dev is a comprehensive open-source database of AI model specifications.
 *
 * @see https://models.dev
 */

// ============================================
// Raw Models.dev API Types
// ============================================

/**
 * Input/Output modalities
 */
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'pdf';

/**
 * Raw model data from models.dev API
 */
export interface ModelsDevRawModel {
  id: string;
  name: string;
  family: string;

  // Capabilities
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  temperature: boolean;
  interleaved?: boolean; // For multimodal models

  // Modalities
  modalities: {
    input: Modality[];
    output: Modality[];
  };

  // Limits
  limit: {
    context: number;
    output: number;
  };

  // Pricing (per 1M tokens)
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_write?: number;
    // Some providers have tiered pricing for context > 200k
    context_over_200k?: {
      input: number;
      output: number;
      cache_read?: number;
      cache_write?: number;
    };
  };

  // Metadata
  knowledge?: string; // Knowledge cutoff date, e.g., "2024-08"
  release_date: string; // ISO 8601 date
  last_updated: string; // ISO 8601 date
  open_weights: boolean;
}

/**
 * Raw provider data from models.dev API
 */
export interface ModelsDevRawProvider {
  id: string;
  name: string;

  // Authentication
  env: string[]; // Environment variable names, e.g., ["OPENAI_API_KEY"]

  // Package info
  npm?: string; // NPM package, e.g., "@ai-sdk/openai"

  // API endpoint
  api: string; // Base API URL

  // Documentation
  doc: string; // Documentation URL

  // Models
  models: Record<string, ModelsDevRawModel>;
}

/**
 * Complete models.dev API response
 */
export type ModelsDevApiResponse = Record<string, ModelsDevRawProvider>;

// ============================================
// Internal Types (after processing)
// ============================================

/**
 * Authentication type
 */
export type AuthType = 'api_key' | 'oauth' | 'token' | 'none';

/**
 * Provider authentication configuration
 */
export interface ProviderAuthConfig {
  type: AuthType;

  // API Key config
  envKeys?: string[];
  headerName?: string;
  headerPrefix?: string;

  // OAuth config
  oauthConfig?: {
    providerId: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    usePKCE: boolean;
  };

  // Token config (for providers like GitHub Copilot)
  tokenConfig?: {
    envKey: string;
    headerPrefix: string;
  };
}

/**
 * Model definition (unified)
 */
export interface ModelsDevModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;

  // Source tracking
  source: 'models.dev' | 'pi-ai';

  // Capabilities
  capabilities: {
    text: boolean;
    image: boolean;
    audio: boolean;
    video: boolean;
    pdf: boolean;
    reasoning: boolean;
    toolCall: boolean;
    attachment: boolean;
    temperature: boolean;
  };

  // Limits
  limits: {
    context: number;
    output: number;
  };

  // Pricing (per 1M tokens)
  pricing?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };

  // Authentication requirements
  auth: {
    required: boolean;
    types: AuthType[];
  };

  // Metadata
  metadata: {
    family?: string;
    releaseDate?: Date;
    lastUpdated?: Date;
    knowledgeCutoff?: string;
    openWeights: boolean;
    isNew?: boolean; // Released within 30 days
  };
}

/**
 * Provider definition (unified)
 */
export interface ModelsDevProvider {
  id: string;
  name: string;
  description?: string;

  // Source tracking
  sources: {
    modelsDev: boolean;
    piAi: boolean;
  };

  // API configuration
  api: {
    baseUrl: string;
    npmPackage?: string;
    docUrl: string;
  };

  // Authentication
  auth: ProviderAuthConfig;

  // Logo
  logoUrl: string;

  // Models
  models: ModelsDevModel[];
}

// ============================================
// Service Types
// ============================================

/**
 * Cache entry structure
 */
export interface ModelsDevCacheEntry {
  data: ModelsDevRawProvider[];
  timestamp: number;
  etag?: string;
}

/**
 * Service configuration
 */
export interface ModelsDevServiceConfig {
  /** Cache duration in milliseconds (default: 24 hours) */
  cacheDurationMs: number;
  /** API endpoint URL */
  apiUrl: string;
  /** Enable/disable service */
  enabled: boolean;
  /** Providers to exclude */
  excludeProviders?: string[];
  /** Providers to include (if specified, only these) */
  includeProviders?: string[];
}

/**
 * Provider ID mapping (models.dev -> internal)
 */
export type ProviderIdMap = Record<string, string>;

// ============================================
// Utility Types
// ============================================

/**
 * Model filter options
 */
export interface ModelFilterOptions {
  provider?: string;
  capabilities?: Array<keyof ModelsDevModel['capabilities']>;
  authType?: AuthType;
  maxPrice?: number;
  minContextWindow?: number;
  includeDeprecated?: boolean;
  onlyNew?: boolean;
}

/**
 * Model sort options
 */
export type ModelSortField =
  | 'name'
  | 'releaseDate'
  | 'pricing'
  | 'contextWindow';

export interface ModelSortOptions {
  field: ModelSortField;
  direction: 'asc' | 'desc';
}
