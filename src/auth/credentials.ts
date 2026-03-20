import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { resolveCredentialsDir, resolveAgentDir, resolveAgentId } from '../config/paths.js';
import type { Config } from '../config/schema.js';

const AUTH_PROFILES_FILE = 'auth-profiles.json';

export interface OAuthTokenRecord {
  type: 'oauth';
  provider: string;
  access: string;
  refresh?: string;
  expiresAt?: number;
  scope?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CredentialProfile {
  type: 'api_key' | 'oauth';
  provider: string;
  envVar?: string | null;
  key?: string | null;
}

export interface AuthProfilesFile {
  version: number;
  profiles: Record<string, CredentialProfile>;
}

const DEFAULT_PROFILES: AuthProfilesFile = {
  version: 2,
  profiles: {},
};

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Resolves API keys and OAuth tokens: agent credentials → global auth-profiles → OAuth files → env.
 * Optional legacy `config.providers` is checked when passed to getApiKeyWithConfig.
 */
export class CredentialResolver {
  private readonly globalProfilesPath: string;
  private readonly agentProfilesPath: string | null;
  private profilesCache: AuthProfilesFile | null = null;
  private profilesMtime = 0;

  constructor(agentId?: string) {
    const credRoot = resolveCredentialsDir();
    this.globalProfilesPath = join(credRoot, AUTH_PROFILES_FILE);
    this.agentProfilesPath = agentId ? join(resolveAgentDir(agentId), 'credentials', AUTH_PROFILES_FILE) : null;
  }

  private loadProfilesFile(path: string): AuthProfilesFile | null {
    const data = readJson<AuthProfilesFile>(path);
    if (!data?.profiles) return null;
    return data;
  }

  private getMergedProfiles(): AuthProfilesFile {
    const agent = this.agentProfilesPath ? this.loadProfilesFile(this.agentProfilesPath) : null;
    const global = this.loadProfilesFile(this.globalProfilesPath);
    if (!agent && !global) {
      return DEFAULT_PROFILES;
    }
    return {
      version: 2,
      profiles: {
        ...(global?.profiles ?? {}),
        ...(agent?.profiles ?? {}),
      },
    };
  }

  /**
   * Find key for provider from profiles (key field or envVar).
   */
  private keyFromProfiles(provider: string): string | undefined {
    const merged = this.getMergedProfiles();
    for (const profile of Object.values(merged.profiles)) {
      if (profile.provider !== provider || profile.type !== 'api_key') continue;
      if (profile.key) return profile.key;
      if (profile.envVar && process.env[profile.envVar]) {
        return process.env[profile.envVar];
      }
    }
    return undefined;
  }

  private bearerFromOAuth(provider: string): string | undefined {
    const credRoot = resolveCredentialsDir();
    const oauthPath = join(credRoot, 'oauth', `${provider}.json`);
    const rec = readJson<OAuthTokenRecord & { access?: string }>(oauthPath);
    if (rec?.access) {
      return rec.access;
    }
    return undefined;
  }

  /**
   * Profiles, OAuth files, and legacy config.providers only (no env, no models.json).
   */
  resolveApiKeySync(provider: string, legacyConfig?: Config | null): string | undefined {
    const fromProfiles = this.keyFromProfiles(provider);
    if (fromProfiles) return fromProfiles;

    const oauth = this.bearerFromOAuth(provider);
    if (oauth) return oauth;

    return legacyConfig?.providers?.[provider];
  }

  listProfiles(): CredentialProfile[] {
    const merged = this.getMergedProfiles();
    return Object.values(merged.profiles);
  }

  saveApiKey(
    provider: string,
    key: string,
    profileId: string = `${provider}:default`,
  ): void {
    const credRoot = resolveCredentialsDir();
    ensureDir(credRoot);
    const path = this.globalProfilesPath;
    const existing = readJson<AuthProfilesFile>(path) ?? { ...DEFAULT_PROFILES };
    existing.version = 2;
    existing.profiles = existing.profiles ?? {};
    existing.profiles[profileId] = {
      type: 'api_key',
      provider,
      envVar: null,
      key,
    };
    writeFileSync(path, JSON.stringify(existing, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
    this.profilesCache = null;
  }

  saveOAuthToken(provider: string, token: OAuthTokenRecord): void {
    const credRoot = resolveCredentialsDir();
    const oauthDir = join(credRoot, 'oauth');
    ensureDir(oauthDir);
    const path = join(oauthDir, `${provider}.json`);
    const now = new Date().toISOString();
    const payload = {
      ...token,
      provider,
      updatedAt: now,
      createdAt: token.createdAt ?? now,
    };
    writeFileSync(path, JSON.stringify(payload, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
  }
}

/**
 * Sync API key resolution for use from providers/index (no async).
 */
export function resolveApiKeyWithCredentialStore(
  provider: string,
  config?: Config | null,
): string | undefined {
  const resolver = new CredentialResolver(resolveAgentId());
  return resolver.resolveApiKeySync(provider, config);
}
