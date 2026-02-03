import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, ToolCallRequest } from './base.js';
import { LLMMessage, LLMResponse } from '../types/index.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'claude-opus-4-5') {
    this.client = new Anthropic({
      apiKey,
    });
    this.defaultModel = defaultModel;
  }

  async chat(
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
    maxTokens = 4096,
    temperature = 0.7
  ): Promise<LLMResponse> {
    const actualModel = model || this.defaultModel;

    // Convert to Anthropic format
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    try {
      const response = await this.client.messages.create({
        model: actualModel,
        max_tokens: maxTokens,
        temperature,
        tools: tools as Anthropic.Tool[],
        messages: otherMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
        })),
        system: systemMessage?.content as string | undefined,
      });

      const toolCalls: ToolCallRequest[] = [];
      let content: string | null = null;

      for (const block of response.content) {
        if (block.type === 'text') {
          content = (content ? content + '\n' : '') + block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      const usage = response.usage ? {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      } : undefined;

      return {
        content,
        tool_calls: toolCalls,
        finish_reason: response.stop_reason || 'stop',
        usage,
      };
    } catch (error) {
      return {
        content: `Error calling LLM: ${error instanceof Error ? error.message : String(error)}`,
        tool_calls: [],
        finish_reason: 'error',
      };
    }
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }
}
