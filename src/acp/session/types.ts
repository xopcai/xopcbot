/**
 * ACP Session Types
 *
 * Types for ACP session metadata and storage.
 */

export type SessionAcpIdentityState = 'pending' | 'resolved';

export type SessionAcpIdentity = {
  state: SessionAcpIdentityState;
  source: 'ensure' | 'status';
  acpxRecordId?: string;
  backendSessionId?: string;
  agentSessionId?: string;
  lastUpdatedAt: number;
};

export type AcpSessionRuntimeOptions = {
  cwd?: string;
  runtimeMode?: string;
  timeoutMs?: number;
  permissions?: string;
};

export type SessionAcpState = 'idle' | 'running' | 'error';

export type SessionAcpMeta = {
  backend: string;
  agent: string;
  runtimeSessionName: string;
  identity?: SessionAcpIdentity;
  mode: 'persistent' | 'oneshot';
  runtimeOptions?: AcpSessionRuntimeOptions;
  cwd?: string;
  state: SessionAcpState;
  lastActivityAt: number;
  lastError?: string;
};

export type SessionEntry = {
  key: string;
  acp?: SessionAcpMeta;
  [key: string]: unknown;
};
