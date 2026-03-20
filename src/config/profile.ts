import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { resolveStateDir } from './paths.js';

export interface ProfileInfo {
  name: string;
  stateDir: string;
  isActive: boolean;
  agentCount: number;
  createdAt?: string;
}

export function resolveProfileStateDir(profile: string): string {
  const home = process.env.XOPCBOT_HOME || homedir();
  return profile === 'default' ? join(home, '.xopcbot') : join(home, `.xopcbot-${profile}`);
}

function countAgents(stateDir: string): number {
  const agentsDir = join(stateDir, 'agents');
  if (!existsSync(agentsDir)) return 0;
  try {
    return readdirSync(agentsDir).filter((name) => {
      try {
        return statSync(join(agentsDir, name)).isDirectory();
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

export function getCurrentProfile(): string {
  return process.env.XOPCBOT_PROFILE || 'default';
}

export function listProfiles(): ProfileInfo[] {
  const home = process.env.XOPCBOT_HOME || homedir();
  const active = resolveStateDir();
  const out: ProfileInfo[] = [];

  const defaultDir = join(home, '.xopcbot');
  if (existsSync(defaultDir)) {
    out.push({
      name: 'default',
      stateDir: defaultDir,
      isActive: active === defaultDir,
      agentCount: countAgents(defaultDir),
    });
  }

  try {
    for (const entry of readdirSync(home)) {
      if (!entry.startsWith('.xopcbot-')) continue;
      const name = entry.replace(/^\.xopcbot-/, '');
      if (!name) continue;
      const stateDir = join(home, entry);
      try {
        if (!statSync(stateDir).isDirectory()) continue;
      } catch {
        continue;
      }
      out.push({
        name,
        stateDir,
        isActive: active === stateDir,
        agentCount: countAgents(stateDir),
      });
    }
  } catch {
    // ignore
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function createProfile(name: string): ProfileInfo {
  if (name === 'default') {
    throw new Error('Profile "default" already exists as ~/.xopcbot');
  }
  const stateDir = resolveProfileStateDir(name);
  if (existsSync(stateDir)) {
    throw new Error(`Profile "${name}" already exists at ${stateDir}`);
  }
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(stateDir, 'credentials'), { recursive: true, mode: 0o700 });
  mkdirSync(join(stateDir, 'agents'), { recursive: true, mode: 0o700 });
  return {
    name,
    stateDir,
    isActive: false,
    agentCount: 0,
  };
}

export function deleteProfile(name: string): void {
  if (name === 'default') {
    throw new Error('Cannot delete the default profile directory');
  }
  const stateDir = resolveProfileStateDir(name);
  if (!existsSync(stateDir)) {
    throw new Error(`Profile "${name}" not found`);
  }
  rmSync(stateDir, { recursive: true, force: true });
}
