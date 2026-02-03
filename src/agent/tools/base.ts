import { ToolSchema } from '../../types/index.js';

export abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;

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
