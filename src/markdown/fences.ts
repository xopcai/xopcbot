/**
 * Fence Span Detection
 *
 * Detects fenced code blocks to prevent splitting inside them.
 *
 * Based on OpenClaw's implementation:
 * https://github.com/mariozechner/openclaw/blob/main/src/markdown/fences.ts
 */

export type FenceSpan = {
  start: number;
  end: number;
  openLine: string;
  closeLine: string;
  marker: string;
  indent: string;
};

const FENCE_PATTERN = /^(\s*)(```+|~~~+)(.*)$/gm;

/**
 * Parse all fenced code block spans in the text.
 * Returns non-overlapping spans sorted by start position.
 */
export function parseFenceSpans(text: string): FenceSpan[] {
  const spans: FenceSpan[] = [];
  const matches: Array<{
    index: number;
    length: number;
    indent: string;
    marker: string;
    rest: string;
    line: string;
  }> = [];

  let m: RegExpExecArray | null;
  FENCE_PATTERN.lastIndex = 0;
  while ((m = FENCE_PATTERN.exec(text)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      indent: m[1] ?? "",
      marker: m[2] ?? "",
      rest: m[3] ?? "",
      line: m[0],
    });
  }

  for (let i = 0; i < matches.length - 1; i++) {
    const open = matches[i];
    if (!open) continue;

    // Find matching close with same marker and indent
    for (let j = i + 1; j < matches.length; j++) {
      const close = matches[j];
      if (!close) continue;

      if (close.marker === open.marker && close.indent === open.indent) {
        spans.push({
          start: open.index,
          end: close.index + close.length,
          openLine: open.line,
          closeLine: close.line,
          marker: open.marker,
          indent: open.indent,
        });
        i = j; // Skip to after this close
        break;
      }
    }
  }

  return spans;
}

/**
 * Check if a break at the given index is safe (not inside a fence).
 */
export function isSafeFenceBreak(spans: readonly FenceSpan[], index: number): boolean {
  for (const span of spans) {
    if (index > span.start && index < span.end) {
      return false;
    }
  }
  return true;
}

/**
 * Find the fence span containing the given index, if any.
 */
export function findFenceSpanAt(
  spans: readonly FenceSpan[],
  index: number,
): FenceSpan | undefined {
  for (const span of spans) {
    if (index >= span.start && index <= span.end) {
      return span;
    }
  }
  return undefined;
}
