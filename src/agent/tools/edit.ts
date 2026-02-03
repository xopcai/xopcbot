import { Tool } from './base.js';
import { execSync } from 'child_process';

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
      // Use Python for reliable text replacement
      const escapedPath = path.replace(/'/g, "'\\''");
      const escapedOld = oldText.replace(/'/g, "\\'");
      const escapedNew = newText.replace(/'/g, "\\'");
      
      const pythonScript = `python3 -c "
import sys
path = '${escapedPath}'
old = '''${escapedOld}'''
new = '''${escapedNew}'''
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
if old not in content:
    print('old_text_not_found')
    sys.exit(1)
content = content.replace(old, new, 1)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('ok')
"`;
      
      const result = execSync(pythonScript, { encoding: 'utf-8' }).trim();
      
      if (result === 'old_text_not_found') {
        return 'Error: old_text not found in file.';
      }
      
      return `Successfully edited ${path}`;
    } catch (error) {
      return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
