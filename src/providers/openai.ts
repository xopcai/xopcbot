import OpenAI from 'openai';
import { LLMProvider } from './base.js';
import { LLMMessage, LLMResponse, ToolCall } from '../types/index.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, apiBase?: string, defaultModel = 'gpt-4o') {
    this.client = new OpenAI({ apiKey, baseURL: apiBase });
    this.defaultModel = defaultModel;
  }

  async chat(
    messages: LLMMessage[],
    tools?: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>,
    model?: string,
    maxTokens = 4096,
    temperature = 0.7
  ): Promise<LLMResponse> {
    const actualModel = model || this.defaultModel;

    try {
      const openaiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = tools?.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      const response = await this.client.chat.completions.create({
        model: actualModel,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        tools: openaiTools,
        tool_choice: 'auto',
        max_tokens: maxTokens,
        temperature,
      });

      const choice = response.choices[0];
      const message = choice.message;

      const toolCalls: ToolCall[] = message.tool_calls?.map(tc => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = { raw: tc.function.arguments };
        }
        return {
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(args),
          },
        };
      }) || [];

      const usage = response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      } : undefined;

      return {
        content: message.content,
        tool_calls: toolCalls,
        finish_reason: choice.finish_reason || 'stop',
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
