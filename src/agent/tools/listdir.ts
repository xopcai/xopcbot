import { Tool } from './base.js';

export class ListDirTool extends Tool {
  name = 'list_dir';
  description = 'List the contents of a directory.';
  
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list',
      },
    },
    required: ['path'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const { path } = params as { path: string };
    
    try {
      const { readdirSync } = await import('fs');
      const { existsSync, lstatSync } = await import('fs');
      
      if (!existsSync(path)) {
        return `Error: Directory not found: ${path}`;
      }
      
      const items = readdirSync(path);
      const result: string[] = [];
      
      for (const item of items) {
        const fullPath = `${path}/${item}`;
        try {
          const stat = lstatSync(fullPath);
          const prefix = stat.isDirectory() ? '📁 ' : '📄 ';
          result.push(`${prefix}${item}`);
        } catch {
          result.push(`📄 ${item}`);
        }
      }
      
      if (result.length === 0) {
        return `Directory ${path} is empty`;
      }
      
      return result.sort().join('\n');
    } catch (error) {
      return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
