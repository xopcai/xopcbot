import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { BaseTransformer } from './types.js';

interface FileOperation {
  path: string;
  operation: 'read' | 'write' | 'edit' | 'search';
  index: number;
}

export class TrimByFilePath extends BaseTransformer {
  readonly name = 'TrimByFilePath';

  transform(messages: AgentMessage[]): AgentMessage[] {
    const fileOps = this.extractFileOperations(messages);
    const lastOpsByPath = new Map<string, number>();

    for (const op of fileOps) {
      lastOpsByPath.set(op.path, op.index);
    }

    const result: AgentMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const op = fileOps.find((o) => o.index === i);

      if (!op || lastOpsByPath.get(op.path) === i) {
        result.push(msg);
      }
    }

    return result;
  }

  private extractFileOperations(messages: AgentMessage[]): FileOperation[] {
    const operations: FileOperation[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const content = this.extractTextContent(msg.content);

      const readMatch = content.match(/read\s+(?:file\s+)?["']?([\w/.-]+)["']?/i);
      const editMatch = content.match(/edit\s+(?:file\s+)?["']?([\w/.-]+)["']?/i);
      const writeMatch = content.match(/write\s+(?:file\s+)?["']?([\w/.-]+)["']?/i);
      const searchMatch = content.match(/search\s+(?:in\s+)?["']?([\w/.-]+)["']?/i);

      if (readMatch) {
        operations.push({ path: readMatch[1], operation: 'read', index: i });
      } else if (editMatch) {
        operations.push({ path: editMatch[1], operation: 'edit', index: i });
      } else if (writeMatch) {
        operations.push({ path: writeMatch[1], operation: 'write', index: i });
      } else if (searchMatch) {
        operations.push({ path: searchMatch[1], operation: 'search', index: i });
      }
    }

    return operations;
  }

  private extractTextContent(content: unknown): string {
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
