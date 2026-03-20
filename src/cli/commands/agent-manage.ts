import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AgentRegistry } from '../../agent/agent-registry.js';
import { resolveRunDir } from '../../config/paths.js';
import { register, type CLIContext } from '../registry.js';

function createAgentManageCommands(_ctx: CLIContext): Command {
  const root = new Command('agents').description('Agent OS — list, create, and remove agents');

  const registry = new AgentRegistry();

  root
    .command('list')
    .description('List all agents')
    .action(async () => {
      const agents = await registry.listAgents();
      if (agents.length === 0) {
        console.log('No agents found. Run: xopcbot init');
        return;
      }
      for (const a of agents) {
        console.log(`${a.id}\t${a.status}\t${a.workspaceDir}`);
      }
    });

  root
    .command('ps')
    .description('Show agents that appear to be running (pid file)')
    .action(async () => {
      const agents = await registry.listAgents();
      for (const a of agents) {
        if (a.status === 'running') {
          const pidPath = join(resolveRunDir(a.id), 'pid');
          const pid = existsSync(pidPath) ? readFileSync(pidPath, 'utf-8').trim() : '?';
          console.log(`${a.id}\tpid ${pid}`);
        }
      }
    });

  root
    .command('create <id>')
    .description('Create a new agent')
    .option('--model <model>', 'Default model id')
    .option('--description <text>', 'Description')
    .action(async (id: string, opts: { model?: string; description?: string }) => {
      const d = await registry.createAgent(id, {
        name: id,
        model: opts.model,
        description: opts.description,
      });
      console.log(`Created agent ${d.id} at ${d.agentDir}`);
    });

  root
    .command('delete <id>')
    .description('Delete an agent and its data')
    .action(async (id: string) => {
      await registry.deleteAgent(id);
      console.log(`Deleted ${id}`);
    });

  root
    .command('info <id>')
    .description('Show agent metadata')
    .action(async (id: string) => {
      const a = await registry.getAgent(id);
      if (!a) {
        console.error(`Unknown agent: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(a, null, 2));
    });

  root
    .command('prune-runs')
    .description('Remove stale run/ directories (dead pids)')
    .action(() => {
      const n = registry.pruneOrphanRunDirs();
      console.log(`Removed ${n} orphan run director(ies)`);
    });

  return root;
}

register({
  id: 'agents',
  name: 'agents',
  description: 'List, create, and manage agents (Agent OS)',
  factory: createAgentManageCommands,
  metadata: { category: 'utility' },
});
