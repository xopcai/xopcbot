// Message tool
import { Type, type Static } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import type { MessageBus, OutboundMessage } from '../../bus/index.js';

const MessageSendSchema = Type.Object({
  content: Type.String({ description: 'The message content to send' }),
  mediaUrl: Type.Optional(Type.String({ description: 'URL of the media to send (photo, video, audio, document)' })),
  mediaType: Type.Optional(Type.Enum({
    photo: 'photo',
    video: 'video',
    audio: 'audio',
    document: 'document',
  }, { description: 'Type of media to send' })),
  format: Type.Optional(Type.Enum({
    text: 'text',
    voice: 'voice',
  }, { 
    description: 'Message format: "text" for text message, "voice" for voice message (TTS). Use "voice" when the message is long, emotional, or better suited for spoken communication.' 
  })),
});

interface MessageContext {
  channel: string;
  chatId: string;
}

export function createMessageTool(
  bus: MessageBus,
  getContext: () => MessageContext | null
): AgentTool<typeof MessageSendSchema, {}> {
  return {
    name: 'send_message',
    description: `Send a message to the current conversation.

**When to use voice format:**
- For long or detailed explanations (voice is more natural)
- When expressing emotions or empathy
- For storytelling or narrative content
- When the user seems busy or prefers listening
- For urgent or important notifications

**When to use text format:**
- For short, factual responses
- When sharing code, URLs, or structured data
- When the user needs to copy/paste content
- For step-by-step instructions that need reference

Default to text unless voice would significantly improve the user experience.`,

    parameters: MessageSendSchema,
    label: '💬 Send Message',

    async execute(
      toolCallId: string,
      params: Static<typeof MessageSendSchema>,
      _signal?: AbortSignal
    ): Promise<AgentToolResult<{}>> {
      const ctx = getContext();
      if (!ctx) {
        return {
          content: [{ type: 'text', text: 'Error: No active conversation context' }],
          details: {},
        };
      }

      try {
        const msg: OutboundMessage = {
          channel: ctx.channel,
          chat_id: ctx.chatId,
          content: params.content,
          mediaUrl: params.mediaUrl,
          mediaType: params.mediaType as 'photo' | 'video' | 'audio' | 'document' | undefined,
          // Enable TTS when format is 'voice'
          tts: params.format === 'voice',
        };

        await bus.publishOutbound(msg);

        const formatInfo = params.format === 'voice' ? ' (as voice message)' : '';
        const mediaInfo = params.mediaUrl ? ` (with ${params.mediaType || 'media'})` : '';
        return {
          content: [{ type: 'text', text: `Message sent successfully${formatInfo}${mediaInfo}` }],
          details: { format: params.format || 'text', tts: msg.tts },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Send error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}
