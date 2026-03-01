/**
 * Acpx Backend Configuration
 *
 * Configuration types and parsing for the acpx ACP runtime backend.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACPX_PERMISSION_MODES = ['approve-all', 'approve-reads', 'deny-all'] as const;
export type AcpxPermissionMode = (typeof ACPX_PERMISSION_MODES)[number];

export const ACPX_NON_INTERACTIVE_POLICIES = ['deny', 'fail'] as const;
export type AcpxNonInteractivePermissionPolicy = (typeof ACPX_NON_INTERACTIVE_POLICIES)[number];

// Pinned version of acpx CLI
export const ACPX_PINNED_VERSION = '0.1.13';

const ACPX_BIN_NAME = process.platform === 'win32' ? 'acpx.cmd' : 'acpx';

// Resolve paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ACPX_PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
export const ACPX_BUNDLED_BIN = path.join(ACPX_PLUGIN_ROOT, 'node_modules', '.bin', ACPX_BIN_NAME);
export const ACPX_LOCAL_INSTALL_COMMAND = `npm install --omit=dev --no-save acpx@${ACPX_PINNED_VERSION}`;

export type AcpxPluginConfig = {
  cwd?: string;
  permissionMode?: AcpxPermissionMode;
  nonInteractivePermissions?: AcpxNonInteractivePermissionPolicy;
  timeoutSeconds?: number;
  queueOwnerTtlSeconds?: number;
};

export type ResolvedAcpxPluginConfig = {
  command: string;
  cwd: string;
  permissionMode: AcpxPermissionMode;
  nonInteractivePermissions: AcpxNonInteractivePermissionPolicy;
  timeoutSeconds?: number;
  queueOwnerTtlSeconds: number;
};

const DEFAULT_PERMISSION_MODE: AcpxPermissionMode = 'approve-reads';
const DEFAULT_NON_INTERACTIVE_POLICY: AcpxNonInteractivePermissionPolicy = 'fail';
const DEFAULT_QUEUE_OWNER_TTL_SECONDS = 0.1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPermissionMode(value: string): value is AcpxPermissionMode {
  return ACPX_PERMISSION_MODES.includes(value as AcpxPermissionMode);
}

function isNonInteractivePermissionPolicy(
  value: string
): value is AcpxNonInteractivePermissionPolicy {
  return ACPX_NON_INTERACTIVE_POLICIES.includes(value as AcpxNonInteractivePermissionPolicy);
}

type ParseResult =
  | { ok: true; value: AcpxPluginConfig | undefined }
  | { ok: false; message: string };

function parseAcpxPluginConfig(value: unknown): ParseResult {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return { ok: false, message: 'expected config object' };
  }

  const allowedKeys = new Set([
    'cwd',
    'permissionMode',
    'nonInteractivePermissions',
    'timeoutSeconds',
    'queueOwnerTtlSeconds',
  ]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, message: `unknown config key: ${key}` };
    }
  }

  const cwd = value.cwd;
  if (cwd !== undefined && (typeof cwd !== 'string' || cwd.trim() === '')) {
    return { ok: false, message: 'cwd must be a non-empty string' };
  }

  const permissionMode = value.permissionMode;
  if (
    permissionMode !== undefined &&
    (typeof permissionMode !== 'string' || !isPermissionMode(permissionMode))
  ) {
    return {
      ok: false,
      message: `permissionMode must be one of: ${ACPX_PERMISSION_MODES.join(', ')}`,
    };
  }

  const nonInteractivePermissions = value.nonInteractivePermissions;
  if (
    nonInteractivePermissions !== undefined &&
    (typeof nonInteractivePermissions !== 'string' ||
      !isNonInteractivePermissionPolicy(nonInteractivePermissions))
  ) {
    return {
      ok: false,
      message: `nonInteractivePermissions must be one of: ${ACPX_NON_INTERACTIVE_POLICIES.join(', ')}`,
    };
  }

  const timeoutSeconds = value.timeoutSeconds;
  if (
    timeoutSeconds !== undefined &&
    (typeof timeoutSeconds !== 'number' || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0)
  ) {
    return { ok: false, message: 'timeoutSeconds must be a positive number' };
  }

  const queueOwnerTtlSeconds = value.queueOwnerTtlSeconds;
  if (
    queueOwnerTtlSeconds !== undefined &&
    (typeof queueOwnerTtlSeconds !== 'number' ||
      !Number.isFinite(queueOwnerTtlSeconds) ||
      queueOwnerTtlSeconds < 0)
  ) {
    return { ok: false, message: 'queueOwnerTtlSeconds must be a non-negative number' };
  }

  return {
    ok: true,
    value: {
      cwd: typeof cwd === 'string' ? cwd.trim() : undefined,
      permissionMode:
        typeof permissionMode === 'string' && isPermissionMode(permissionMode)
          ? permissionMode
          : undefined,
      nonInteractivePermissions:
        typeof nonInteractivePermissions === 'string' &&
        isNonInteractivePermissionPolicy(nonInteractivePermissions)
          ? nonInteractivePermissions
          : undefined,
      timeoutSeconds: typeof timeoutSeconds === 'number' ? timeoutSeconds : undefined,
      queueOwnerTtlSeconds:
        typeof queueOwnerTtlSeconds === 'number' ? queueOwnerTtlSeconds : undefined,
    },
  };
}

export function resolveAcpxPluginConfig(params: {
  rawConfig: unknown;
  workspaceDir?: string;
}): ResolvedAcpxPluginConfig {
  const parsed = parseAcpxPluginConfig(params.rawConfig);
  if (!parsed.ok) {
    throw new Error((parsed as { ok: false; message: string }).message);
  }

  const normalized = parsed.value ?? {};
  const fallbackCwd = params.workspaceDir?.trim() || process.cwd();
  const cwd = path.resolve(normalized.cwd?.trim() || fallbackCwd);

  return {
    command: ACPX_BUNDLED_BIN,
    cwd,
    permissionMode: normalized.permissionMode ?? DEFAULT_PERMISSION_MODE,
    nonInteractivePermissions:
      normalized.nonInteractivePermissions ?? DEFAULT_NON_INTERACTIVE_POLICY,
    timeoutSeconds: normalized.timeoutSeconds,
    queueOwnerTtlSeconds: normalized.queueOwnerTtlSeconds ?? DEFAULT_QUEUE_OWNER_TTL_SECONDS,
  };
}

/**
 * Build permission arguments for acpx CLI
 */
export function buildPermissionArgs(mode: AcpxPermissionMode): string[] {
  switch (mode) {
    case 'approve-all':
      return ['--approve-all'];
    case 'approve-reads':
      return ['--approve-reads'];
    case 'deny-all':
      return ['--deny-all'];
    default:
      return [];
  }
}
