// Filesystem tools - read, write, edit files
import { Type, type Static } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { dirname } from 'path';
import { spawn } from 'child_process';

// Import fuzzy matching utilities
import {
	normalizeToLF,
	restoreLineEndings,
	normalizeForFuzzyMatch,
	fuzzyFindText,
	stripBom,
	generateDiffString,
	type FuzzyMatchResult,
} from './edit-diff.js';

// =============================================================================
// Read File Tool
// =============================================================================
const ReadFileSchema = Type.Object({
  path: Type.String({ description: 'The file path to read' }),
});

export const readFileTool: AgentTool<typeof ReadFileSchema, {} > = {
  name: 'read_file',
  description: 'Read the contents of a file at the given path.',
  parameters: ReadFileSchema,
  label: '📄 Read File',

  async execute(
    toolCallId: string,
    params: Static<typeof ReadFileSchema>,
    _signal?: AbortSignal
  ): Promise<AgentToolResult<{}>> {
    try {
      const content = await readFile(params.path, 'utf-8');
      return {
        content: [{ type: 'text', text: content }],
        details: {},
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: {},
      };
    }
  },
};

// =============================================================================
// Write File Tool
// =============================================================================
const WriteFileSchema = Type.Object({
  path: Type.String({ description: 'The file path to write' }),
  content: Type.String({ description: 'The content to write' }),
});

export const writeFileTool: AgentTool<typeof WriteFileSchema, {} > = {
  name: 'write_file',
  description: 'Write content to a file. Creates parent directories if needed.',
  parameters: WriteFileSchema,
  label: '📝 Write File',

  async execute(
    toolCallId: string,
    params: Static<typeof WriteFileSchema>,
    _signal?: AbortSignal
  ): Promise<AgentToolResult<{}>> {
    try {
      const dir = dirname(params.path);
      await mkdir(dir, { recursive: true });
      await writeFile(params.path, params.content, 'utf-8');
      return {
        content: [{ type: 'text', text: `File written: ${params.path}` }],
        details: {},
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error writing file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: {},
      };
    }
  },
};

// =============================================================================
// Edit File Tool
// =============================================================================
const EditFileSchema = Type.Object({
  path: Type.String({ description: 'The file path to edit' }),
  oldText: Type.String({ description: 'The text to replace (supports fuzzy matching for minor whitespace/formatting differences)' }),
  newText: Type.String({ description: 'The replacement text' }),
});

export interface EditToolDetails {
	diff?: string;
	firstChangedLine?: number;
	fuzzyMatchUsed?: boolean;
}

export const editFileTool: AgentTool<typeof EditFileSchema, EditToolDetails> = {
  name: 'edit_file',
  description: 'Replace oldText with newText in a file. Uses fuzzy matching for minor whitespace/formatting differences.',
  parameters: EditFileSchema,
  label: '✏️ Edit File',

  async execute(
    toolCallId: string,
    params: Static<typeof EditFileSchema>,
    _signal?: AbortSignal
  ): Promise<AgentToolResult<EditToolDetails>> {
    try {
      const rawContent = await readFile(params.path, 'utf-8');

      // Strip BOM before matching
      const { text: content } = stripBom(rawContent);

      // Detect original line ending
      const lineEnding = detectLineEnding(rawContent);

      // Normalize to LF for processing
      const normalizedContent = normalizeToLF(content);
      const normalizedOldText = normalizeToLF(params.oldText);
      const normalizedNewText = normalizeToLF(params.newText);

      // Try exact match first, then fuzzy match
      const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

      if (!matchResult.found) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: oldText not found in file. The text must match exactly (with minor fuzzy matching for whitespace/formatting).`,
            },
          ],
          details: {},
        };
      }

      // Check for multiple occurrences
      const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
      const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
      const occurrences = fuzzyContent.split(fuzzyOldText).length - 1;

      if (occurrences > 1) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Found ${occurrences} occurrences of the text. The text must be unique. Please provide more context to make it unique.`,
            },
          ],
          details: {},
        };
      }

      // Compute new content
      const baseContent = matchResult.contentForReplacement;
      const newContent =
        baseContent.substring(0, matchResult.index) +
        normalizedNewText +
        baseContent.substring(matchResult.index + matchResult.matchLength);

      // Restore original line endings
      const finalContent = restoreLineEndings(newContent, lineEnding);
      const originalWithReplacement = restoreLineEndings(baseContent, lineEnding);

      // Check if it would actually change anything
      if (originalWithReplacement === finalContent) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: No changes would be made. The replacement produces identical content.`,
            },
          ],
          details: {},
        };
      }

      // Generate diff
      const { diff, firstChangedLine } = generateDiffString(originalWithReplacement, finalContent);

      // Write the file
      await writeFile(params.path, finalContent, 'utf-8');

      return {
        content: [{ type: 'text', text: `File edited: ${params.path}` }],
        details: {
          diff,
          firstChangedLine,
          fuzzyMatchUsed: matchResult.usedFuzzyMatch,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error editing file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: {},
      };
    }
  },
};

// =============================================================================
// List Directory Tool
// =============================================================================
const ListDirSchema = Type.Object({
  path: Type.String({ description: 'The directory path to list' }),
});

export const listDirTool: AgentTool<typeof ListDirSchema, {} > = {
  name: 'list_dir',
  description: 'List the contents of a directory.',
  parameters: ListDirSchema,
  label: '📁 List Directory',

  async execute(
    toolCallId: string,
    params: Static<typeof ListDirSchema>,
    _signal?: AbortSignal
  ): Promise<AgentToolResult<{}>> {
    try {
      const entries = await readdir(params.path, { withFileTypes: true });
      const lines = entries.map((e) => {
        const type = e.isDirectory() ? 'd' : e.isFile() ? 'f' : '?';
        return `${type} ${e.name}`;
      });
      return {
        content: [{ type: 'text', text: lines.join('\n') || '(empty)' }],
        details: {},
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing directory: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: {},
      };
    }
  },
};

// =============================================================================
// Shell Tool
// =============================================================================
const ShellSchema = Type.Object({
  command: Type.String({ description: 'The shell command to execute' }),
  timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds (default: 60)' })),
  workdir: Type.Optional(Type.String({ description: 'Working directory' })),
});

export function createShellTool(defaultWorkdir?: string): AgentTool<typeof ShellSchema, {} > {
  return {
    name: 'shell',
    description: 'Execute a shell command and return the output.',
    parameters: ShellSchema,
    label: '💻 Shell',

    async execute(
      toolCallId: string,
      params: Static<typeof ShellSchema>,
      signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<{}>) => void
    ): Promise<AgentToolResult<{}>> {
      const command = params.command;
      const timeout = params.timeout || 60;
      const workdir = params.workdir || defaultWorkdir || process.cwd();

      return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        const startTime = Date.now();

        const proc = spawn(command, {
          shell: '/bin/bash',
          cwd: workdir,
          env: process.env,
        });

        proc.stdout.on('data', (d: Buffer) => {
          chunks.push(d);
          // Stream partial output if callback provided
          if (onUpdate) {
            onUpdate({
              content: [{ type: 'text', text: Buffer.concat(chunks).toString('utf-8') }],
              details: {},
            });
          }
        });

        proc.stderr.on('data', (d: Buffer) => chunks.push(d));

        proc.on('close', (code) => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          const output = Buffer.concat(chunks).toString('utf-8').trim();

          if (code === 0) {
            resolve({
              content: [
                {
                  type: 'text',
                  text: output
                    ? `Command executed in ${elapsed}s:\n${output}`
                    : `Success (${elapsed}s)`,
                },
              ],
              details: {},
            });
          } else {
            resolve({
              content: [
                {
                  type: 'text',
                  text: `Command failed (exit code ${code}) after ${elapsed}s:\n${output || 'no output'}`,
                },
              ],
              details: {},
            });
          }
        });

        proc.on('error', (error) => {
          resolve({
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            details: {},
          });
        });

        // Handle abort signal
        signal?.addEventListener('abort', () => {
          proc.kill('SIGTERM');
          resolve({
            content: [{ type: 'text', text: 'Command aborted' }],
            details: {},
          });
        });

        setTimeout(() => {
          proc.kill('SIGTERM');
          resolve({
            content: [{ type: 'text', text: `Timeout after ${timeout}s` }],
            details: {},
          });
        }, timeout * 1000);
      });
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect the line ending style of content
 */
function detectLineEnding(content: string): '\r\n' | '\n' {
	const crlfIdx = content.indexOf('\r\n');
	const lfIdx = content.indexOf('\n');
	if (lfIdx === -1) return '\n';
	if (crlfIdx === -1) return '\n';
	return crlfIdx < lfIdx ? '\r\n' : '\n';
}
