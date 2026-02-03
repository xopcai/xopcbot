import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './base.js';
import { LLMMessage, LLMResponse, ToolCall } from '../types/index.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'claude-opus-4-5') {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async chat(
    messages: LLMMessage[],
    tools: Array<Record<string, unknown>>[] = [],
    model?: string,
    maxTokens = 4096,
    temperature = 0.7
  ): Promise<LLMResponse> {
    const actualModel = model || this.defaultModel;
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    try {
      const anthropicTools: Anthropic.Tool[] | undefined = tools?.map((t: Record<string, unknown>) => ({
        name: String(t.name),
        description: String(t.description),
        input_schema: { type: 'object' as const, properties: t.parameters },
      }));

      const response = await this.client.messages.create({
        model: actualModel,
        max_tokens: maxTokens,
        temperature,
        tools: anthropicTools,
        messages: otherMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
        })),
        system: systemMessage?.content as string | undefined,
      });

      const toolCalls: ToolCall[] = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        }));

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as Anthropic.TextBlock).text)
        .join('\n') || null;

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
