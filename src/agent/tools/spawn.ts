import { Tool } from './base.js';

export class SpawnTool extends Tool {
  name = 'spawn';
  description = 'Spawn a subagent to execute a task in the background.';
  
  parameters = {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'The task description for the subagent',
      },
      label: {
        type: 'string',
        description: 'Optional human-readable label for the task',
      },
    },
    required: ['task'],
  };

  private callback?: (
    task: string,
    label?: string,
    channel?: string,
    chatId?: string
  ) => Promise<string>;
  private defaultChannel?: string;
  private defaultChatId?: string;

  setCallback(callback: (
    task: string,
    label?: string,
    channel?: string,
    chatId?: string
  ) => Promise<string>): void {
    this.callback = callback;
  }

  setDefaultTarget(channel: string, chatId: string): void {
    this.defaultChannel = channel;
    this.defaultChatId = chatId;
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const { task, label } = params as { task: string; label?: string };
    
    if (!this.callback) {
      return 'Error: Spawn tool not properly initialized.';
    }

    return this.callback(task, label, this.defaultChannel, this.defaultChatId);
  }
}
