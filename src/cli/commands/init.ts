import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { Command } from 'commander';
import {
  resolveStateDir,
  resolveCredentialsDir,
  resolveAgentDir,
  resolveWorkspaceDir,
  resolveSessionsDir,
  resolveSubagentRegistryPath,
  resolveExtensionsDir,
  resolveSkillsDir,
  resolveCronDir,
  resolveLogsDir,
  resolveBinDir,
  resolveToolsDir,
  resolveEffectiveConfigPath,
} from '../../config/paths.js';
import { register, type CLIContext } from '../registry.js';
import { ConfigSchema, type Config } from '../../config/schema.js';

function ensureAgentOsLayout(agentId: string = 'main'): void {
  const state = resolveStateDir();
  mkdirSync(state, { recursive: true, mode: 0o700 });
  mkdirSync(resolveCredentialsDir(), { recursive: true, mode: 0o700 });
  mkdirSync(join(resolveCredentialsDir(), 'oauth'), { recursive: true, mode: 0o700 });

  const agentDir = resolveAgentDir(agentId);
  mkdirSync(join(agentDir, 'workspace', '.state'), { recursive: true });
  mkdirSync(join(agentDir, 'sessions', 'archive'), { recursive: true });
  mkdirSync(join(agentDir, 'inbox', 'pending'), { recursive: true });
  mkdirSync(join(agentDir, 'inbox', 'processed'), { recursive: true });
  mkdirSync(join(agentDir, 'credentials'), { recursive: true });

  const now = new Date().toISOString();
  const agentJson = join(agentDir, 'agent.json');
  if (!existsSync(agentJson)) {
    writeFileSync(
      agentJson,
      JSON.stringify(
        {
          version: 1,
          id: agentId,
          name: 'Main',
          description: 'Default agent',
          model: '',
          createdAt: now,
          lastActiveAt: now,
          config: {},
          channels: [],
          tags: ['primary'],
        },
        null,
        2,
      ),
    );
  }

  mkdirSync(dirname(resolveSubagentRegistryPath()), { recursive: true }); // subagents/
  mkdirSync(resolveExtensionsDir(), { recursive: true });
  mkdirSync(resolveSkillsDir(), { recursive: true });
  mkdirSync(resolveCronDir(), { recursive: true });
  mkdirSync(join(resolveCronDir(), 'logs'), { recursive: true });
  mkdirSync(resolveLogsDir(), { recursive: true });
  mkdirSync(resolveBinDir(), { recursive: true });
  mkdirSync(resolveToolsDir(), { recursive: true });
}

function createInitCommand(_ctx: CLIContext): Command {
  return new Command('init')
    .description('Create Agent OS state directory layout under ~/.xopcbot (or XOPCBOT_STATE_DIR)')
    .option('--agent <id>', 'Bootstrap agent id', 'main')
    .action((opts: { agent: string }) => {
      ensureAgentOsLayout(opts.agent);
      const configPath = resolveEffectiveConfigPath();
      if (!existsSync(configPath)) {
        const cfg = ConfigSchema.parse({}) as Config;
        writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
      }
      console.log('Agent OS layout ready.');
      console.log(`  State:   ${resolveStateDir()}`);
      console.log(`  Config:  ${configPath}`);
      console.log(`  Agent:   ${resolveAgentDir(opts.agent)}`);
      console.log(`  Workspace: ${resolveWorkspaceDir(opts.agent)}`);
      console.log(`  Sessions:  ${resolveSessionsDir(opts.agent)}`);
    });
}

register({
  id: 'init',
  name: 'init',
  description: 'Initialize Agent OS directories and default config',
  factory: createInitCommand,
  metadata: { category: 'setup' },
});
