import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  resolveStateDir,
  resolveAgentDir,
  resolveWorkspaceDir,
  resolveSessionsDir,
  resolveRunDir,
} from '../config/paths.js';

export type AgentStatus = 'idle' | 'running' | 'stopped' | 'error';

export interface AgentDescriptor {
  id: string;
  name: string;
  status: AgentStatus;
  pid?: number;
  agentDir: string;
  workspaceDir: string;
  sessionsDir: string;
  lastActiveAt?: string;
}

export interface CreateAgentOptions {
  name?: string;
  description?: string;
  model?: string;
}

const DEFAULT_AGENT_FILE = 'agent.json';

function readAgentJson(agentDir: string): Record<string, unknown> | null {
  const p = join(agentDir, DEFAULT_AGENT_FILE);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferStatus(agentDir: string): AgentStatus {
  const runDir = join(agentDir, 'run');
  const pidFile = join(runDir, 'pid');
  if (!existsSync(pidFile)) return 'idle';
  try {
    const pid = Number.parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    if (!Number.isFinite(pid)) return 'idle';
    try {
      process.kill(pid, 0);
      return 'running';
    } catch {
      return 'stopped';
    }
  } catch {
    return 'idle';
  }
}

export class AgentRegistry {
  constructor(private readonly stateDir: string = resolveStateDir()) {}

  resolveAgentDir(agentId: string): string {
    return join(this.stateDir, 'agents', agentId);
  }

  async listAgents(): Promise<AgentDescriptor[]> {
    const root = join(this.stateDir, 'agents');
    if (!existsSync(root)) return [];
    const ids = readdirSync(root).filter((id) => {
      try {
        return statSync(join(root, id)).isDirectory();
      } catch {
        return false;
      }
    });
    const out: AgentDescriptor[] = [];
    for (const id of ids) {
      const d = await this.getAgent(id);
      if (d) out.push(d);
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  async getAgent(agentId: string): Promise<AgentDescriptor | null> {
    const agentDir = this.resolveAgentDir(agentId);
    if (!existsSync(agentDir)) return null;
    const meta = readAgentJson(agentDir);
    const name = (meta?.name as string) || agentId;
    return {
      id: agentId,
      name,
      status: inferStatus(agentDir),
      agentDir,
      workspaceDir: resolveWorkspaceDir(agentId),
      sessionsDir: resolveSessionsDir(agentId),
      lastActiveAt: meta?.lastActiveAt as string | undefined,
    };
  }

  async createAgent(id: string, options: CreateAgentOptions = {}): Promise<AgentDescriptor> {
    const agentDir = this.resolveAgentDir(id);
    if (existsSync(agentDir)) {
      throw new Error(`Agent "${id}" already exists`);
    }
    mkdirSync(join(agentDir, 'workspace'), { recursive: true });
    mkdirSync(join(agentDir, 'sessions', 'archive'), { recursive: true });
    mkdirSync(join(agentDir, 'inbox', 'pending'), { recursive: true });
    mkdirSync(join(agentDir, 'inbox', 'processed'), { recursive: true });
    mkdirSync(join(agentDir, 'credentials'), { recursive: true });
    const now = new Date().toISOString();
    const payload = {
      version: 1,
      id,
      name: options.name ?? id,
      description: options.description ?? '',
      model: options.model ?? '',
      createdAt: now,
      lastActiveAt: now,
      config: {},
      channels: [] as string[],
      tags: [] as string[],
    };
    writeFileSync(join(agentDir, DEFAULT_AGENT_FILE), JSON.stringify(payload, null, 2));
    return (await this.getAgent(id))!;
  }

  async deleteAgent(id: string): Promise<void> {
    const agentDir = this.resolveAgentDir(id);
    if (!existsSync(agentDir)) {
      throw new Error(`Agent "${id}" not found`);
    }
    rmSync(agentDir, { recursive: true, force: true });
  }

  async setDefaultAgent(id: string): Promise<void> {
    const marker = join(this.stateDir, 'agents', '.default');
    writeFileSync(marker, `${id}\n`);
  }

  async getDefaultAgentId(): Promise<string> {
    const marker = join(this.stateDir, 'agents', '.default');
    if (existsSync(marker)) {
      return readFileSync(marker, 'utf-8').trim() || 'main';
    }
    return 'main';
  }

  /** Remove stale run/ state (dead pid files). */
  pruneOrphanRunDirs(): number {
    let n = 0;
    const agentsRoot = join(this.stateDir, 'agents');
    if (!existsSync(agentsRoot)) return 0;
    for (const id of readdirSync(agentsRoot)) {
      const run = resolveRunDir(id);
      const pidFile = join(run, 'pid');
      if (!existsSync(pidFile)) continue;
      try {
        const pid = Number.parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
        if (!Number.isFinite(pid)) throw new Error('bad pid');
        process.kill(pid, 0);
      } catch {
        try {
          rmSync(run, { recursive: true, force: true });
          n++;
        } catch {
          // ignore
        }
      }
    }
    return n;
  }
}
