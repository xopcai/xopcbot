#!/usr/bin/env tsx
/**
 * Update Models.dev Data Script
 *
 * Fetches latest model data from models.dev API and generates
 * a static JSON file for offline use.
 *
 * Usage:
 *   pnpm run update-models          # Update with default config
 *   pnpm run update-models --all    # Include all providers
 *   pnpm run update-models --providers openai,anthropic,google
 *
 * The generated JSON is committed to git and serves as the
 * built-in data source for the application.
 */

import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_FILE = join(ROOT_DIR, 'src', 'services', 'models-dev-data.json');
const API_URL = 'https://models.dev/api.json';

// Default providers to include (popular/well-maintained)
// Includes international and Chinese domestic versions
const DEFAULT_PROVIDERS = [
  // International
  'openai',
  'anthropic',
  'google',
  'xai',
  'groq',
  'openrouter',
  'ollama',
  // Alibaba (Qwen) - International & Domestic
  'alibaba',        // International
  'alibaba-cn',     // 国内版 (dashscope.aliyun.cn)
  // Kimi - International & Domestic
  'moonshotai',     // kimi.moonshot.cn
  'moonshotai-cn',  // kimi-cn.moonshot.cn (国内版)
  // MiniMax - International & Domestic
  'minimax',        // api.minimax.chat
  'minimax-cn',     // 国内版
  // Zhipu AI (GLM/智谱)
  'zhipuai',        // open.bigmodel.cn
  // DeepSeek
  'deepseek',
  // StepFun (阶跃星辰)
  'stepfun',
];

// Provider metadata overrides (API data might be incomplete)
const PROVIDER_METADATA: Record<string, { name?: string; npm?: string }> = {
  'alibaba': { name: 'Alibaba Cloud (Qwen)', npm: 'openai' },
  'alibaba-cn': { name: 'Alibaba Cloud CN (通义千问国内版)', npm: 'openai' },
  'moonshotai': { name: 'Moonshot AI (Kimi)', npm: 'openai' },
  'moonshotai-cn': { name: 'Moonshot AI China (Kimi 国内版)', npm: 'openai' },
  'minimax': { name: 'MiniMax International', npm: 'openai' },
  'minimax-cn': { name: 'MiniMax China (国内版)', npm: 'openai' },
  'zhipuai': { name: 'Zhipu AI (智谱/GLM)', npm: 'openai' },
  'stepfun': { name: 'StepFun (阶跃星辰)', npm: 'openai' },
};

interface RawModel {
  id: string;
  name: string;
  family: string;
  reasoning: boolean;
  tool_call: boolean;
  temperature: boolean;
  attachment: boolean;
  modalities: {
    input: string[];
    output: string[];
  };
  limit: {
    context: number;
    output: number;
  };
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_write?: number;
  };
  knowledge?: string;
  release_date: string;
  last_updated: string;
  open_weights: boolean;
}

interface RawProvider {
  id: string;
  name: string;
  api: string;
  npm?: string;
  doc: string;
  env: string[];
  models: Record<string, RawModel>;
}

interface OutputData {
  metadata: {
    version: string;
    generatedAt: string;
    source: string;
    totalProviders: number;
    totalModels: number;
    includedProviders: string[];
  };
  providers: RawProvider[];
}

async function fetchFromAPI(): Promise<Record<string, RawProvider>> {
  console.log('📡 Fetching from models.dev API...');
  
  const response = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as Record<string, RawProvider>;
  console.log(`✅ Fetched ${Object.keys(data).length} providers from API`);
  
  return data;
}

function filterProviders(
  data: Record<string, RawProvider>,
  includeList: string[]
): RawProvider[] {
  const providers: RawProvider[] = [];

  for (const [id, provider] of Object.entries(data)) {
    if (!includeList.includes(id)) continue;

    // Apply metadata overrides
    const overrides = PROVIDER_METADATA[id];
    if (overrides) {
      if (overrides.name) provider.name = overrides.name;
      if (overrides.npm) provider.npm = overrides.npm;
    }

    providers.push(provider);
  }

  // Sort by order in includeList
  providers.sort((a, b) => {
    const idxA = includeList.indexOf(a.id);
    const idxB = includeList.indexOf(b.id);
    return idxA - idxB;
  });

  return providers;
}

function generateOutput(providers: RawProvider[]): OutputData {
  const totalModels = providers.reduce(
    (sum, p) => sum + Object.keys(p.models).length,
    0
  );

  return {
    metadata: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      source: API_URL,
      totalProviders: providers.length,
      totalModels,
      includedProviders: providers.map((p) => p.id),
    },
    providers,
  };
}

async function writeOutput(data: OutputData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  
  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, json, 'utf-8');
  
  console.log(`\n💾 Written to: ${OUTPUT_FILE}`);
  console.log(`   Providers: ${data.metadata.totalProviders}`);
  console.log(`   Models: ${data.metadata.totalModels}`);
  console.log(`   Generated: ${data.metadata.generatedAt}`);
}

function parseArgs(): { providers: string[] | 'all' } {
  const args = process.argv.slice(2);
  
  if (args.includes('--all')) {
    return { providers: 'all' };
  }
  
  const providersIdx = args.findIndex((a) => a === '--providers');
  if (providersIdx !== -1 && args[providersIdx + 1]) {
    return { providers: args[providersIdx + 1].split(',') };
  }
  
  return { providers: DEFAULT_PROVIDERS };
}

async function main(): Promise<void> {
  console.log('🔄 Updating models.dev built-in data...\n');
  
  try {
    const { providers: providerFilter } = parseArgs();
    
    // Fetch from API
    const apiData = await fetchFromAPI();
    
    // Filter providers
    const includeList = providerFilter === 'all' 
      ? Object.keys(apiData)
      : providerFilter;
    
    const filtered = filterProviders(apiData, includeList);
    console.log(`🔍 Filtered to ${filtered.length} providers`);
    
    // Generate output
    const output = generateOutput(filtered);
    
    // Write file
    await writeOutput(output);
    
    console.log('\n✨ Done! Remember to commit the changes.');
    console.log('   git add src/services/models-dev-data.json');
    
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
