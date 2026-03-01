/**
 * ACP Commands
 *
 * Commands for managing ACP (Agent Client Protocol) sessions.
 */

import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import { getAcpSessionManager } from '../acp/manager.js';
import type { AcpRuntimeEvent } from '../acp/runtime/types.js';
import { createLogger } from '../utils/logger.js';
import type { CommandContext, CommandResult } from './types.js';

const log = createLogger('acp-commands');

/**
 * Handle /acp spawn command
 */
async function handleSpawn(
  ctx: CommandContext,
  args: string[]
): Promise<CommandResult> {
  const manager = getAcpSessionManager();
  
  // Parse arguments
  const agent = args[0] || ctx.config.acp?.defaultAgent || 'opencode';
  const task = args.slice(1).join(' ') || 'Hello';
  
  // Check if agent is allowed
  const allowedAgents = ctx.config.acp?.allowedAgents || ['opencode', 'claude', 'codex'];
  if (!allowedAgents.includes(agent)) {
    return {
      content: `❌ Agent "${agent}" is not allowed. Allowed agents: ${allowedAgents.join(', ')}`,
    };
  }

  const sessionKey = `acp:${agent}:${randomUUID().slice(0, 8)}`;
  
  try {
    // Initialize session
    await manager.initializeSession({
      cfg: ctx.config,
      sessionKey,
      agent,
      mode: 'persistent',
      cwd: ctx.config.agents.defaults.workspace,
    });

    let output = '';
    
    // Run the turn
    await manager.runTurn({
      cfg: ctx.config,
      sessionKey,
      text: task,
      mode: 'prompt',
      requestId: randomUUID(),
      onEvent: async (event: AcpRuntimeEvent) => {
        switch (event.type) {
          case 'text_delta':
            output += event.text;
            break;
          case 'tool_call':
            output += `\n[Tool: ${event.text}]\n`;
            break;
          case 'status':
            output += `\n[Status: ${event.text}]\n`;
            break;
          case 'error':
            output += `\n❌ Error: ${event.message}\n`;
            break;
        }
      },
    });

    return {
      content: output || '✅ Task completed',
    };
  } catch (error) {
    log.error({ error, sessionKey }, 'ACP spawn failed');
    return {
      content: `❌ ACP spawn failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle /acp cancel command
 */
async function handleCancel(
  ctx: CommandContext,
  args: string[]
): Promise<CommandResult> {
  const manager = getAcpSessionManager();
  const sessionKey = args[0];
  
  if (!sessionKey) {
    return {
      content: '❌ Session key is required. Usage: /acp cancel <session-key>',
    };
  }

  try {
    await manager.cancelSession({
      cfg: ctx.config,
      sessionKey,
      reason: 'user-cancelled',
    });
    return {
      content: `✅ Cancelled session: ${sessionKey}`,
    };
  } catch (error) {
    return {
      content: `❌ Cancel failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle /acp status command
 */
async function handleStatus(
  ctx: CommandContext,
  args: string[]
): Promise<CommandResult> {
  const manager = getAcpSessionManager();
  const sessionKey = args[0];
  
  if (!sessionKey) {
    return {
      content: '❌ Session key is required. Usage: /acp status <session-key>',
    };
  }

  try {
    const status = await manager.getSessionStatus({
      cfg: ctx.config,
      sessionKey,
    });

    const lines = [
      `📊 ACP Session Status: ${sessionKey}`,
      ``,
      `Backend: ${status.backend}`,
      `Agent: ${status.agent}`,
      `State: ${status.state}`,
      `Mode: ${status.mode}`,
      `Last Activity: ${new Date(status.lastActivityAt).toLocaleString()}`,
    ];

    if (status.runtimeStatus?.summary) {
      lines.push(`Runtime: ${status.runtimeStatus.summary}`);
    }

    if (status.lastError) {
      lines.push(`Last Error: ${status.lastError}`);
    }

    return {
      content: lines.join('\n'),
    };
  } catch (error) {
    return {
      content: `❌ Status check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle /acp close command
 */
async function handleClose(
  ctx: CommandContext,
  args: string[]
): Promise<CommandResult> {
  const manager = getAcpSessionManager();
  const sessionKey = args[0];
  
  if (!sessionKey) {
    return {
      content: '❌ Session key is required. Usage: /acp close <session-key>',
    };
  }

  try {
    const result = await manager.closeSession({
      cfg: ctx.config,
      sessionKey,
      reason: 'user-closed',
      clearMeta: true,
    });

    return {
      content: `✅ Closed session: ${sessionKey}\nRuntime closed: ${result.runtimeClosed}\nMeta cleared: ${result.metaCleared}`,
    };
  } catch (error) {
    return {
      content: `❌ Close failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle /acp doctor command
 */
async function handleDoctor(ctx: CommandContext): Promise<CommandResult> {
  const { requireAcpRuntimeBackend } = await import('../acp/runtime/registry.js');
  
  try {
    const backend = requireAcpRuntimeBackend(ctx.config.acp?.backend);
    
    if (!backend.runtime.doctor) {
      return {
        content: '⚠️ Doctor not available for this backend',
      };
    }

    const report = await backend.runtime.doctor();
    
    if (report.ok) {
      return {
        content: `✅ ${report.message}`,
      };
    } else {
      const lines = [
        `❌ ACP Backend Issue: ${report.code || 'unknown'}`,
        report.message,
      ];
      if (report.installCommand) {
        lines.push(`\nTo fix, run: ${report.installCommand}`);
      }
      if (report.details?.length) {
        lines.push(`\nDetails:\n${report.details.join('\n')}`);
      }
      return {
        content: lines.join('\n'),
      };
    }
  } catch (error) {
    return {
      content: `❌ Doctor check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get help text for /acp command
 */
function getHelpText(): string {
  return `
🤖 ACP (Agent Client Protocol) Commands

Usage: /acp <action> [args...]

Actions:
  spawn <agent> [task]  - Spawn a new ACP session
  cancel <session>      - Cancel a running session
  status <session>      - Get session status
  close <session>       - Close a session
  doctor                - Check ACP backend health

Examples:
  /acp spawn opencode "Fix the bug in server.py"
  /acp spawn claude "Refactor the auth module"
  /acp status acp:opencode:abc123
  /acp cancel acp:opencode:abc123
  /acp close acp:opencode:abc123
  /acp doctor

Supported agents: opencode, claude, codex
`.trim();
}

/**
 * Main ACP command handler
 */
export async function handleAcpCommand(
  ctx: CommandContext,
  args: string
): Promise<CommandResult> {
  // Check if ACP is enabled
  if (!ctx.config.acp?.enabled) {
    return {
      content: '❌ ACP is not enabled. Enable it in config: `acp: { enabled: true }`',
    };
  }

  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const action = tokens[0]?.toLowerCase();

  switch (action) {
    case 'spawn':
      return handleSpawn(ctx, tokens.slice(1));
    case 'cancel':
      return handleCancel(ctx, tokens.slice(1));
    case 'status':
      return handleStatus(ctx, tokens.slice(1));
    case 'close':
      return handleClose(ctx, tokens.slice(1));
    case 'doctor':
      return handleDoctor(ctx);
    case 'help':
    default:
      return {
        content: getHelpText(),
      };
  }
}

/**
 * Register ACP commands
 */
export function registerAcpCommands(program: Command): void {
  program
    .command('acp')
    .description('ACP (Agent Client Protocol) commands')
    .argument('[action]', 'spawn|cancel|status|close|doctor|help')
    .argument('[args...]', 'Additional arguments')
    .action(async (action, args, cmd) => {
      // This is for CLI usage
      console.log('ACP command:', action, args);
    });
}
