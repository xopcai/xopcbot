import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import { BaseTransformer } from './types.js';

export class DedupeConsecutiveAssistant extends BaseTransformer {
  readonly name = 'DedupeConsecutiveAssistant';

  transform(messages: AgentMessage[]): AgentMessage[] {
    const result: AgentMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      
      if (current.role === 'assistant' && result.length > 0) {
        const prev = result[result.length - 1] as AssistantMessage;
        if (prev.role === 'assistant') {
          prev.content = this.mergeContent(prev.content, current.content) as AssistantMessage['content'];
          const currentRd = (current as any).reasoning_details;
          if (currentRd) {
            (prev as any).reasoning_details = currentRd;
          }
          continue;
        }
      }
      
      result.push({ ...current });
    }

    return result;
  }

  private mergeContent(a: unknown, b: unknown): unknown {
    const aText = this.extractText(a);
    const bText = this.extractText(b);
    if (!aText) return b;
    if (!bText) return a;
    return `${aText}\n\n${bText}`;
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text || '')
        .join('\n');
    }
    return '';
  }
}
