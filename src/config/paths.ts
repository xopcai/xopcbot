import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

export const XOPCBOT_DIR = '.xopcbot';

/** @deprecated Use resolveStateDir */
export const DEFAULT_BASE_DIR = join(homedir(), XOPCBOT_DIR);

/** @deprecated Use resolveStateDir */
export function getBaseDir(): string {
  return resolveStateDir();
}

export function resolveStateDir(): string {
  if (process.env.XOPCBOT_STATE_DIR) {
    return process.env.XOPCBOT_STATE_DIR;
  }
  const profile = process.env.XOPCBOT_PROFILE;
  const home = process.env.XOPCBOT_HOME || homedir();
  if (profile && profile !== 'default') {
    return join(home, `.xopcbot-${profile}`);
  }
  return join(home, XOPCBOT_DIR);
}

export function resolveConfigPath(): string {
  if (process.env.XOPCBOT_CONFIG_PATH) {
    return process.env.XOPCBOT_CONFIG_PATH;
  }
  if (process.env.XOPCBOT_CONFIG) {
    return process.env.XOPCBOT_CONFIG;
  }
  return join(resolveStateDir(), 'xopcbot.json');
}

export function resolveCredentialsDir(): string {
  return process.env.XOPCBOT_CREDENTIALS_DIR ?? join(resolveStateDir(), 'credentials');
}

export function resolveAgentId(): string {
  return process.env.XOPCBOT_AGENT_ID ?? 'main';
}

export function resolveAgentDir(agentId?: string): string {
  const id = agentId ?? resolveAgentId();
  return process.env.XOPCBOT_AGENT_DIR ?? join(resolveStateDir(), 'agents', id);
}

export function resolveWorkspaceDir(agentId?: string): string {
  return join(resolveAgentDir(agentId), 'workspace');
}

export function resolveSessionsDir(agentId?: string): string {
  return join(resolveAgentDir(agentId), 'sessions');
}

export function resolveInboxDir(agentId?: string): string {
  return join(resolveAgentDir(agentId), 'inbox');
}

export function resolveRunDir(agentId?: string): string {
  return join(resolveAgentDir(agentId), 'run');
}

export function resolveSubagentRegistryPath(): string {
  return join(resolveStateDir(), 'subagents', 'runs.json');
}

export function resolveExtensionsDir(): string {
  return join(resolveStateDir(), 'extensions');
}

export function resolveSkillsDir(): string {
  return join(resolveStateDir(), 'skills');
}

export function resolveCronDir(): string {
  return join(resolveStateDir(), 'cron');
}

export function resolveLogsDir(): string {
  return process.env.XOPCBOT_LOG_DIR ?? join(resolveStateDir(), 'logs');
}

export function resolveBinDir(): string {
  return join(resolveStateDir(), 'bin');
}

export function resolveToolsDir(): string {
  return join(resolveStateDir(), 'tools');
}

/**
 * Prefer xopcbot.json; fall back to legacy config.json when present.
 */
export function resolveEffectiveConfigPath(override?: string): string {
  if (override) {
    return override;
  }
  if (process.env.XOPCBOT_CONFIG_PATH) {
    return process.env.XOPCBOT_CONFIG_PATH;
  }
  if (process.env.XOPCBOT_CONFIG) {
    return process.env.XOPCBOT_CONFIG;
  }
  if (process.env.CONFIG_PATH) {
    return process.env.CONFIG_PATH;
  }
  const state = resolveStateDir();
  const primary = join(state, 'xopcbot.json');
  const legacy = join(state, 'config.json');
  if (existsSync(primary)) {
    return primary;
  }
  if (existsSync(legacy)) {
    return legacy;
  }
  return primary;
}

const LEGACY_WORKSPACE = join(resolveStateDir(), 'workspace');

/**
 * Session storage root: agents/<id>/sessions/, or legacy ~/.xopcbot/workspace/.sessions
 */
export function resolveEffectiveSessionsRoot(agentId?: string, legacyWorkspace?: string): string {
  const id = agentId ?? resolveAgentId();
  const next = resolveSessionsDir(id);
  const legacyWs = legacyWorkspace ?? LEGACY_WORKSPACE;
  const legacySessions = join(legacyWs, '.sessions');
  if (existsSync(join(resolveAgentDir(id), 'agent.json')) || existsSync(next)) {
    return next;
  }
  if (existsSync(legacySessions)) {
    return legacySessions;
  }
  return next;
}

export function getModelsJsonPath(): string {
  return process.env.XOPCBOT_MODELS_JSON ?? join(resolveStateDir(), 'models.json');
}

/** @deprecated Use resolveWorkspaceDir + resolveAgentId */
export function getDefaultWorkspacePath(): string {
  if (process.env.XOPCBOT_WORKSPACE) {
    return process.env.XOPCBOT_WORKSPACE;
  }
  const legacy = join(resolveStateDir(), 'workspace');
  if (existsSync(legacy) && !existsSync(join(resolveAgentDir('main'), 'agent.json'))) {
    return legacy;
  }
  return resolveWorkspaceDir();
}

export function getDefaultConfigPath(): string {
  return resolveEffectiveConfigPath();
}

function buildDefaultPaths() {
  const state = resolveStateDir();
  const primaryConfig = resolveEffectiveConfigPath();
  const workspace = getDefaultWorkspacePath();
  return {
    config: primaryConfig,
    modelsJson: getModelsJsonPath(),
    workspace,
    sessions: resolveEffectiveSessionsRoot(),
    extensions: join(workspace, '.extensions'),
    globalExtensions: resolveExtensionsDir(),
    memory: join(state, 'memory'),
    cronJobs: join(resolveCronDir(), 'jobs.json'),
  } as const;
}

export const DEFAULT_PATHS = buildDefaultPaths();

export function getGlobalExtensionsDir(): string {
  return resolveExtensionsDir();
}

export function getWorkspaceExtensionsDir(workspaceDir?: string): string {
  const ws = workspaceDir || getDefaultWorkspacePath();
  return join(ws, '.extensions');
}

export function getBundledExtensionsDir(): string | null {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const srcDir = dirname(currentFile);
    const bundledDir = join(srcDir, '..', '..', 'extensions');
    return bundledDir;
  } catch {
    return null;
  }
}

export function getBundledSkillsDir(): string | null {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const srcDir = dirname(currentFile);
    const packageRoot = join(srcDir, '..', '..');
    const skillsDir = join(packageRoot, 'skills');
    if (existsSync(skillsDir)) {
      return skillsDir;
    }
    const devPackageRoot = join(srcDir, '..', '..', '..');
    const devSkillsDir = join(devPackageRoot, 'skills');
    if (existsSync(devSkillsDir)) {
      return devSkillsDir;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveExtensionSdkPath(): string | null {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const srcDir = dirname(currentFile);
    return join(srcDir, '..', 'extension-sdk', 'index.ts');
  } catch {
    return null;
  }
}
