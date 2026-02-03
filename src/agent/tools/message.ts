import { Tool } from './base.js';
import { OutboundMessage } from '../../types/index.js';

export class MessageTool extends Tool {
  name = 'message';
  description = 'Send a message to a specific chat channel.';
  
  parameters = {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The message content to send',
      },
      channel: {
        type: 'string',
        description: 'The channel to send to (telegram, whatsapp, etc.)',
      },
      chat_id: {
        type: 'string',
        description: 'The chat/room ID to send to',
      },
    },
    required: ['content'],
  };

  private sendCallback?: (msg: OutboundMessage) => Promise<void>;
  private defaultChannel?: string;
  private defaultChatId?: string;

  setSendCallback(callback: (msg: OutboundMessage) => Promise<void>): void {
    this.sendCallback = callback;
  }

  setDefaultTarget(channel: string, chatId: string): void {
    this.defaultChannel = channel;
    this.defaultChatId = chatId;
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const { content, channel, chat_id } = params as { content: string; channel?: string; chat_id?: string };
    
    if (!this.sendCallback) {
      return 'Error: Message tool not properly initialized.';
    }

    const targetChannel = channel || this.defaultChannel;
    const targetChatId = chat_id || this.defaultChatId;

    if (!targetChannel || !targetChatId) {
      return 'Error: No target channel/chat_id specified and no default set.';
    }

    try {
      await this.sendCallback({
        channel: targetChannel,
        chat_id: targetChatId,
        content,
      });
      return `Message sent to ${targetChannel}:${targetChatId}`;
    } catch (error) {
      return `Error sending message: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
