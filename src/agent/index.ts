// Agent module - powered by @mariozechner/pi-agent-core
export { AgentService } from './service.js';
export type { AgentConfig } from './types.js';

// Refactored modules
export { SessionTracker } from './session-tracker.js';
export type { SessionUsage } from './session-tracker.js';
export { ModelManager } from './models/index.js';

// Legacy helpers (backward compatibility)
export { loadBootstrapFiles, extractTextContent, stripFrontMatter, truncateBootstrapContent } from './helpers.js';
export type { BootstrapFile, TruncateResult } from './helpers.js';

export {
  loadWorkspaceBootstrapFiles,
  ensureBootstrapFiles,
  readFileWithCache,
  fileExists,
  stripFrontMatter as stripWorkspaceFrontMatter,
  isWorkspaceOnboardingCompleted,
  filterBootstrapFilesForSession,
  invalidateCache,
  clearWorkspaceCache,
  // Constants
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
} from './workspace.js';
export type { WorkspaceBootstrapFile, WorkspaceBootstrapFileName, WorkspaceOnboardingState } from './workspace.js';

export { buildSystemPrompt, buildMinimalSystemPrompt, getBootstrapFile, hasBootstrapFile } from './system-prompt.js';
export type { SystemPromptOptions, MemoryCitationsMode } from './system-prompt.js';

// Model module
export * from './models/index.js';

// Progress feedback module
export { 
  ProgressFeedbackManager, 
  progressFeedbackManager,
  formatProgressMessage,
  formatHeartbeatMessage,
} from './progress.js';
export type { 
  ProgressFeedbackConfig, 
  ProgressStage, 
  ProgressUpdate, 
  ProgressCallbacks,
  ProgressMessage,
} from './progress.js';

// Reliability modules
export { ToolErrorTracker } from './tool-error-tracker.js';
export type { ToolErrorTrackerConfig, ToolFailureRecord } from './tool-error-tracker.js';
export { RequestLimiter } from './request-limiter.js';
export type { RequestLimiterConfig, RequestLimitResult } from './request-limiter.js';

// Retry and timeout modules (P0 optimizations)
export { 
  retryWithBackoff, 
  retryWithResult, 
  withRetry, 
  RetryManager,
  DEFAULT_RETRY_CONFIG 
} from './retry.js';
export type { 
  RetryConfig, 
  RetryResult, 
  RetryStats 
} from './retry.js';

export { 
  executeWithTimeout, 
  executeWithTimeoutResult, 
  withTimeout, 
  TimeoutManager,
  TimeoutError,
  DEFAULT_TIMEOUT_CONFIG 
} from './timeout-wrapper.js';
export type { 
  TimeoutConfig, 
  TimeoutResult, 
  ToolTimeoutConfig 
} from './timeout-wrapper.js';

// Memory modules
export { generateStructuredSummary, formatSummaryAsText, createSummaryMessage } from './memory/summary-generator.js';
export type { ConversationSummary, ToolCallSummary } from './memory/summary-generator.js';
export { calculateCompactionRange } from './memory/compaction.js';

// P1: Dynamic tool descriptions
export {
  DynamicToolDescriptionRenderer,
  renderToolDescription,
  getAllToolDescriptions,
  detectModelCapabilities,
  detectEnvironmentContext,
  TOOL_TEMPLATES,
} from './tools/dynamic-description.js';
export type {
  ModelCapabilities,
  EnvironmentContext,
  ToolDescriptionTemplate,
  ToolExample,
  RenderedToolDescription,
} from './tools/dynamic-description.js';

// P1: Structured output (XML Element Builder)
export {
  Element,
  XMLParser,
  StructuredOutput,
} from './tools/structured-output.js';

// P1: Project context
export {
  gatherProjectContext,
  getProjectContext,
  formatProjectContextForPrompt,
  invalidateProjectContext,
  clearProjectContextCache,
} from './project-context.js';
export type {
  ProjectContext,
  FileExtensionStats,
  TechStack,
  ProjectContextOptions,
} from './project-context.js';

// Tool executor (timeout + retry protection)
export {
  executeToolWithProtection,
  wrapToolWithProtection,
  wrapToolsWithProtection,
  DEFAULT_TOOL_EXECUTOR_CONFIG,
} from './tool-executor.js';
export type {
  ToolExecutorConfig,
} from './tool-executor.js';
