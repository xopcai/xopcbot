/**
 * Acpx Runtime Service
 *
 * Plugin service for registering the acpx ACP runtime backend.
 */

import { registerAcpRuntimeBackend, unregisterAcpRuntimeBackend } from '../../registry.js';
import type { AcpRuntime } from '../../types.js';
import { ACPX_PINNED_VERSION, resolveAcpxPluginConfig, type ResolvedAcpxPluginConfig } from './config.js';
import { AcpxRuntime, ACPX_BACKEND_ID } from './runtime.js';

interface AcpxRuntimeLike extends AcpRuntime {
  probeAvailability(): Promise<void>;
  isHealthy(): boolean;
}

interface AcpxRuntimeFactoryParams {
  pluginConfig: ResolvedAcpxPluginConfig;
  queueOwnerTtlSeconds: number;
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

interface CreateAcpxRuntimeServiceParams {
  pluginConfig?: unknown;
  runtimeFactory?: (params: AcpxRuntimeFactoryParams) => AcpxRuntimeLike;
}

function createDefaultRuntime(params: AcpxRuntimeFactoryParams): AcpxRuntimeLike {
  return new AcpxRuntime(params.pluginConfig);
}

export function createAcpxRuntimeService(params: CreateAcpxRuntimeServiceParams = {}): {
  id: string;
  start: (ctx: {
    config: { workspace?: string };
    logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  }) => Promise<void>;
  stop?: (ctx: {
    config: { workspace?: string };
    logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  }) => Promise<void>;
} {
  let runtime: AcpxRuntimeLike | null = null;
  let lifecycleRevision = 0;

  return {
    id: 'acpx-runtime',

    async start(ctx): Promise<void> {
      const pluginConfig = resolveAcpxPluginConfig({
        rawConfig: params.pluginConfig,
        workspaceDir: ctx.config.workspace,
      });

      const runtimeFactory = params.runtimeFactory ?? createDefaultRuntime;
      runtime = runtimeFactory({
        pluginConfig,
        queueOwnerTtlSeconds: pluginConfig.queueOwnerTtlSeconds,
        logger: ctx.logger,
      });

      registerAcpRuntimeBackend({
        id: ACPX_BACKEND_ID,
        runtime,
        healthy: () => runtime?.isHealthy() ?? false,
      });

      ctx.logger.info(
        `acpx runtime backend registered (command: ${pluginConfig.command}, pinned: ${ACPX_PINNED_VERSION})`
      );

      lifecycleRevision += 1;
      const currentRevision = lifecycleRevision;

      // Async probe
      void (async () => {
        try {
          if (currentRevision !== lifecycleRevision) return;
          await runtime?.probeAvailability();
          if (runtime?.isHealthy()) {
            ctx.logger.info('acpx runtime backend ready');
          } else {
            ctx.logger.warn('acpx runtime backend probe failed');
          }
        } catch (err) {
          if (currentRevision !== lifecycleRevision) return;
          ctx.logger.warn(
            `acpx runtime setup failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      })();
    },

    async stop(ctx): Promise<void> {
      lifecycleRevision += 1;
      unregisterAcpRuntimeBackend(ACPX_BACKEND_ID);
      runtime = null;
      ctx.logger.info('acpx runtime backend unregistered');
    },
  };
}
