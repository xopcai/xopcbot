import { Tool } from './base.js';

export class SpawnTool extends Tool {
  readonly name = 'spawn';
  readonly description = 'Spawn a subagent to execute a task in the background.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task description' },
      label: { type: 'string', description: 'Optional label' },
    },
    required: ['task'],
  };

  private cb?: (task: string, label?: string, channel?: string, chatId?: string) => Promise<string>;
  private defaultChannel?: string;
  private defaultChatId?: string;

  setCallback(cb: typeof this.cb) { this.cb = cb; }
  setDefaultTarget(channel: string, chatId: string) { this.defaultChannel = channel; this.defaultChatId = chatId; }

  async execute(params: Record<string, unknown>): Promise<string> {
    const task = String(params.task);
    const label = params.label ? String(params.label) : undefined;
    if (!this.cb) return 'Error: Spawn tool not initialized.';
    return this.cb(task, label, this.defaultChannel, this.defaultChatId);
  }
}
