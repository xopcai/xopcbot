/**
 * AcpSessionManager Types
 *
 * Types for the ACP session manager.
 */

import type { Config } from '../config/schema.js';
import type {
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeStatus,
} from './runtime/types.js';
import type { SessionAcpMeta, SessionEntry, AcpSessionRuntimeOptions } from './session/types.js';

export type AcpSessionResolution =
  | {
      kind: 'none';
      sessionKey: string;
    }
  | {
      kind: 'stale';
      sessionKey: string;
      error: Error;
    }
  | {
      kind: 'ready';
      sessionKey: string;
      meta: SessionAcpMeta;
    };

export type AcpInitializeSessionInput = {
  cfg: Config;
  sessionKey: string;
  agent: string;
  mode: 'persistent' | 'oneshot';
  cwd?: string;
  backendId?: string;
};

export type AcpRunTurnInput = {
  cfg: Config;
  sessionKey: string;
  text: string;
  mode: 'prompt' | 'steer';
  requestId: string;
  signal?: AbortSignal;
  onEvent?: (event: AcpRuntimeEvent) => Promise<void> | void;
};

export type AcpCloseSessionInput = {
  cfg: Config;
  sessionKey: string;
  reason: string;
  clearMeta?: boolean;
  allowBackendUnavailable?: boolean;
  requireAcpSession?: boolean;
};

export type AcpCloseSessionResult = {
  runtimeClosed: boolean;
  runtimeNotice?: string;
  metaCleared: boolean;
};

export type AcpSessionStatus = {
  sessionKey: string;
  backend: string;
  agent: string;
  identity?: {
    state: string;
    source: string;
    acpxRecordId?: string;
    backendSessionId?: string;
    agentSessionId?: string;
    lastUpdatedAt: number;
  };
  state: SessionAcpMeta['state'];
  mode: 'persistent' | 'oneshot';
  runtimeOptions: AcpSessionRuntimeOptions;
  capabilities: AcpRuntimeCapabilities;
  runtimeStatus?: AcpRuntimeStatus;
  lastActivityAt: number;
  lastError?: string;
};

export type AcpManagerObservabilitySnapshot = {
  runtimeCache: {
    activeSessions: number;
    idleTtlMs: number;
    evictedTotal: number;
    lastEvictedAt?: number;
  };
  turns: {
    active: number;
    queueDepth: number;
    completed: number;
    failed: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
  };
  errorsByCode: Record<string, number>;
};

export type AcpStartupIdentityReconcileResult = {
  checked: number;
  resolved: number;
  failed: number;
};

export type ActiveTurnState = {
  runtime: AcpRuntime;
  handle: AcpRuntimeHandle;
  abortController: AbortController;
  cancelPromise?: Promise<void>;
};

export type TurnLatencyStats = {
  completed: number;
  failed: number;
  totalMs: number;
  maxMs: number;
};

export type AcpSessionManagerDeps = {
  listAcpSessions: (params: { cfg: Config }) => Promise<SessionEntry[]>;
  readSessionEntry: (params: { cfg: Config; sessionKey: string }) => SessionEntry | null;
  upsertSessionMeta: (params: {
    cfg: Config;
    sessionKey: string;
    mutate: (
      current: SessionAcpMeta | undefined,
      entry: SessionEntry | undefined
    ) => SessionAcpMeta | null | undefined;
    failOnError?: boolean;
  }) => Promise<SessionEntry | null>;
  requireRuntimeBackend: typeof import('./runtime/registry.js').requireAcpRuntimeBackend;
};

export type CachedRuntimeState = {
  runtime: AcpRuntime;
  handle: AcpRuntimeHandle;
  backend: string;
  agent: string;
  mode: 'persistent' | 'oneshot';
  cwd?: string;
  appliedControlSignature?: string;
};
