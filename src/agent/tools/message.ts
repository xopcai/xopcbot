import { Tool } from './base.js';
import { OutboundMessage } from '../../types/index.js';

export class MessageTool extends Tool {
  readonly name = 'message';
  readonly description = 'Send a message to a specific chat channel.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The message content to send' },
      channel: { type: 'string', description: 'The channel to send to' },
      chat_id: { type: 'string', description: 'The chat/room ID' },
    },
    required: ['content'],
  };

  private sendCallback?: (msg: OutboundMessage) => Promise<void>;
  private defaultChannel?: string;
  private defaultChatId?: string;

  setSendCallback(cb: (msg: OutboundMessage) => Promise<void>) { this.sendCallback = cb; }
  setDefaultTarget(channel: string, chatId: string) { this.defaultChannel = channel; this.defaultChatId = chatId; }

  async execute(params: Record<string, unknown>): Promise<string> {
    const content = String(params.content);
    const channel = params.channel ? String(params.channel) : undefined;
    const chatId = params.chat_id ? String(params.chat_id) : undefined;
    
    if (!this.sendCallback) return 'Error: Message tool not initialized.';
    const targetChannel = channel || this.defaultChannel;
    const targetChatId = chatId || this.defaultChatId;
    if (!targetChannel || !targetChatId) return 'Error: No target channel/chat_id.';

    try {
      await this.sendCallback({ channel: targetChannel, chat_id: targetChatId, content });
      return `Message sent to ${targetChannel}:${targetChatId}`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
