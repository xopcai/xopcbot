import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { BaseTransformer } from './types.js';

export class StripWorkingDir extends BaseTransformer {
  readonly name = 'StripWorkingDir';
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    super();
    this.workspaceDir = workspaceDir.replace(/\/$/, '');
  }

  transform(messages: AgentMessage[]): AgentMessage[] {
    return messages.map((msg) => ({
      ...msg,
      content: this.stripWorkspaceDir(msg.content),
    })) as AgentMessage[];
  }

  private stripWorkspaceDir(content: unknown): unknown {
    if (typeof content === 'string') {
      return this.replaceWorkspacePath(content);
    }
    if (Array.isArray(content)) {
      return content.map((c: any) => {
        if (c.type === 'text' && c.text) {
          return { ...c, text: this.replaceWorkspacePath(c.text) };
        }
        return c;
      });
    }
    return content;
  }

  private replaceWorkspacePath(text: string): string {
    return text.replace(new RegExp(this.escapeRegExp(this.workspaceDir), 'g'), '.');
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
