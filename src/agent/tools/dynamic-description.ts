/**
 * Dynamic Tool Description - Renders tool descriptions based on model capabilities
 *
 * Adapts tool descriptions dynamically based on:
 * - Model capabilities (vision, tools, reasoning)
 * - Environment context (workspace, OS, shell)
 * - Current session state
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('DynamicToolDescription');

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  contextLength: number;
  maxOutputTokens: number;
  provider: string;
  modelName: string;
}

export interface EnvironmentContext {
  workspace: string;
  os: 'linux' | 'darwin' | 'win32' | 'unknown';
  shell: string;
  nodeVersion: string;
  availableTools: string[];
}

export interface ToolDescriptionTemplate {
  name: string;
  baseDescription: string;
  visionNote?: string;
  noVisionNote?: string;
  contextLimitNote?: string;
  examples: ToolExample[];
  limitations: string[];
}

export interface ToolExample {
  description: string;
  code: string;
  whenToUse: string;
}

export interface RenderedToolDescription {
  name: string;
  description: string;
  examples: string;
  limitations: string;
}

// Default model capabilities detection
export function detectModelCapabilities(model?: string, provider?: string): ModelCapabilities {
  const modelLower = (model || '').toLowerCase();
  const providerLower = (provider || '').toLowerCase();

  // Vision support
  const supportsVision = 
    modelLower.includes('claude-3') ||
    modelLower.includes('gpt-4') && (modelLower.includes('vision') || modelLower.includes('turbo')) ||
    modelLower.includes('gemini');

  // Tools support
  const supportsTools = 
    modelLower.includes('claude-3') ||
    modelLower.includes('gpt-4') ||
    modelLower.includes('gpt-3.5-turbo') ||
    modelLower.includes('gemini');

  // Reasoning support
  const supportsReasoning = 
    modelLower.includes('claude-3-opus') ||
    modelLower.includes('claude-3-sonnet') ||
    modelLower.includes('gpt-4') ||
    modelLower.includes('o1') ||
    modelLower.includes('o3');

  // Context length detection
  let contextLength = 4096;
  if (modelLower.includes('claude-3-opus') || modelLower.includes('claude-3-sonnet')) {
    contextLength = 200000;
  } else if (modelLower.includes('claude-3-haiku')) {
    contextLength = 200000;
  } else if (modelLower.includes('gpt-4-turbo') || modelLower.includes('gpt-4o')) {
    contextLength = 128000;
  } else if (modelLower.includes('gpt-4')) {
    contextLength = 8192;
  } else if (modelLower.includes('gemini')) {
    contextLength = 1000000;
  }

  // Max output tokens
  let maxOutputTokens = 4096;
  if (modelLower.includes('claude-3-opus')) {
    maxOutputTokens = 4096;
  } else if (modelLower.includes('gpt-4-turbo') || modelLower.includes('gpt-4o')) {
    maxOutputTokens = 4096;
  }

  return {
    supportsVision,
    supportsTools,
    supportsReasoning,
    contextLength,
    maxOutputTokens,
    provider: providerLower || 'unknown',
    modelName: model || 'unknown',
  };
}

// Detect environment context
export function detectEnvironmentContext(workspace: string): EnvironmentContext {
  const os = process.platform as EnvironmentContext['os'];
  const shell = process.env.SHELL || process.env.ComSpec || '/bin/sh';
  const nodeVersion = process.version;

  return {
    workspace,
    os,
    shell,
    nodeVersion,
    availableTools: [], // Will be populated by caller
  };
}

// Tool description templates
const TOOL_TEMPLATES: Record<string, ToolDescriptionTemplate> = {
  read_file: {
    name: 'read_file',
    baseDescription: `Reads the content of a file at the specified path within the workspace directory.
Returns the file content as UTF-8 text with line numbers prepended.

**When to use**: When you need to examine source code, configuration files, or any text file to understand its contents, structure, or to make informed decisions about modifications.

**When NOT to use**: For binary files (images, executables, compiled files) - use appropriate tools instead.`,
    visionNote: `\n\n**Image Support**: This model supports vision. You can read image files (PNG, JPG, GIF, WebP) and they will be returned for visual analysis.`,
    noVisionNote: `\n\n**Note**: This model does NOT support vision. Image files cannot be processed. Use other tools to analyze images.`,
    contextLimitNote: `\n\n**Large Files**: Files larger than {{maxFileSize}} bytes will be truncated. Use start_line/end_line parameters for partial reads.`,
    examples: [
      {
        description: 'Read entire file',
        code: '{"path": "src/main.ts"}',
        whenToUse: 'When you need to see the complete file content',
      },
      {
        description: 'Read specific lines',
        code: '{"path": "src/main.ts", "start_line": 1, "end_line": 50}',
        whenToUse: 'When you only need to see a portion of a large file',
      },
    ],
    limitations: [
      'Cannot read files outside the workspace directory',
      'Maximum file size: {{maxFileSize}} bytes',
      'Binary files are automatically detected and rejected',
    ],
  },

  write_file: {
    name: 'write_file',
    baseDescription: `Creates a new file or overwrites an existing file at the specified path.
Use with caution as this will replace existing content.

**When to use**: 
- Creating new files
- Completely rewriting existing files when you have the full new content

**When NOT to use**:
- For small edits - use edit_file instead
- When you want to preserve parts of the existing file`,
    examples: [
      {
        description: 'Create new file',
        code: '{"path": "src/new-file.ts", "content": "export const hello = () => console.log(\'Hello\');"}',
        whenToUse: 'When creating a completely new file',
      },
    ],
    limitations: [
      'Cannot write outside the workspace directory',
      'Existing file content will be completely replaced',
      'Maximum file size: {{maxFileSize}} bytes',
    ],
  },

  edit_file: {
    name: 'edit_file',
    baseDescription: `Makes targeted edits to a file by replacing specific text.
This is the preferred way to modify existing files as it preserves the rest of the content.

**When to use**:
- Making small, targeted changes to existing files
- Fixing bugs or typos
- Adding or removing specific lines

**When NOT to use**:
- When rewriting the entire file - use write_file instead
- When the edit is too complex to express as a simple replacement`,
    examples: [
      {
        description: 'Replace function implementation',
        code: '{"path": "src/utils.ts", "oldText": "function add(a, b) { return a + b; }", "newText": "function add(a: number, b: number): number { return a + b; }"}',
        whenToUse: 'When updating a specific function',
      },
    ],
    limitations: [
      'The oldText must match exactly (including whitespace)',
      'Cannot edit outside the workspace directory',
      'For complex multi-line edits, consider using write_file',
    ],
  },

  shell: {
    name: 'shell',
    baseDescription: `Executes a shell command in the workspace directory.
Provides a way to run system commands, build tools, tests, and other CLI operations.

**When to use**:
- Running build commands (npm build, make, etc.)
- Executing tests
- Checking git status
- Installing dependencies
- Running linting or formatting tools

**When NOT to use**:
- For file operations - use read_file, write_file, edit_file instead
- For searching - use grep instead
- For long-running interactive commands`,
    examples: [
      {
        description: 'Run tests',
        code: '{"command": "npm test", "description": "Run test suite"}',
        whenToUse: 'When you need to verify code works correctly',
      },
      {
        description: 'Check git status',
        code: '{"command": "git status", "description": "Check git status"}',
        whenToUse: 'When you need to see what files have changed',
      },
    ],
    limitations: [
      'Commands run in the workspace directory: {{workspace}}',
      'Shell: {{shell}}',
      'OS: {{os}}',
      'Timeout: {{timeout}} seconds',
      'Interactive commands may hang',
    ],
  },

  grep: {
    name: 'grep',
    baseDescription: `Searches for text patterns in files using regular expressions.
Fast and efficient way to find specific content across multiple files.

**When to use**:
- Finding where a function or variable is defined/used
- Searching for specific patterns across the codebase
- Locating configuration values

**When NOT to use**:
- When you need file content - use read_file instead
- For complex multi-step searches - use shell with find/grep`,
    examples: [
      {
        description: 'Search for function definition',
        code: '{"pattern": "function calculateTotal", "path": "src"}',
        whenToUse: 'When looking for where a function is defined',
      },
      {
        description: 'Search with regex',
        code: '{"pattern": "export (const|let|var) \\\w+", "path": "src", "glob": "*.ts"}',
        whenToUse: 'When searching with pattern matching',
      },
    ],
    limitations: [
      'Searches are case-sensitive by default',
      'Large directories may take time to search',
      'Binary files are skipped',
    ],
  },
};

// Render tool description with context
export function renderToolDescription(
  toolName: string,
  capabilities: ModelCapabilities,
  environment: EnvironmentContext,
  config?: {
    maxFileSize?: number;
    shellTimeout?: number;
  }
): string {
  const template = TOOL_TEMPLATES[toolName];
  if (!template) {
    log.warn({ toolName }, 'No template found for tool');
    return '';
  }

  let description = template.baseDescription;

  // Add vision-specific notes
  if (toolName === 'read_file') {
    if (capabilities.supportsVision) {
      description += template.visionNote || '';
    } else {
      description += template.noVisionNote || '';
    }
    description += template.contextLimitNote?.replace('{{maxFileSize}}', String(config?.maxFileSize || 100000)) || '';
  }

  // Add examples
  if (template.examples.length > 0) {
    description += '\n\n**Examples**:\n';
    for (const example of template.examples) {
      description += `\n${example.description}:\n`;
      description += '```json\n';
      description += `${example.code}\n`;
      description += '```\n';
      description += `*When to use: ${example.whenToUse}*\n`;
    }
  }

  // Add limitations with context substitution
  if (template.limitations.length > 0) {
    description += '\n**Limitations**:\n';
    for (const limitation of template.limitations) {
      const substituted = limitation
        .replace('{{workspace}}', environment.workspace)
        .replace('{{shell}}', environment.shell)
        .replace('{{os}}', environment.os)
        .replace('{{timeout}}', String((config?.shellTimeout || 300000) / 1000))
        .replace('{{maxFileSize}}', String(config?.maxFileSize || 100000));
      description += `- ${substituted}\n`;
    }
  }

  // Add model-specific context note
  description += `\n**Model Context**: ${capabilities.modelName} (${capabilities.provider})`;
  description += ` | Context: ${Math.round(capabilities.contextLength / 1000)}k tokens`;
  if (capabilities.supportsReasoning) {
    description += ' | Reasoning: enabled';
  }

  log.debug({ toolName, model: capabilities.modelName }, 'Rendered tool description');

  return description.trim();
}

// Get all tool descriptions for a model
export function getAllToolDescriptions(
  toolNames: string[],
  capabilities: ModelCapabilities,
  environment: EnvironmentContext,
  config?: {
    maxFileSize?: number;
    shellTimeout?: number;
  }
): Map<string, string> {
  const descriptions = new Map<string, string>();

  for (const toolName of toolNames) {
    const description = renderToolDescription(toolName, capabilities, environment, config);
    if (description) {
      descriptions.set(toolName, description);
    }
  }

  return descriptions;
}

// Dynamic description renderer class
export class DynamicToolDescriptionRenderer {
  private capabilities: ModelCapabilities;
  private environment: EnvironmentContext;
  private config: {
    maxFileSize: number;
    shellTimeout: number;
  };

  constructor(
    model?: string,
    provider?: string,
    workspace: string = process.cwd(),
    config?: {
      maxFileSize?: number;
      shellTimeout?: number;
    }
  ) {
    this.capabilities = detectModelCapabilities(model, provider);
    this.environment = detectEnvironmentContext(workspace);
    this.config = {
      maxFileSize: config?.maxFileSize || 100000,
      shellTimeout: config?.shellTimeout || 300000,
    };
  }

  /**
   * Render description for a specific tool
   */
  render(toolName: string): string {
    return renderToolDescription(toolName, this.capabilities, this.environment, this.config);
  }

  /**
   * Render descriptions for all tools
   */
  renderAll(toolNames: string[]): Map<string, string> {
    return getAllToolDescriptions(toolNames, this.capabilities, this.environment, this.config);
  }

  /**
   * Get current model capabilities
   */
  getCapabilities(): ModelCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Get current environment context
   */
  getEnvironment(): EnvironmentContext {
    return { ...this.environment };
  }

  /**
   * Update model (e.g., after model switch)
   */
  updateModel(model: string, provider?: string): void {
    this.capabilities = detectModelCapabilities(model, provider);
    log.info({ model, provider }, 'Updated model capabilities');
  }

  /**
   * Update workspace
   */
  updateWorkspace(workspace: string): void {
    this.environment.workspace = workspace;
  }
}

// Convenience exports
export { TOOL_TEMPLATES };
