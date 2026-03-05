/**
 * Models Module
 * 
 * Model management, selection, fallback, and compatibility.
 */

export { ModelManager, type ModelManagerConfig, type RunResult } from './manager.js';
export {
  parseModelRef,
  normalizeProviderId,
  resolveModelRef,
  modelKey,
  findProviderConfig,
  findModelConfig,
  getModelConfig,
  getAllModelIds,
  type ModelRef,
  type ThinkLevel,
} from './selection.js';
