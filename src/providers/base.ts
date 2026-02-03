import { LLMMessage, LLMResponse, ToolCall } from '../types/index.js';

export interface LLMProvider {
  chat(
    messages: LLMMessage[],
    tools?: Array<Record<string, unknown>>[],
    model?: string,
    maxTokens?: number,
    temperature?: number
  ): Promise<LLMResponse>;
  getDefaultModel(): string;
}
