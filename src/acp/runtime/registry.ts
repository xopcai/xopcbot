/**
 * ACP Runtime Registry
 *
 * Manages ACP runtime backends. Supports multiple backends with health checks.
 */

import { AcpRuntimeError } from './errors.js';
import type { AcpRuntime } from './types.js';

export type AcpRuntimeBackend = {
  id: string;
  runtime: AcpRuntime;
  healthy?: () => boolean;
};

type AcpRuntimeRegistryGlobalState = {
  backendsById: Map<string, AcpRuntimeBackend>;
};

const ACP_RUNTIME_REGISTRY_STATE_KEY = Symbol.for('xopcbot.acpRuntimeRegistryState');

function createAcpRuntimeRegistryGlobalState(): AcpRuntimeRegistryGlobalState {
  return {
    backendsById: new Map<string, AcpRuntimeBackend>(),
  };
}

function resolveAcpRuntimeRegistryGlobalState(): AcpRuntimeRegistryGlobalState {
  const runtimeGlobal = globalThis as typeof globalThis & {
    [ACP_RUNTIME_REGISTRY_STATE_KEY]?: AcpRuntimeRegistryGlobalState;
  };
  if (!runtimeGlobal[ACP_RUNTIME_REGISTRY_STATE_KEY]) {
    runtimeGlobal[ACP_RUNTIME_REGISTRY_STATE_KEY] = createAcpRuntimeRegistryGlobalState();
  }
  return runtimeGlobal[ACP_RUNTIME_REGISTRY_STATE_KEY];
}

const ACP_BACKENDS_BY_ID = resolveAcpRuntimeRegistryGlobalState().backendsById;

function normalizeBackendId(id: string | undefined): string {
  return id?.trim().toLowerCase() || '';
}

function isBackendHealthy(backend: AcpRuntimeBackend): boolean {
  if (!backend.healthy) {
    return true;
  }
  try {
    return backend.healthy();
  } catch {
    return false;
  }
}

/**
 * Register an ACP runtime backend
 */
export function registerAcpRuntimeBackend(backend: AcpRuntimeBackend): void {
  const id = normalizeBackendId(backend.id);
  if (!id) {
    throw new Error('ACP runtime backend id is required');
  }
  if (!backend.runtime) {
    throw new Error(`ACP runtime backend "${id}" is missing runtime implementation`);
  }
  ACP_BACKENDS_BY_ID.set(id, {
    ...backend,
    id,
  });
}

/**
 * Unregister an ACP runtime backend
 */
export function unregisterAcpRuntimeBackend(id: string): void {
  const normalized = normalizeBackendId(id);
  if (!normalized) {
    return;
  }
  ACP_BACKENDS_BY_ID.delete(normalized);
}

/**
 * Get an ACP runtime backend by ID, or the first healthy one if no ID specified
 */
export function getAcpRuntimeBackend(id?: string): AcpRuntimeBackend | null {
  const normalized = normalizeBackendId(id);
  if (normalized) {
    return ACP_BACKENDS_BY_ID.get(normalized) ?? null;
  }
  if (ACP_BACKENDS_BY_ID.size === 0) {
    return null;
  }
  // Return first healthy backend, or first one if none healthy
  for (const backend of ACP_BACKENDS_BY_ID.values()) {
    if (isBackendHealthy(backend)) {
      return backend;
    }
  }
  return ACP_BACKENDS_BY_ID.values().next().value ?? null;
}

/**
 * Require an ACP runtime backend (throws if not found)
 */
export function requireAcpRuntimeBackend(id?: string): AcpRuntimeBackend {
  const normalized = normalizeBackendId(id);
  const backend = getAcpRuntimeBackend(normalized || undefined);
  if (!backend) {
    throw new AcpRuntimeError(
      'ACP_BACKEND_MISSING',
      'ACP runtime backend is not configured. Install and enable the acpx runtime plugin.'
    );
  }
  if (!isBackendHealthy(backend)) {
    throw new AcpRuntimeError(
      'ACP_BACKEND_UNAVAILABLE',
      'ACP runtime backend is currently unavailable. Try again in a moment.'
    );
  }
  if (normalized && backend.id !== normalized) {
    throw new AcpRuntimeError(
      'ACP_BACKEND_MISSING',
      `ACP runtime backend "${normalized}" is not registered.`
    );
  }
  return backend;
}

/**
 * List all registered backends
 */
export function listAcpRuntimeBackends(): AcpRuntimeBackend[] {
  return Array.from(ACP_BACKENDS_BY_ID.values());
}

/**
 * Check if any backend is registered
 */
export function hasAcpRuntimeBackend(): boolean {
  return ACP_BACKENDS_BY_ID.size > 0;
}

// Testing utilities
export const __testing = {
  resetAcpRuntimeBackendsForTests() {
    ACP_BACKENDS_BY_ID.clear();
  },
  getAcpRuntimeRegistryGlobalStateForTests() {
    return resolveAcpRuntimeRegistryGlobalState();
  },
};
