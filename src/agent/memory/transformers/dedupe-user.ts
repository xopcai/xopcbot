import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { UserMessage } from '@mariozechner/pi-ai';
import { BaseTransformer } from './types.js';

export class DedupeConsecutiveUser extends BaseTransformer {
  readonly name = 'DedupeConsecutiveUser';

  transform(messages: AgentMessage[]): AgentMessage[] {
    const result: AgentMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];

      if (current.role === 'user' && result.length > 0) {
        const prev = result[result.length - 1] as UserMessage;
        if (prev.role === 'user') {
          prev.content = this.mergeContent(prev.content, current.content) as UserMessage['content'];
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
