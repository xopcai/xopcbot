import { ToolParameters, ToolSchema } from '../../types/index.js';

export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameters;

  abstract execute(params: Record<string, unknown>): Promise<string>;

  toSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}
