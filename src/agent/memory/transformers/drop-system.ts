import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { BaseTransformer } from './types.js';

export class DropSystemMessages extends BaseTransformer {
  readonly name = 'DropSystemMessages';

  transform(messages: AgentMessage[]): AgentMessage[] {
    return messages.filter((msg) => (msg as any).role !== 'system');
  }
}
