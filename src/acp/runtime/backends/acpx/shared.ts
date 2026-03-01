/**
 * Acpx Shared Utilities
 */

import type { AcpRuntimeHandle } from '../../types.js';

export type AcpxHandleState = {
  name: string;
  agent: string;
  cwd: string;
  mode: 'persistent' | 'oneshot';
  acpxRecordId?: string;
  backendSessionId?: string;
  agentSessionId?: string;
};

export const ACPX_RUNTIME_HANDLE_PREFIX = 'acpx:v1:';

export function encodeAcpxRuntimeHandleState(state: AcpxHandleState): string {
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  return `${ACPX_RUNTIME_HANDLE_PREFIX}${payload}`;
}

export function decodeAcpxRuntimeHandleState(runtimeSessionName: string): AcpxHandleState | null {
  const trimmed = runtimeSessionName.trim();
  if (!trimmed.startsWith(ACPX_RUNTIME_HANDLE_PREFIX)) {
    return null;
  }

  const encoded = trimmed.slice(ACPX_RUNTIME_HANDLE_PREFIX.length);
  if (!encoded) {
    return null;
  }

  try {
    const raw = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const name = asTrimmedString(parsed.name);
    const agent = asTrimmedString(parsed.agent);
    const cwd = asTrimmedString(parsed.cwd);
    const mode = asTrimmedString(parsed.mode);

    if (!name || !agent || !cwd) {
      return null;
    }

    if (mode !== 'persistent' && mode !== 'oneshot') {
      return null;
    }

    return {
      name,
      agent,
      cwd,
      mode,
      acpxRecordId: asOptionalString(parsed.acpxRecordId),
      backendSessionId: asOptionalString(parsed.backendSessionId),
      agentSessionId: asOptionalString(parsed.agentSessionId),
    };
  } catch {
    return null;
  }
}

export function deriveAgentFromSessionKey(sessionKey: string, fallback: string): string {
  // Try to extract agent from session key format like "acp:opencode:uuid"
  const parts = sessionKey.split(':');
  if (parts.length >= 2 && parts[0] === 'acp') {
    const agent = parts[1];
    if (agent && agent.trim()) {
      return agent.trim();
    }
  }
  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}
