/**
 * AcpxRuntime
 *
 * ACP runtime backend implementation using the acpx CLI.
 */

import { createInterface } from 'node:readline';
import type {
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpRuntimeDoctorReport,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeStatus,
  AcpRuntimeTurnInput,
} from '../../types.js';
import { AcpRuntimeError } from '../../errors.js';
import type { ResolvedAcpxPluginConfig } from './config.js';
import { buildPermissionArgs } from './config.js';
import { spawnWithResolvedCommand, spawnAndCollect, waitForExit, resolveSpawnFailure } from './process.js';
import { parsePromptEventLine, parseJsonLines, toAcpxErrorEvent, type AcpxJsonObject } from './events.js';
import {
  encodeAcpxRuntimeHandleState,
  decodeAcpxRuntimeHandleState,
  deriveAgentFromSessionKey,
  asOptionalString,
  asTrimmedString,
  isRecord,
  type AcpxHandleState,
} from './shared.js';

export const ACPX_BACKEND_ID = 'acpx';

const ACPX_CAPABILITIES: AcpRuntimeCapabilities = {
  controls: ['session/set_mode', 'session/set_config_option', 'session/status'],
};

export class AcpxRuntime implements AcpRuntime {
  private healthy = false;

  constructor(private readonly config: ResolvedAcpxPluginConfig) {}

  isHealthy(): boolean {
    return this.healthy;
  }

  async probeAvailability(): Promise<void> {
    try {
      const result = await spawnAndCollect({
        command: this.config.command,
        args: ['--help'],
        cwd: this.config.cwd,
      });
      this.healthy = result.error == null && (result.code ?? 0) === 0;
    } catch {
      this.healthy = false;
    }
  }

  async ensureSession(input: AcpRuntimeEnsureInput): Promise<AcpRuntimeHandle> {
    const sessionName = asTrimmedString(input.sessionKey);
    if (!sessionName) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP session key is required');
    }

    const agent = asTrimmedString(input.agent);
    if (!agent) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP agent id is required');
    }

    const cwd = asTrimmedString(input.cwd) || this.config.cwd;
    const mode = input.mode;

    const events = await this.runControlCommand({
      args: this.buildControlArgs({
        cwd,
        command: [agent, 'sessions', 'ensure', '--name', sessionName],
      }),
      cwd,
      fallbackCode: 'ACP_SESSION_INIT_FAILED',
    });

    const ensuredEvent = events.find(
      (event) =>
        asOptionalString(event.agentSessionId) ||
        asOptionalString(event.acpxSessionId) ||
        asOptionalString(event.acpxRecordId)
    );

    const acpxRecordId = ensuredEvent ? asOptionalString(ensuredEvent.acpxRecordId) : undefined;
    const agentSessionId = ensuredEvent ? asOptionalString(ensuredEvent.agentSessionId) : undefined;
    const backendSessionId = ensuredEvent ? asOptionalString(ensuredEvent.acpxSessionId) : undefined;

    return {
      sessionKey: input.sessionKey,
      backend: ACPX_BACKEND_ID,
      runtimeSessionName: encodeAcpxRuntimeHandleState({
        name: sessionName,
        agent,
        cwd,
        mode,
        ...(acpxRecordId ? { acpxRecordId } : {}),
        ...(backendSessionId ? { backendSessionId } : {}),
        ...(agentSessionId ? { agentSessionId } : {}),
      }),
      cwd,
      ...(acpxRecordId ? { acpxRecordId } : {}),
      ...(backendSessionId ? { backendSessionId } : {}),
      ...(agentSessionId ? { agentSessionId } : {}),
    };
  }

  async *runTurn(input: AcpRuntimeTurnInput): AsyncIterable<AcpRuntimeEvent> {
    const state = this.resolveHandleState(input.handle);
    const args = this.buildPromptArgs({
      agent: state.agent,
      sessionName: state.name,
      cwd: state.cwd,
    });

    const cancelOnAbort = async () => {
      await this.cancel({
        handle: input.handle,
        reason: 'abort-signal',
      }).catch((err) => {
        // Ignore cancel errors during abort
      });
    };

    const onAbort = () => {
      void cancelOnAbort();
    };

    if (input.signal?.aborted) {
      await cancelOnAbort();
      return;
    }

    if (input.signal) {
      input.signal.addEventListener('abort', onAbort, { once: true });
    }

    const { child, stdin, stdout, stderr } = spawnWithResolvedCommand({
      command: this.config.command,
      args,
      cwd: state.cwd,
    });

    child.stdin.on('error', () => {
      // Ignore EPIPE when child exits before stdin flush
    });

    stdin.end(input.text);

    let stderrData = '';
    stderr.on('data', (chunk) => {
      stderrData += String(chunk);
    });

    let sawDone = false;
    let sawError = false;

    const lines = createInterface({ input: stdout });

    try {
      for await (const line of lines) {
        const parsed = parsePromptEventLine(line);
        if (!parsed) continue;

        if (parsed.type === 'done') {
          sawDone = true;
        }
        if (parsed.type === 'error') {
          sawError = true;
        }

        yield parsed;
      }

      const exit = await waitForExit(child);

      if (exit.error) {
        const spawnFailure = resolveSpawnFailure(exit.error, state.cwd);
        if (spawnFailure === 'missing-command') {
          this.healthy = false;
          throw new AcpRuntimeError(
            'ACP_BACKEND_UNAVAILABLE',
            `acpx command not found: ${this.config.command}`,
            { cause: exit.error }
          );
        }
        if (spawnFailure === 'missing-cwd') {
          throw new AcpRuntimeError(
            'ACP_TURN_FAILED',
            `ACP runtime working directory does not exist: ${state.cwd}`,
            { cause: exit.error }
          );
        }
        throw new AcpRuntimeError('ACP_TURN_FAILED', exit.error.message, { cause: exit.error });
      }

      if ((exit.code ?? 0) !== 0 && !sawError) {
        yield {
          type: 'error',
          message: stderrData.trim() || `acpx exited with code ${exit.code ?? 'unknown'}`,
        };
        return;
      }

      if (!sawDone && !sawError) {
        yield { type: 'done' };
      }
    } finally {
      lines.close();
      if (input.signal) {
        input.signal.removeEventListener('abort', onAbort);
      }
    }
  }

  getCapabilities(): AcpRuntimeCapabilities {
    return ACPX_CAPABILITIES;
  }

  async getStatus(input: { handle: AcpRuntimeHandle }): Promise<AcpRuntimeStatus> {
    const state = this.resolveHandleState(input.handle);
    const events = await this.runControlCommand({
      args: this.buildControlArgs({
        cwd: state.cwd,
        command: [state.agent, 'status', '--session', state.name],
      }),
      cwd: state.cwd,
      fallbackCode: 'ACP_TURN_FAILED',
      ignoreNoSession: true,
    });

    const detail = events.find((event) => !toAcpxErrorEvent(event)) ?? events[0];
    if (!detail) {
      return { summary: 'acpx status unavailable' };
    }

    const status = asTrimmedString(detail.status) || 'unknown';
    const acpxRecordId = asOptionalString(detail.acpxRecordId);
    const acpxSessionId = asOptionalString(detail.acpxSessionId);
    const agentSessionId = asOptionalString(detail.agentSessionId);
    const pid = typeof detail.pid === 'number' && Number.isFinite(detail.pid) ? detail.pid : null;

    const summary = [
      `status=${status}`,
      acpxRecordId ? `acpxRecordId=${acpxRecordId}` : null,
      acpxSessionId ? `acpxSessionId=${acpxSessionId}` : null,
      pid != null ? `pid=${pid}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      summary,
      ...(acpxRecordId ? { acpxRecordId } : {}),
      ...(acpxSessionId ? { backendSessionId: acpxSessionId } : {}),
      ...(agentSessionId ? { agentSessionId } : {}),
      details: detail,
    };
  }

  async setMode(input: { handle: AcpRuntimeHandle; mode: string }): Promise<void> {
    const state = this.resolveHandleState(input.handle);
    const mode = asTrimmedString(input.mode);
    if (!mode) {
      throw new AcpRuntimeError('ACP_TURN_FAILED', 'ACP runtime mode is required');
    }

    await this.runControlCommand({
      args: this.buildControlArgs({
        cwd: state.cwd,
        command: [state.agent, 'set-mode', mode, '--session', state.name],
      }),
      cwd: state.cwd,
      fallbackCode: 'ACP_TURN_FAILED',
    });
  }

  async setConfigOption(input: {
    handle: AcpRuntimeHandle;
    key: string;
    value: string;
  }): Promise<void> {
    const state = this.resolveHandleState(input.handle);
    const key = asTrimmedString(input.key);
    const value = asTrimmedString(input.value);

    if (!key || !value) {
      throw new AcpRuntimeError('ACP_TURN_FAILED', 'ACP config option key/value are required');
    }

    await this.runControlCommand({
      args: this.buildControlArgs({
        cwd: state.cwd,
        command: [state.agent, 'set', key, value, '--session', state.name],
      }),
      cwd: state.cwd,
      fallbackCode: 'ACP_TURN_FAILED',
    });
  }

  async doctor(): Promise<AcpRuntimeDoctorReport> {
    try {
      const result = await spawnAndCollect({
        command: this.config.command,
        args: ['--help'],
        cwd: this.config.cwd,
      });

      if (result.error) {
        const spawnFailure = resolveSpawnFailure(result.error, this.config.cwd);
        if (spawnFailure === 'missing-command') {
          this.healthy = false;
          return {
            ok: false,
            code: 'ACP_BACKEND_UNAVAILABLE',
            message: `acpx command not found: ${this.config.command}`,
            installCommand: 'npm install -g acpx',
          };
        }
        this.healthy = false;
        return {
          ok: false,
          code: 'ACP_BACKEND_UNAVAILABLE',
          message: result.error.message,
        };
      }

      if ((result.code ?? 0) !== 0) {
        this.healthy = false;
        return {
          ok: false,
          code: 'ACP_BACKEND_UNAVAILABLE',
          message: result.stderr.trim() || `acpx exited with code ${result.code ?? 'unknown'}`,
        };
      }

      this.healthy = true;
      return {
        ok: true,
        message: `acpx command is available (${this.config.command})`,
      };
    } catch (error) {
      this.healthy = false;
      return {
        ok: false,
        code: 'ACP_BACKEND_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cancel(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void> {
    const state = this.resolveHandleState(input.handle);
    await this.runControlCommand({
      args: this.buildControlArgs({
        cwd: state.cwd,
        command: [state.agent, 'cancel', '--session', state.name],
      }),
      cwd: state.cwd,
      fallbackCode: 'ACP_TURN_FAILED',
      ignoreNoSession: true,
    });
  }

  async close(input: { handle: AcpRuntimeHandle; reason: string }): Promise<void> {
    const state = this.resolveHandleState(input.handle);
    await this.runControlCommand({
      args: this.buildControlArgs({
        cwd: state.cwd,
        command: [state.agent, 'sessions', 'close', state.name],
      }),
      cwd: state.cwd,
      fallbackCode: 'ACP_TURN_FAILED',
      ignoreNoSession: true,
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private resolveHandleState(handle: AcpRuntimeHandle): AcpxHandleState {
    const decoded = decodeAcpxRuntimeHandleState(handle.runtimeSessionName);
    if (decoded) {
      return decoded;
    }

    // Fallback for legacy session names
    const legacyName = asTrimmedString(handle.runtimeSessionName);
    if (!legacyName) {
      throw new AcpRuntimeError(
        'ACP_SESSION_INIT_FAILED',
        'Invalid acpx runtime handle: runtimeSessionName is missing'
      );
    }

    return {
      name: legacyName,
      agent: deriveAgentFromSessionKey(handle.sessionKey, 'codex'),
      cwd: this.config.cwd,
      mode: 'persistent',
    };
  }

  private buildControlArgs(params: { cwd: string; command: string[] }): string[] {
    return ['--format', 'json', '--json-strict', '--cwd', params.cwd, ...params.command];
  }

  private buildPromptArgs(params: { agent: string; sessionName: string; cwd: string }): string[] {
    const args = [
      '--format',
      'json',
      '--json-strict',
      '--cwd',
      params.cwd,
      ...buildPermissionArgs(this.config.permissionMode),
      '--non-interactive-permissions',
      this.config.nonInteractivePermissions,
    ];

    if (this.config.timeoutSeconds) {
      args.push('--timeout', String(this.config.timeoutSeconds));
    }

    args.push('--ttl', String(this.config.queueOwnerTtlSeconds));
    args.push(params.agent, 'prompt', '--session', params.sessionName, '--file', '-');

    return args;
  }

  private async runControlCommand(params: {
    args: string[];
    cwd: string;
    fallbackCode: 'ACP_SESSION_INIT_FAILED' | 'ACP_TURN_FAILED';
    ignoreNoSession?: boolean;
  }): Promise<AcpxJsonObject[]> {
    const result = await spawnAndCollect({
      command: this.config.command,
      args: params.args,
      cwd: params.cwd,
    });

    if (result.error) {
      const spawnFailure = resolveSpawnFailure(result.error, params.cwd);
      if (spawnFailure === 'missing-command') {
        this.healthy = false;
        throw new AcpRuntimeError(
          'ACP_BACKEND_UNAVAILABLE',
          `acpx command not found: ${this.config.command}`,
          { cause: result.error }
        );
      }
      if (spawnFailure === 'missing-cwd') {
        throw new AcpRuntimeError(
          params.fallbackCode,
          `ACP runtime working directory does not exist: ${params.cwd}`,
          { cause: result.error }
        );
      }
      throw new AcpRuntimeError(params.fallbackCode, result.error.message, { cause: result.error });
    }

    const events = parseJsonLines(result.stdout);
    const errorEvent = events.map((event) => toAcpxErrorEvent(event)).find(Boolean);

    if (errorEvent) {
      if (params.ignoreNoSession && errorEvent.code === 'NO_SESSION') {
        return events;
      }
      throw new AcpRuntimeError(
        params.fallbackCode,
        errorEvent.code ? `${errorEvent.code}: ${errorEvent.message}` : errorEvent.message
      );
    }

    if ((result.code ?? 0) !== 0) {
      throw new AcpRuntimeError(
        params.fallbackCode,
        result.stderr.trim() || `acpx exited with code ${result.code ?? 'unknown'}`
      );
    }

    return events;
  }
}
