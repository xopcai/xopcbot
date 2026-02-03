import { Tool } from './base.js';

export class EditFileTool extends Tool {
  name = 'edit_file';
  description = 'Edit a file by replacing old_text with new_text. The old_text must exist exactly in the file.';
  
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to edit',
      },
      old_text: {
        type: 'string',
        description: 'The exact text to find and replace',
      },
      new_text: {
        type: 'string',
        description: 'The text to replace with',
      },
    },
    required: ['path', 'old_text', 'new_text'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const { path, old_text, new_text } = params as { path: string; old_text: string; new_text: string };
    
    try {
      const { readFileSync, writeFileSync } = await import('fs');
      
      if (!existsSync(path)) {
        return `Error: File not found: ${path}`;
      }
      
      const content = readFileSync(path, 'utf-8');
      
      if (old_text.includes(old_text)) {
        // Count occurrences
        const count = content.split(old_text).length - 1;
        if (count > 1) {
          return `Warning: old_text appears ${count} times. Please provide more context to make it unique.`;
        }
      }
      
      if (!content.includes(old_text)) {
        return `Error: old_text not found in file. Make sure it matches exactly.`;
      }
      
      const newContent = content.replace(old_text, new_text, 1);
      writeFileSync(path, newContent, 'utf-8');
      
      return `Successfully edited ${path}`;
    } catch (error) {
      return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

// Helper to check file existence
async function existsSync(path: string): Promise<boolean> {
  const { existsSync } = await import('fs');
  return existsSync(path);
}
