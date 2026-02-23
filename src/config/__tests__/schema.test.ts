import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  AgentDefaultsSchema,
  TelegramConfigSchema,
  ModelsConfigSchema,
  GatewayConfigSchema,
  CronConfigSchema,
  ToolsConfigSchema,
  WhatsAppConfigSchema,
  ModelDefSchema,
  getApiKey,
  getApiBase,
  parseModelId,
  isProviderConfigured,
  listConfiguredProviders,
  getWorkspacePath,
  listBuiltinModels,
  PROVIDER_OPTIONS,
  PROVIDER_NAMES,
  resolveEnvVars,
} from '../schema.js';

describe('ConfigSchema', () => {
  it('should parse empty object with defaults', () => {
    const config = ConfigSchema.parse({});

    expect(config.agents.defaults.model).toBe('anthropic/claude-sonnet-4-5');
    expect(config.agents.defaults.maxTokens).toBe(8192);
    expect(config.agents.defaults.temperature).toBe(0.7);
    expect(config.agents.defaults.maxToolIterations).toBe(20);
  });

  it('should merge with provided values', () => {
    const config = ConfigSchema.parse({
      agents: {
        defaults: {
          model: 'openai/gpt-4o',
          temperature: 0.5,
        },
      },
    });

    expect(config.agents.defaults.model).toBe('openai/gpt-4o');
    expect(config.agents.defaults.temperature).toBe(0.5);
    expect(config.agents.defaults.maxTokens).toBe(8192);
  });

  it('should validate models.providers configuration', () => {
    const config = ConfigSchema.parse({
      models: {
        providers: {
          kimi: {
            apiKey: 'sk-test123',
            baseUrl: 'https://api.moonshot.cn/v1',
            api: 'anthropic-messages',
            models: [{
              id: 'kimi-k2.5',
              name: 'Kimi K2.5',
              contextWindow: 256000,
              maxTokens: 8192,
            }],
          },
        },
      },
    });

    expect(config.models.providers.kimi.apiKey).toBe('sk-test123');
    expect(config.models.providers.kimi.models[0].id).toBe('kimi-k2.5');
  });

  it('should validate channel configuration', () => {
    const config = ConfigSchema.parse({
      channels: {
        telegram: {
          enabled: true,
          token: 'bot-token',
          allowFrom: ['123456'],
        },
      },
    });

    expect(config.channels.telegram.enabled).toBe(true);
    expect(config.channels.telegram.token).toBe('bot-token');
    expect(config.channels.telegram.allowFrom).toEqual(['123456']);
  });

  it('should throw on invalid data', () => {
    expect(() => {
      ConfigSchema.parse({
        agents: {
          defaults: {
            temperature: 'invalid',
          },
        },
      });
    }).toThrow();
  });

  it('should support model selection with fallbacks', () => {
    const config = ConfigSchema.parse({
      agents: {
        defaults: {
          model: {
            primary: 'kimi/kimi-k2.5',
            fallbacks: ['minimax/MiniMax-M2.1', 'openai/gpt-4o'],
          },
        },
      },
    });

    const model = config.agents.defaults.model as { primary: string; fallbacks: string[] };
    expect(model.primary).toBe('kimi/kimi-k2.5');
    expect(model.fallbacks).toEqual(['minimax/MiniMax-M2.1', 'openai/gpt-4o']);
  });

  it('should support model aliases', () => {
    const config = ConfigSchema.parse({
      agents: {
        defaults: {
          models: {
            'kimi/kimi-k2.5': { alias: 'kimi' },
            'minimax/MiniMax-M2.1': { alias: 'minimax', params: { temperature: 0.8 } },
          },
        },
      },
    });

    expect(config.agents.defaults.models['kimi/kimi-k2.5'].alias).toBe('kimi');
    expect(config.agents.defaults.models['minimax/MiniMax-M2.1'].params?.temperature).toBe(0.8);
  });

  it('should support imageModel configuration', () => {
    const config = ConfigSchema.parse({
      agents: {
        defaults: {
          imageModel: {
            primary: 'openrouter/qwen-vl',
            fallbacks: ['google/gemini-2.5-flash'],
          },
        },
      },
    });

    const imageModel = config.agents.defaults.imageModel as { primary: string; fallbacks: string[] };
    expect(imageModel.primary).toBe('openrouter/qwen-vl');
  });
});

describe('ModelsConfigSchema', () => {
  it('should parse with default mode', () => {
    const config = ModelsConfigSchema.parse({});
    expect(config.mode).toBe('merge');
    expect(config.providers).toEqual({});
  });

  it('should parse with custom providers', () => {
    const config = ModelsConfigSchema.parse({
      mode: 'replace',
      providers: {
        kimi: {
          baseUrl: 'https://api.moonshot.cn/v1',
          apiKey: '${KIMI_API_KEY}',
          api: 'anthropic-messages',
          models: [
            { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 256000 },
          ],
        },
      },
    });

    expect(config.mode).toBe('replace');
    expect(config.providers.kimi.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(config.providers.kimi.models[0].id).toBe('kimi-k2.5');
  });
});

describe('ModelDefSchema', () => {
  it('should parse with defaults', () => {
    const model = ModelDefSchema.parse({
      id: 'test-model',
      name: 'Test Model',
    });

    expect(model.id).toBe('test-model');
    expect(model.name).toBe('Test Model');
    expect(model.reasoning).toBe(false);
    expect(model.input).toEqual(['text']);
    expect(model.contextWindow).toBe(128000);
    expect(model.maxTokens).toBe(16384);
  });

  it('should parse with all fields', () => {
    const model = ModelDefSchema.parse({
      id: 'kimi-k2.5',
      name: 'Kimi K2.5',
      reasoning: true,
      input: ['text', 'image'],
      cost: { input: 10, output: 50 },
      contextWindow: 256000,
      maxTokens: 8192,
    });

    expect(model.reasoning).toBe(true);
    expect(model.input).toEqual(['text', 'image']);
    expect(model.cost.input).toBe(10);
    expect(model.contextWindow).toBe(256000);
  });
});

describe('Environment Variable Resolution', () => {
  it('should resolve env variables', () => {
    process.env.TEST_API_KEY = 'test-value';
    expect(resolveEnvVars('${TEST_API_KEY}')).toBe('test-value');
    delete process.env.TEST_API_KEY;
  });

  it('should throw on missing env variable', () => {
    expect(() => resolveEnvVars('${NONEXISTENT_VAR}')).toThrow();
  });

  it('should return non-env string unchanged', () => {
    expect(resolveEnvVars('regular-string')).toBe('regular-string');
  });
});

describe('Model Reference Parsing', () => {
  it('should parse provider/model format', () => {
    const ref = parseModelRef('kimi/kimi-k2.5');
    expect(ref.provider).toBe('kimi');
    expect(ref.model).toBe('kimi-k2.5');
  });

  it('should detect provider from model name', () => {
    expect(parseModelRef('gpt-4o').provider).toBe('openai');
    expect(parseModelRef('claude-3').provider).toBe('anthropic');
    expect(parseModelRef('kimi-k2.5').provider).toBe('kimi');
  });
});

describe('Helper Functions', () => {
  describe('getApiKey', () => {
    it('should get API key from config', () => {
      const config = ConfigSchema.parse({
        models: {
          providers: {
            kimi: { apiKey: 'sk-123' },
          },
        },
      });

      expect(getApiKey(config, 'kimi')).toBe('sk-123');
    });

    it('should resolve env variables', () => {
      process.env.KIMI_KEY = 'resolved-key';
      const config = ConfigSchema.parse({
        models: {
          providers: {
            kimi: { apiKey: '${KIMI_KEY}' },
          },
        },
      });

      expect(getApiKey(config, 'kimi')).toBe('resolved-key');
      delete process.env.KIMI_KEY;
    });
  });

  describe('getApiBase', () => {
    it('should get base URL from config', () => {
      const config = ConfigSchema.parse({
        models: {
          providers: {
            kimi: { baseUrl: 'https://api.moonshot.cn/v1' },
          },
        },
      });

      expect(getApiBase(config, 'kimi')).toBe('https://api.moonshot.cn/v1');
    });
  });

  describe('isProviderConfigured', () => {
    it('should check if provider has API key', () => {
      const config = ConfigSchema.parse({
        models: {
          providers: {
            kimi: { apiKey: 'sk-123' },
            openai: {},
          },
        },
      });

      expect(isProviderConfigured(config, 'kimi')).toBe(true);
      expect(isProviderConfigured(config, 'openai')).toBe(false);
    });
  });

  describe('listConfiguredProviders', () => {
    it('should list all providers', () => {
      const config = ConfigSchema.parse({
        models: {
          providers: {
            kimi: { apiKey: 'sk-123' },
            openai: { apiKey: 'sk-456' },
          },
        },
      });

      const providers = listConfiguredProviders(config);
      expect(providers).toContain('kimi');
      expect(providers).toContain('openai');
    });
  });

  describe('getWorkspacePath', () => {
    it('should expand home directory', () => {
      const config = ConfigSchema.parse({
        agents: { defaults: { workspace: '~/test-workspace' } },
      });

      const path = getWorkspacePath(config);
      expect(path).not.toContain('~');
      expect(path).toContain('test-workspace');
    });
  });
});

describe('listBuiltinModels', () => {
  it('should return built-in models', () => {
    const models = listBuiltinModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
    expect(models[0]).toHaveProperty('provider');
  });
});

describe('PROVIDER_NAMES', () => {
  it('should have provider names', () => {
    expect(PROVIDER_NAMES.openai).toBe('OpenAI');
    expect(PROVIDER_NAMES.kimi).toBe('Kimi');
  });
});

describe('PROVIDER_OPTIONS', () => {
  it('should have provider options', () => {
    expect(PROVIDER_OPTIONS.length).toBeGreaterThan(0);
    expect(PROVIDER_OPTIONS[0]).toHaveProperty('name');
    expect(PROVIDER_OPTIONS[0]).toHaveProperty('envKey');
  });
});
