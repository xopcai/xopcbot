import { Tool } from './base.js';

export class ListDirTool extends Tool {
  readonly name = 'list_dir';
  readonly description = 'List the contents of a directory.';
  
  readonly parameters = {
    type: 'object',
    properties: { path: { type: 'string', description: 'The directory path to list' } },
    required: ['path'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = String(params.path);
    try {
      const { readdirSync, existsSync, lstatSync } = await import('fs');
      if (!existsSync(path)) return `Error: Directory not found: ${path}`;
      const items = readdirSync(path);
      const result = items.map(item => {
        const fullPath = `${path}/${item}`;
        try {
          const stat = lstatSync(fullPath);
          return `${stat.isDirectory() ? '📁' : '📄'} ${item}`;
        } catch { return `📄 ${item}`; }
      });
      return result.sort().join('\n') || `Directory ${path} is empty`;
    } catch (error) {
      return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
