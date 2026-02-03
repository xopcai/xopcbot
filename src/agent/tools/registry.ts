import { Tool } from './base.js';
import { ToolSchema } from '../../types/index.js';

export class ToolRegistry {
  private _tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this._tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this._tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this._tools.get(name);
  }

  has(name: string): boolean {
    return this._tools.has(name);
  }

  getDefinitions(): ToolSchema[] {
    return Array.from(this._tools.values()).map((tool) => tool.toSchema());
  }

  async execute(name: string, params: Record<string, unknown>): Promise<string> {
    const tool = this._tools.get(name);
    if (!tool) {
      return `Error: Tool '${name}' not found`;
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      return `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  get toolNames(): string[] {
    return Array.from(this._tools.keys());
  }

  get size(): number {
    return this._tools.size;
  }

  [Symbol.iterator](): Iterator<[string, Tool]> {
    return this._tools[Symbol.iterator]();
  }
}
