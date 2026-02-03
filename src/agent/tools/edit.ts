import { Tool } from './base.js';

export class EditFileTool extends Tool {
  readonly name = 'edit_file';
  readonly description = 'Edit a file by replacing old_text with new_text.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to edit' },
      old_text: { type: 'string', description: 'The exact text to find and replace' },
      new_text: { type: 'string', description: 'The text to replace with' },
    },
    required: ['path', 'old_text', 'new_text'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const path = String(params.path);
    const oldText = String(params.old_text);
    const newText = String(params.new_text);
    try {
      const { readFileSync, writeFileSync, existsSync } = await import('fs');
      if (!existsSync(path)) return `Error: File not found: ${path}`;
      const content = readFileSync(path, 'utf-8');
      if (!content.includes(oldText)) return `Error: old_text not found in file.`;
      writeFileSync(path, content.replace(oldText, newText, 1), 'utf-8');
      return `Successfully edited ${path}`;
    } catch (error) {
      return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
