import { LLMResponse, LLMMessage } from '../types/index.js';

export interface LLMProvider {
  chat(
    messages: LLMMessage[],
    tools?: Array<{
      type: 'function';
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }>,
    model?: string,
    maxTokens?: number,
    temperature?: number
  ): Promise<LLMResponse>;
  getDefaultModel(): string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
