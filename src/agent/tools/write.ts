import { Tool } from './base.js';

export class WriteFileTool extends Tool {
  name = 'write_file';
  description = 'Write content to a file at the given path. Creates parent directories if needed.';
  
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to write to',
      },
      content: {
        type: 'string',
        description: 'The content to write',
      },
    },
    required: ['path', 'content'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const { path, content } = params as { path: string; content: string };
    
    try {
      const { writeFileSync, mkdirSync } = await import('fs');
      const { dirname } = await import('path');
      
      const dir = dirname(path);
      if (dir && dir !== '.') {
        mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(path, content, 'utf-8');
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
