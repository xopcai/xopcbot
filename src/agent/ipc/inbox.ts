import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises';
import { watch } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';
import type { AgentIPCMessage } from './types.js';

export class AgentInbox {
  private readonly pendingDir: string;
  private readonly processedDir: string;

  constructor(agentDir: string) {
    this.pendingDir = join(agentDir, 'inbox', 'pending');
    this.processedDir = join(agentDir, 'inbox', 'processed');
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.pendingDir, { recursive: true });
    await mkdir(this.processedDir, { recursive: true });
  }

  async enqueue(message: AgentIPCMessage): Promise<void> {
    await this.ensureDirs();
    const filePath = join(this.pendingDir, `${message.id}.json`);
    await writeFile(filePath, JSON.stringify(message, null, 2), 'utf-8');
  }

  async dequeue(): Promise<AgentIPCMessage | null> {
    if (!existsSync(this.pendingDir)) return null;
    const files = await readdir(this.pendingDir).catch(() => []);
    if (files.length === 0) return null;

    const sorted = files.sort();
    const filePath = join(this.pendingDir, sorted[0]);
    const content = await readFile(filePath, 'utf-8');
    const message = JSON.parse(content) as AgentIPCMessage;

    await rename(filePath, join(this.processedDir, sorted[0]));
    return message;
  }

  async watch(handler: (msg: AgentIPCMessage) => Promise<void>): Promise<() => void> {
    await this.ensureDirs();
    const watcher = watch(this.pendingDir, () => {
      void (async () => {
        const msg = await this.dequeue();
        if (msg) await handler(msg);
      })();
    });
    return () => watcher.close();
  }
}
