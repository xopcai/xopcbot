/**
 * ACP (Agent Client Protocol) Module
 *
 * Provides integration with external coding agents like OpenCode, Claude Code, Codex.
 */

// Runtime
export type {
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpRuntimeDoctorReport,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimePromptMode,
  AcpRuntimeSessionMode,
  AcpRuntimeStatus,
  AcpRuntimeTurnInput,
} from './runtime/types.js';

export { AcpRuntimeError, ACP_ERROR_CODES, toAcpRuntimeError } from './runtime/errors.js';
export {
  registerAcpRuntimeBackend,
  unregisterAcpRuntimeBackend,
  getAcpRuntimeBackend,
  requireAcpRuntimeBackend,
  listAcpRuntimeBackends,
  hasAcpRuntimeBackend,
} from './runtime/registry.js';

// Manager
export { AcpSessionManager, getAcpSessionManager, setAcpSessionManager } from './manager.js';
export type {
  AcpInitializeSessionInput,
  AcpRunTurnInput,
  AcpCloseSessionInput,
  AcpCloseSessionResult,
  AcpSessionStatus,
  AcpSessionResolution,
} from './manager.types.js';

// Session
export type {
  SessionAcpMeta,
  SessionAcpIdentity,
  SessionAcpState,
  AcpSessionRuntimeOptions,
} from './session/types.js';
