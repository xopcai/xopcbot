import { Tool } from './base.js';

export class WriteFileTool extends Tool {
  readonly name = 'write_file';
  readonly description = 'Write content to a file at the given path.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to write to' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['path', 'content'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = String(params.path);
    const content = String(params.content);
    try {
      const { writeFileSync, mkdirSync } = await import('fs');
      const { dirname } = await import('path');
      const dir = dirname(path);
      if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
      writeFileSync(path, content, 'utf-8');
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
