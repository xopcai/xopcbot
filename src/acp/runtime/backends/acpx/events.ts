/**
 * Acpx Event Parsing
 *
 * Parses NDJSON events from acpx CLI output.
 */

import type { AcpRuntimeEvent } from '../../types.js';

export type AcpxJsonObject = Record<string, unknown>;

/**
 * Parse a line of NDJSON output
 */
export function parsePromptEventLine(line: string): AcpRuntimeEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const type = asTrimmedString(parsed.type);
  if (!type) {
    return null;
  }

  switch (type) {
    case 'text': {
      const text = asTrimmedString(parsed.text);
      if (text === undefined) return null;
      return {
        type: 'text_delta',
        text,
        stream: asStreamType(parsed.stream),
      };
    }

    case 'thought': {
      const text = asTrimmedString(parsed.text);
      if (text === undefined) return null;
      return {
        type: 'text_delta',
        text,
        stream: 'thought' as const,
      };
    }

    case 'tool_call': {
      const toolText = asTrimmedString(parsed.text) || asTrimmedString(parsed.title) || 'tool call';
      return {
        type: 'tool_call',
        text: toolText,
      };
    }

    case 'status': {
      const statusText = asTrimmedString(parsed.text) || asTrimmedString(parsed.message);
      if (!statusText) return null;
      return {
        type: 'status',
        text: statusText,
      };
    }

    case 'done': {
      return {
        type: 'done',
        stopReason: asTrimmedString(parsed.stopReason) || asTrimmedString(parsed.reason),
      };
    }

    case 'error': {
      const message = asTrimmedString(parsed.message) || asTrimmedString(parsed.error) || 'Unknown error';
      return {
        type: 'error',
        message,
        code: asTrimmedString(parsed.code),
        retryable: asBoolean(parsed.retryable),
      };
    }

    default:
      return null;
  }
}

/**
 * Parse multiple lines of NDJSON
 */
export function parseJsonLines(stdout: string): AcpxJsonObject[] {
  const events: AcpxJsonObject[] = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (isRecord(parsed)) {
        events.push(parsed);
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return events;
}

/**
 * Convert an acpx error event to AcpRuntimeEvent
 */
export function toAcpxErrorEvent(event: AcpxJsonObject): { code?: string; message: string } | null {
  const type = asTrimmedString(event.type);
  if (type !== 'error') {
    return null;
  }

  const message = asTrimmedString(event.message) || asTrimmedString(event.error);
  if (!message) {
    return null;
  }

  return {
    code: asTrimmedString(event.code),
    message,
  };
}

// ============================================================================
// Type Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function asStreamType(value: unknown): 'output' | 'thought' | undefined {
  if (value === 'output' || value === 'thought') return value;
  return undefined;
}
