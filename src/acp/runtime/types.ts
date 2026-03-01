/**
 * ACP Runtime Types
 * 
 * Defines the interface for ACP (Agent Client Protocol) runtime backends.
 * This allows xopcbot to communicate with external coding agents like
 * OpenCode, Claude Code, Codex, etc.
 */

export type AcpRuntimePromptMode = 'prompt' | 'steer';

export type AcpRuntimeSessionMode = 'persistent' | 'oneshot';

export type AcpRuntimeControl = 'session/set_mode' | 'session/set_config_option' | 'session/status';

/**
 * Handle to an ACP runtime session
 */
export type AcpRuntimeHandle = {
  sessionKey: string;
  backend: string;
  runtimeSessionName: string;
  /** Effective runtime working directory for this ACP session */
  cwd?: string;
  /** Backend-local record identifier */
  acpxRecordId?: string;
  /** Backend-level ACP session identifier */
  backendSessionId?: string;
  /** Upstream harness session identifier */
  agentSessionId?: string;
};

export type AcpRuntimeEnsureInput = {
  sessionKey: string;
  agent: string;
  mode: AcpRuntimeSessionMode;
  cwd?: string;
  env?: Record<string, string>;
};

export type AcpRuntimeTurnInput = {
  handle: AcpRuntimeHandle;
  text: string;
  mode: AcpRuntimePromptMode;
  requestId: string;
  signal?: AbortSignal;
};

export type AcpRuntimeCapabilities = {
  controls: AcpRuntimeControl[];
  /**
   * Optional backend-advertised option keys for session/set_config_option.
   * Empty/undefined means "backend accepts keys, but did not advertise a strict list".
   */
  configOptionKeys?: string[];
};

export type AcpRuntimeStatus = {
  summary?: string;
  /** Backend-local record identifier */
  acpxRecordId?: string;
  /** Backend-level ACP session identifier, if known at status time */
  backendSessionId?: string;
  /** Upstream harness session identifier, if known at status time */
  agentSessionId?: string;
  details?: Record<string, unknown>;
};

export type AcpRuntimeDoctorReport = {
  ok: boolean;
  code?: string;
  message: string;
  installCommand?: string;
  details?: string[];
};

/**
 * Events emitted during an ACP turn
 */
export type AcpRuntimeEvent =
  | {
      type: 'text_delta';
      text: string;
      stream?: 'output' | 'thought';
    }
  | {
      type: 'status';
      text: string;
    }
  | {
      type: 'tool_call';
      text: string;
    }
  | {
      type: 'done';
      stopReason?: string;
    }
  | {
      type: 'error';
      message: string;
      code?: string;
      retryable?: boolean;
    };

/**
 * Interface for ACP runtime backends
 */
export interface AcpRuntime {
  ensureSession(input: AcpRuntimeEnsureInput): Promise<AcpRuntimeHandle>;

  runTurn(input: AcpRuntimeTurnInput): AsyncIterable<AcpRuntimeEvent>;

  getCapabilities?(input: { handle?: AcpRuntimeHandle }): Promise<AcpRuntimeCapabilities> | AcpRuntimeCapabilities;

  getStatus?(input: { handle: AcpRuntimeHandle }): Promise<AcpRuntimeStatus>;

  setMode?(input: { handle: AcpRuntimeHandle; mode: string }): Promise<void>;

  setConfigOption?(input: {
    handle: AcpRuntimeHandle;
    key: string;
    value: string;
  }): Promise<void>;

  doctor?(): Promise<AcpRuntimeDoctorReport>;

  cancel(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void>;

  close(input: { handle: AcpRuntimeHandle; reason: string }): Promise<void>;
}
