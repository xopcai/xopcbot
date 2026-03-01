/**
 * AcpSessionManager
 *
 * Manages ACP (Agent Client Protocol) sessions including lifecycle,
 * runtime caching, and turn execution.
 */

import { createLogger } from '../utils/logger.js';
import type { Config } from '../config/schema.js';
import { requireAcpRuntimeBackend } from './runtime/registry.js';
import { AcpRuntimeError, toAcpRuntimeError, withAcpRuntimeErrorBoundary, type AcpErrorCode } from './runtime/errors.js';
import type { AcpRuntime, AcpRuntimeHandle } from './runtime/types.js';
import { RuntimeCache } from './control-plane/runtime-cache.js';
import { SessionActorQueue } from './control-plane/session-actor-queue.js';
import type {
  AcpInitializeSessionInput,
  AcpRunTurnInput,
  AcpCloseSessionInput,
  AcpCloseSessionResult,
  AcpSessionStatus,
  AcpManagerObservabilitySnapshot,
  AcpSessionResolution,
  ActiveTurnState,
  TurnLatencyStats,
  CachedRuntimeState,
  AcpSessionManagerDeps,
} from './manager.types.js';
import type { SessionAcpMeta, SessionEntry } from './session/types.js';
import type { AcpRuntimeEvent } from './runtime/types.js';

const log = createLogger('AcpSessionManager');

const DEFAULT_IDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function normalizeSessionKey(key: string): string {
  return key.trim().toLowerCase();
}

function normalizeActorKey(key: string): string {
  return normalizeSessionKey(key);
}

function resolveRuntimeIdleTtlMs(cfg: Config): number {
  return cfg.acp?.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
}

export class AcpSessionManager {
  private actorQueue = new SessionActorQueue();
  private runtimeCache = new RuntimeCache();
  private activeTurnBySession = new Map<string, ActiveTurnState>();
  private turnLatencyStats: TurnLatencyStats = {
    completed: 0,
    failed: 0,
    totalMs: 0,
    maxMs: 0,
  };
  private errorCountsByCode = new Map<string, number>();
  private evictedRuntimeCount = 0;
  private lastEvictedAt: number | undefined;
  private deps: AcpSessionManagerDeps;

  constructor(deps?: Partial<AcpSessionManagerDeps>) {
    this.deps = {
      listAcpSessions: deps?.listAcpSessions ?? (async () => []),
      readSessionEntry: deps?.readSessionEntry ?? (() => null),
      upsertSessionMeta: deps?.upsertSessionMeta ?? (async () => null),
      requireRuntimeBackend: deps?.requireRuntimeBackend ?? requireAcpRuntimeBackend,
    };
  }

  /**
   * Resolve an ACP session
   */
  resolveSession(params: { cfg: Config; sessionKey: string }): AcpSessionResolution {
    const sessionKey = normalizeSessionKey(params.sessionKey);
    if (!sessionKey) {
      return { kind: 'none', sessionKey };
    }

    const entry = this.deps.readSessionEntry({ cfg: params.cfg, sessionKey });
    if (entry?.acp) {
      return { kind: 'ready', sessionKey, meta: entry.acp };
    }

    // Check if it's an ACP session key format
    if (sessionKey.startsWith('acp:')) {
      return {
        kind: 'stale',
        sessionKey,
        error: new AcpRuntimeError(
          'ACP_SESSION_INIT_FAILED',
          `ACP session ${sessionKey} exists but metadata is missing`
        ),
      };
    }

    return { kind: 'none', sessionKey };
  }

  /**
   * Initialize a new ACP session
   */
  async initializeSession(
    input: AcpInitializeSessionInput
  ): Promise<{ runtime: AcpRuntime; handle: AcpRuntimeHandle; meta: SessionAcpMeta }> {
    const sessionKey = normalizeSessionKey(input.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP session key is required');
    }

    const agent = input.agent.trim();
    if (!agent) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP agent id is required');
    }

    await this.evictIdleRuntimeHandles({ cfg: input.cfg });

    return await this.withSessionActor(sessionKey, async () => {
      const backend = this.deps.requireRuntimeBackend(input.backendId || input.cfg.acp?.backend);
      const runtime = backend.runtime;

      this.enforceConcurrentSessionLimit({ cfg: input.cfg, sessionKey });

      const handle = await withAcpRuntimeErrorBoundary({
        run: async () =>
          await runtime.ensureSession({
            sessionKey,
            agent,
            mode: input.mode,
            cwd: input.cwd,
          }),
        fallbackCode: 'ACP_SESSION_INIT_FAILED',
        fallbackMessage: 'Could not initialize ACP session runtime',
      });

      const now = Date.now();
      const meta: SessionAcpMeta = {
        backend: handle.backend || backend.id,
        agent,
        runtimeSessionName: handle.runtimeSessionName,
        mode: input.mode,
        cwd: handle.cwd || input.cwd,
        state: 'idle',
        lastActivityAt: now,
      };

      try {
        await this.deps.upsertSessionMeta({
          cfg: input.cfg,
          sessionKey,
          mutate: () => meta,
          failOnError: true,
        });
      } catch (error) {
        // Cleanup on failure
        await runtime.close({ handle, reason: 'init-meta-failed' }).catch((err) => {
          log.warn(`Cleanup close failed after metadata write error for ${sessionKey}: ${err}`);
        });
        throw error;
      }

      this.setCachedRuntimeState(sessionKey, {
        runtime,
        handle,
        backend: handle.backend || backend.id,
        agent,
        mode: input.mode,
        cwd: handle.cwd || input.cwd,
      });

      log.info({ sessionKey, agent, backend: backend.id }, 'ACP session initialized');
      return { runtime, handle, meta };
    });
  }

  /**
   * Run a turn in an ACP session
   */
  async runTurn(input: AcpRunTurnInput): Promise<void> {
    const sessionKey = normalizeSessionKey(input.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP session key is required');
    }

    await this.evictIdleRuntimeHandles({ cfg: input.cfg });

    await this.withSessionActor(sessionKey, async () => {
      const resolution = this.resolveSession({ cfg: input.cfg, sessionKey });

      if (resolution.kind === 'none') {
        throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', `Session is not ACP-enabled: ${sessionKey}`);
      }
      if (resolution.kind === 'stale') {
        throw resolution.error;
      }

      const { runtime, handle, meta } = await this.ensureRuntimeHandle({
        cfg: input.cfg,
        sessionKey,
        meta: resolution.meta,
      });

      const turnStartedAt = Date.now();
      const actorKey = normalizeActorKey(sessionKey);

      await this.setSessionState({ cfg: input.cfg, sessionKey, state: 'running', clearLastError: true });

      const internalAbortController = new AbortController();
      const onCallerAbort = () => {
        internalAbortController.abort();
      };

      if (input.signal?.aborted) {
        internalAbortController.abort();
      } else if (input.signal) {
        input.signal.addEventListener('abort', onCallerAbort, { once: true });
      }

      const activeTurn: ActiveTurnState = {
        runtime,
        handle,
        abortController: internalAbortController,
      };
      this.activeTurnBySession.set(actorKey, activeTurn);

      let streamError: AcpRuntimeError | null = null;

      try {
        const combinedSignal =
          input.signal && typeof AbortSignal.any === 'function'
            ? AbortSignal.any([input.signal, internalAbortController.signal])
            : internalAbortController.signal;

        for await (const event of runtime.runTurn({
          handle,
          text: input.text,
          mode: input.mode,
          requestId: input.requestId,
          signal: combinedSignal,
        })) {
          if (event.type === 'error') {
            streamError = new AcpRuntimeError(
              this.normalizeErrorCode(event.code) as AcpErrorCode,
              event.message?.trim() || 'ACP turn failed before completion',
              { retryable: event.retryable }
            );
          }
          if (input.onEvent) {
            await input.onEvent(event);
          }
        }

        if (streamError) {
          throw streamError;
        }

        this.recordTurnCompletion({ startedAt: turnStartedAt });
        await this.setSessionState({ cfg: input.cfg, sessionKey, state: 'idle', clearLastError: true });
      } catch (error) {
        const acpError = toAcpRuntimeError(error, 'ACP_TURN_FAILED', 'ACP turn failed before completion');
        this.recordTurnCompletion({ startedAt: turnStartedAt, errorCode: acpError.code });
        await this.setSessionState({ cfg: input.cfg, sessionKey, state: 'error', lastError: acpError.message });
        throw acpError;
      } finally {
        if (input.signal) {
          input.signal.removeEventListener('abort', onCallerAbort);
        }
        if (this.activeTurnBySession.get(actorKey) === activeTurn) {
          this.activeTurnBySession.delete(actorKey);
        }

        // Close oneshot sessions
        if (meta.mode === 'oneshot') {
          try {
            await runtime.close({ handle, reason: 'oneshot-complete' });
          } catch (error) {
            log.warn(`ACP oneshot close failed for ${sessionKey}: ${error}`);
          } finally {
            this.clearCachedRuntimeState(sessionKey);
          }
        }
      }
    });
  }

  /**
   * Cancel a running turn
   */
  async cancelSession(params: { cfg: Config; sessionKey: string; reason?: string }): Promise<void> {
    const sessionKey = normalizeSessionKey(params.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP session key is required');
    }

    await this.evictIdleRuntimeHandles({ cfg: params.cfg });

    const actorKey = normalizeActorKey(sessionKey);
    const activeTurn = this.activeTurnBySession.get(actorKey);

    if (activeTurn) {
      activeTurn.abortController.abort();
      if (!activeTurn.cancelPromise) {
        activeTurn.cancelPromise = activeTurn.runtime.cancel({
          handle: activeTurn.handle,
          reason: params.reason,
        });
      }
      await withAcpRuntimeErrorBoundary({
        run: async () => await activeTurn.cancelPromise!,
        fallbackCode: 'ACP_TURN_FAILED',
        fallbackMessage: 'ACP cancel failed before completion',
      });
      return;
    }

    await this.withSessionActor(sessionKey, async () => {
      const resolution = this.resolveSession({ cfg: params.cfg, sessionKey });
      if (resolution.kind === 'none') {
        throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', `Session is not ACP-enabled: ${sessionKey}`);
      }
      if (resolution.kind === 'stale') {
        throw resolution.error;
      }

      const { runtime, handle } = await this.ensureRuntimeHandle({
        cfg: params.cfg,
        sessionKey,
        meta: resolution.meta,
      });

      try {
        await withAcpRuntimeErrorBoundary({
          run: async () => await runtime.cancel({ handle, reason: params.reason }),
          fallbackCode: 'ACP_TURN_FAILED',
          fallbackMessage: 'ACP cancel failed before completion',
        });
        await this.setSessionState({ cfg: params.cfg, sessionKey, state: 'idle', clearLastError: true });
      } catch (error) {
        const acpError = toAcpRuntimeError(error, 'ACP_TURN_FAILED', 'ACP cancel failed before completion');
        await this.setSessionState({ cfg: params.cfg, sessionKey, state: 'error', lastError: acpError.message });
        throw acpError;
      }
    });
  }

  /**
   * Close an ACP session
   */
  async closeSession(input: AcpCloseSessionInput): Promise<AcpCloseSessionResult> {
    const sessionKey = normalizeSessionKey(input.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP session key is required');
    }

    await this.evictIdleRuntimeHandles({ cfg: input.cfg });

    return await this.withSessionActor(sessionKey, async () => {
      const resolution = this.resolveSession({ cfg: input.cfg, sessionKey });

      if (resolution.kind === 'none') {
        if (input.requireAcpSession ?? true) {
          throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', `Session is not ACP-enabled: ${sessionKey}`);
        }
        return { runtimeClosed: false, metaCleared: false };
      }
      if (resolution.kind === 'stale') {
        if (input.requireAcpSession ?? true) {
          throw resolution.error;
        }
        return { runtimeClosed: false, metaCleared: false };
      }

      let runtimeClosed = false;
      let runtimeNotice: string | undefined;

      try {
        const { runtime, handle } = await this.ensureRuntimeHandle({
          cfg: input.cfg,
          sessionKey,
          meta: resolution.meta,
        });
        await withAcpRuntimeErrorBoundary({
          run: async () => await runtime.close({ handle, reason: input.reason }),
          fallbackCode: 'ACP_TURN_FAILED',
          fallbackMessage: 'ACP close failed before completion',
        });
        runtimeClosed = true;
        this.clearCachedRuntimeState(sessionKey);
      } catch (error) {
        const acpError = toAcpRuntimeError(error, 'ACP_TURN_FAILED', 'ACP close failed before completion');
        if (
          input.allowBackendUnavailable &&
          (acpError.code === 'ACP_BACKEND_MISSING' || acpError.code === 'ACP_BACKEND_UNAVAILABLE')
        ) {
          this.clearCachedRuntimeState(sessionKey);
          runtimeNotice = acpError.message;
        } else {
          throw acpError;
        }
      }

      let metaCleared = false;
      if (input.clearMeta) {
        await this.deps.upsertSessionMeta({
          cfg: input.cfg,
          sessionKey,
          mutate: () => null,
          failOnError: true,
        });
        metaCleared = true;
      }

      return { runtimeClosed, runtimeNotice, metaCleared };
    });
  }

  /**
   * Get session status
   */
  async getSessionStatus(params: { cfg: Config; sessionKey: string }): Promise<AcpSessionStatus> {
    const sessionKey = normalizeSessionKey(params.sessionKey);
    if (!sessionKey) {
      throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', 'ACP session key is required');
    }

    await this.evictIdleRuntimeHandles({ cfg: params.cfg });

    return await this.withSessionActor(sessionKey, async () => {
      const resolution = this.resolveSession({ cfg: params.cfg, sessionKey });
      if (resolution.kind === 'none') {
        throw new AcpRuntimeError('ACP_SESSION_INIT_FAILED', `Session is not ACP-enabled: ${sessionKey}`);
      }
      if (resolution.kind === 'stale') {
        throw resolution.error;
      }

      const { runtime, handle, meta } = await this.ensureRuntimeHandle({
        cfg: params.cfg,
        sessionKey,
        meta: resolution.meta,
      });

      const capabilities = await Promise.resolve(runtime.getCapabilities?.({ handle }) ?? { controls: [] });
      let runtimeStatus: AcpSessionStatus['runtimeStatus'];

      if (runtime.getStatus) {
        runtimeStatus = await withAcpRuntimeErrorBoundary({
          run: async () => await runtime.getStatus!({ handle }),
          fallbackCode: 'ACP_TURN_FAILED',
          fallbackMessage: 'Could not read ACP runtime status',
        });
      }

      return {
        sessionKey,
        backend: handle.backend || meta.backend,
        agent: meta.agent,
        state: meta.state,
        mode: meta.mode,
        runtimeOptions: meta.runtimeOptions ?? {},
        capabilities,
        runtimeStatus,
        lastActivityAt: meta.lastActivityAt,
        lastError: meta.lastError,
      };
    });
  }

  /**
   * Get observability snapshot
   */
  getObservabilitySnapshot(cfg: Config): AcpManagerObservabilitySnapshot {
    const completedTurns = this.turnLatencyStats.completed + this.turnLatencyStats.failed;
    const averageLatencyMs = completedTurns > 0 ? Math.round(this.turnLatencyStats.totalMs / completedTurns) : 0;

    return {
      runtimeCache: {
        activeSessions: this.runtimeCache.size(),
        idleTtlMs: resolveRuntimeIdleTtlMs(cfg),
        evictedTotal: this.evictedRuntimeCount,
        ...(this.lastEvictedAt ? { lastEvictedAt: this.lastEvictedAt } : {}),
      },
      turns: {
        active: this.activeTurnBySession.size,
        queueDepth: this.actorQueue.getTotalPendingCount(),
        completed: this.turnLatencyStats.completed,
        failed: this.turnLatencyStats.failed,
        averageLatencyMs,
        maxLatencyMs: this.turnLatencyStats.maxMs,
      },
      errorsByCode: Object.fromEntries(
        [...this.errorCountsByCode.entries()].sort(([a], [b]) => a.localeCompare(b))
      ),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureRuntimeHandle(params: {
    cfg: Config;
    sessionKey: string;
    meta: SessionAcpMeta;
  }): Promise<{ runtime: AcpRuntime; handle: AcpRuntimeHandle; meta: SessionAcpMeta }> {
    const { cfg, sessionKey, meta } = params;
    const agent = meta.agent;
    const mode = meta.mode;
    const cwd = meta.cwd;
    const configuredBackend = meta.backend || cfg.acp?.backend || '';

    const cached = this.getCachedRuntimeState(sessionKey);
    if (cached) {
      const backendMatches = !configuredBackend || cached.backend === configuredBackend;
      const agentMatches = cached.agent === agent;
      const modeMatches = cached.mode === mode;
      const cwdMatches = (cached.cwd ?? '') === (cwd ?? '');

      if (backendMatches && agentMatches && modeMatches && cwdMatches) {
        return { runtime: cached.runtime, handle: cached.handle, meta };
      }
      this.clearCachedRuntimeState(sessionKey);
    }

    this.enforceConcurrentSessionLimit({ cfg, sessionKey });

    const backend = this.deps.requireRuntimeBackend(configuredBackend || undefined);
    const runtime = backend.runtime;

    const ensured = await withAcpRuntimeErrorBoundary({
      run: async () =>
        await runtime.ensureSession({
          sessionKey,
          agent,
          mode,
          cwd,
        }),
      fallbackCode: 'ACP_SESSION_INIT_FAILED',
      fallbackMessage: 'Could not initialize ACP session runtime',
    });

    const nextMeta: SessionAcpMeta = {
      ...meta,
      backend: ensured.backend || backend.id,
      runtimeSessionName: ensured.runtimeSessionName,
      cwd: ensured.cwd || cwd,
      lastActivityAt: Date.now(),
    };

    // Persist if changed
    if (meta.backend !== nextMeta.backend || meta.runtimeSessionName !== nextMeta.runtimeSessionName) {
      await this.deps.upsertSessionMeta({
        cfg,
        sessionKey,
        mutate: () => nextMeta,
      });
    }

    this.setCachedRuntimeState(sessionKey, {
      runtime,
      handle: ensured,
      backend: ensured.backend || backend.id,
      agent,
      mode,
      cwd: ensured.cwd || cwd,
    });

    return { runtime, handle: ensured, meta: nextMeta };
  }

  private async evictIdleRuntimeHandles(params: { cfg: Config }): Promise<void> {
    const idleTtlMs = resolveRuntimeIdleTtlMs(params.cfg);
    if (idleTtlMs <= 0 || this.runtimeCache.size() === 0) {
      return;
    }

    const now = Date.now();
    const candidates = this.runtimeCache.collectIdleCandidates({ maxIdleMs: idleTtlMs, now });

    for (const candidate of candidates) {
      await this.actorQueue.run(candidate.actorKey, async () => {
        if (this.activeTurnBySession.has(candidate.actorKey)) {
          return;
        }
        const lastTouchedAt = this.runtimeCache.getLastTouchedAt(candidate.actorKey);
        if (lastTouchedAt == null || now - lastTouchedAt < idleTtlMs) {
          return;
        }
        const cached = this.runtimeCache.peek(candidate.actorKey);
        if (!cached) {
          return;
        }

        this.runtimeCache.clear(candidate.actorKey);
        this.evictedRuntimeCount++;
        this.lastEvictedAt = Date.now();

        try {
          await cached.runtime.close({ handle: cached.handle, reason: 'idle-evicted' });
        } catch (error) {
          log.warn(`Idle eviction close failed for ${candidate.state.handle.sessionKey}: ${error}`);
        }
      });
    }
  }

  private enforceConcurrentSessionLimit(params: { cfg: Config; sessionKey: string }): void {
    const configuredLimit = params.cfg.acp?.maxConcurrentSessions;
    if (typeof configuredLimit !== 'number' || !Number.isFinite(configuredLimit)) {
      return;
    }

    const limit = Math.max(1, Math.floor(configuredLimit));
    const actorKey = normalizeActorKey(params.sessionKey);

    if (this.runtimeCache.has(actorKey)) {
      return;
    }

    const activeCount = this.runtimeCache.size();
    if (activeCount >= limit) {
      throw new AcpRuntimeError(
        'ACP_MAX_SESSIONS_REACHED',
        `ACP max concurrent sessions reached (${activeCount}/${limit})`
      );
    }
  }

  private recordTurnCompletion(params: { startedAt: number; errorCode?: string }): void {
    const durationMs = Math.max(0, Date.now() - params.startedAt);
    this.turnLatencyStats.totalMs += durationMs;
    this.turnLatencyStats.maxMs = Math.max(this.turnLatencyStats.maxMs, durationMs);

    if (params.errorCode) {
      this.turnLatencyStats.failed++;
      this.recordErrorCode(params.errorCode);
    } else {
      this.turnLatencyStats.completed++;
    }
  }

  private recordErrorCode(code: string): void {
    const normalized = this.normalizeErrorCode(code);
    this.errorCountsByCode.set(normalized, (this.errorCountsByCode.get(normalized) ?? 0) + 1);
  }

  private normalizeErrorCode(code: string | undefined): string {
    if (!code) return 'ACP_TURN_FAILED';
    return code;
  }

  private async setSessionState(params: {
    cfg: Config;
    sessionKey: string;
    state: SessionAcpMeta['state'];
    lastError?: string;
    clearLastError?: boolean;
  }): Promise<void> {
    await this.deps.upsertSessionMeta({
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      mutate: (current) => {
        if (!current) return undefined;
        return {
          ...current,
          state: params.state,
          lastActivityAt: Date.now(),
          ...(params.clearLastError ? {} : params.lastError ? { lastError: params.lastError } : {}),
        };
      },
    });
  }

  private async withSessionActor<T>(sessionKey: string, op: () => Promise<T>): Promise<T> {
    const actorKey = normalizeActorKey(sessionKey);
    return await this.actorQueue.run(actorKey, op);
  }

  private getCachedRuntimeState(sessionKey: string): CachedRuntimeState | null {
    return this.runtimeCache.get(normalizeActorKey(sessionKey));
  }

  private setCachedRuntimeState(sessionKey: string, state: CachedRuntimeState): void {
    this.runtimeCache.set(normalizeActorKey(sessionKey), state);
  }

  private clearCachedRuntimeState(sessionKey: string): void {
    this.runtimeCache.clear(normalizeActorKey(sessionKey));
  }
}

// Singleton instance
let globalAcpSessionManager: AcpSessionManager | null = null;

export function getAcpSessionManager(): AcpSessionManager {
  if (!globalAcpSessionManager) {
    globalAcpSessionManager = new AcpSessionManager();
  }
  return globalAcpSessionManager;
}

export function setAcpSessionManager(manager: AcpSessionManager): void {
  globalAcpSessionManager = manager;
}
