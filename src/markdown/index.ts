/**
 * Markdown Processing Library
 *
 * Provides:
 * - Markdown IR (Intermediate Representation) parsing
 * - Rendering to various formats (HTML, plain text)
 * - Smart chunking with code block protection
 *
 * Based on OpenClaw's markdown processing system.
 */

// IR types and parsing
export {
  markdownToIR,
  markdownToIRWithMeta,
  chunkMarkdownIR,
  type MarkdownIR,
  type MarkdownStyle,
  type MarkdownStyleSpan,
  type MarkdownLinkSpan,
  type MarkdownParseOptions,
} from "./ir.js";

// Rendering
export {
  renderMarkdownWithMarkers,
  type RenderStyleMarker,
  type RenderStyleMap,
  type RenderLink,
  type RenderOptions,
} from "./render.js";

// Chunking
export {
  chunkText,
  chunkMarkdownText,
  chunkByParagraph,
  chunkByNewline,
  chunkTextWithMode,
  chunkMarkdownTextWithMode,
  chunkTextByBreakResolver,
  type ChunkMode,
} from "./chunk.js";

// Fence detection (code blocks)
export {
  parseFenceSpans,
  isSafeFenceBreak,
  findFenceSpanAt,
  type FenceSpan,
} from "./fences.js";
