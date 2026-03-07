/**
 * Dynamic Tool Description Renderer
 *
 * Provides dynamic tool descriptions based on model capabilities and environment context.
 */

export interface ModelCapabilities {
  supportsImages: boolean;
  supportsFiles: boolean;
  maxTokens: number;
  supportsStructuredOutput: boolean;
}

export interface EnvironmentContext {
  hasFileSystem: boolean;
  hasNetwork: boolean;
  hasBrowser: boolean;
}

export interface ToolExample {
  description: string;
  code?: string;
}

export interface ToolDescriptionTemplate {
  name: string;
  description: string;
  examples: ToolExample[];
}

export interface RenderedToolDescription {
  name: string;
  description: string;
  examples: ToolExample[];
}

export const TOOL_TEMPLATES: Record<string, ToolDescriptionTemplate> = {
  readFile: {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path.',
    examples: [
      {
        description: 'Read a file',
        code: '{"path": "/path/to/file.txt"}',
      },
    ],
  },
  writeFile: {
    name: 'write_file',
    description: 'Write content to a file at the specified path.',
    examples: [
      {
        description: 'Write to a file',
        code: '{"path": "/path/to/file.txt", "content": "Hello world"}',
      },
    ],
  },
};

export function detectModelCapabilities(_model?: string): ModelCapabilities {
  return {
    supportsImages: true,
    supportsFiles: true,
    maxTokens: 8192,
    supportsStructuredOutput: true,
  };
}

export function detectEnvironmentContext(): EnvironmentContext {
  return {
    hasFileSystem: true,
    hasNetwork: true,
    hasBrowser: false,
  };
}

export function renderToolDescription(
  template: ToolDescriptionTemplate,
  _capabilities: ModelCapabilities,
  _context: EnvironmentContext
): RenderedToolDescription {
  return {
    name: template.name,
    description: template.description,
    examples: template.examples,
  };
}

export class DynamicToolDescriptionRenderer {
  private capabilities: ModelCapabilities;
  private context: EnvironmentContext;

  constructor(model?: string) {
    this.capabilities = detectModelCapabilities(model);
    this.context = detectEnvironmentContext();
  }

  render(template: ToolDescriptionTemplate): RenderedToolDescription {
    return renderToolDescription(template, this.capabilities, this.context);
  }

  getCapabilities(): ModelCapabilities {
    return this.capabilities;
  }

  getContext(): EnvironmentContext {
    return this.context;
  }
}

export function getAllToolDescriptions(
  model?: string
): RenderedToolDescription[] {
  const renderer = new DynamicToolDescriptionRenderer(model);
  return Object.values(TOOL_TEMPLATES).map((template) => renderer.render(template));
}
