import { Tool } from './base.js';
import { z } from 'zod';

export class ReadFileTool extends Tool {
  name = 'read_file';
  description = 'Read the contents of a file at the given path.';
  
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to read',
      },
    },
    required: ['path'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const { path } = params as { path: string };
    
    try {
      const { readFileSync } = await import('fs');
      const { existsSync } = await import('fs');
      
      if (!existsSync(path)) {
        return `Error: File not found: ${path}`;
      }
      
      const content = readFileSync(path, 'utf-8');
      return content;
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
