import { Tool } from './base.js';

export class ReadFileTool extends Tool {
  readonly name = 'read_file';
  readonly description = 'Read the contents of a file at the given path.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to read' },
    },
    required: ['path'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = String(params.path);
    try {
      const { readFileSync, existsSync } = await import('fs');
      if (!existsSync(path)) return `Error: File not found: ${path}`;
      return readFileSync(path, 'utf-8');
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
