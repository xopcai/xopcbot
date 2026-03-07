/**
 * Markdown Intermediate Representation (IR) - DEPRECATED
 *
 * This file is deprecated. Please use the new markdown processing library:
 * - src/markdown/ir.ts - IR parsing
 * - src/markdown/render.ts - Rendering
 * - src/markdown/chunk.ts - Chunking
 * - src/markdown/fences.ts - Fence detection
 * - src/channels/format.ts - Telegram formatting
 *
 * These modules are based on OpenClaw's implementation for robust markdown handling.
 *
 * @deprecated Use src/markdown/ instead
 */

// Re-export from new location for backward compatibility
export {
  markdownToIR,
  markdownToIRWithMeta,
  chunkMarkdownIR,
  type MarkdownIR,
  type MarkdownStyle,
  type MarkdownStyleSpan,
  type MarkdownLinkSpan,
  type MarkdownParseOptions,
} from '../markdown/ir.js';

export {
  renderMarkdownWithMarkers,
  type RenderStyleMarker,
  type RenderStyleMap,
  type RenderLink,
  type RenderOptions,
} from '../markdown/render.js';

export {
  chunkText,
  chunkMarkdownText,
  chunkByParagraph,
  chunkByNewline,
  chunkTextWithMode,
  chunkMarkdownTextWithMode,
  chunkTextByBreakResolver,
  type ChunkMode,
} from '../markdown/chunk.js';

export {
  parseFenceSpans,
  isSafeFenceBreak,
  findFenceSpanAt,
  type FenceSpan,
} from '../markdown/fences.js';

// Telegram-specific exports
export {
  markdownToTelegramHtml,
  markdownToTelegramChunks,
  markdownToTelegramHtmlChunks,
  renderTelegramHtmlText,
  formatTelegramMessage,
  markdownToPlainText,
  splitTelegramMessage,
  splitTelegramMessageSmart,
  wrapFileReferencesInHtml,
  type TelegramFormattedChunk,
} from './format.js';

// FormattedChunk type alias for backward compatibility
export type FormattedChunk = import('./format.js').TelegramFormattedChunk;
