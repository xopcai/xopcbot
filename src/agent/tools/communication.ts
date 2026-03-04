// Message tool with intelligent format selection
import { Type, type Static } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import type { MessageBus, OutboundMessage } from '../../bus/index.js';

/**
 * Message intent - expresses the agent's communication intent
 * System will optimize the delivery format based on intent + context
 */
const MessageIntentSchema = Type.Optional(Type.Enum({
  default: 'default',    // Let system intelligently decide (recommended)
  text: 'text',          // Explicitly prefer text
  voice: 'voice',        // Explicitly prefer voice (TTS)
  urgent: 'urgent',      // Urgent notification (system may use voice + strong visual)
  whisper: 'whisper',    // Private/quiet content (text, subtle notification)
}, {
  default: 'default',
  description: `The communication intent. Use:
- 'default': Let system decide based on content and context (recommended for most cases)
- 'text': When sharing code, URLs, or content user needs to reference/copy
- 'voice': For emotional content, storytelling, or when user is hands-free
- 'urgent': For important notifications that need immediate attention
- 'whisper': For private/sensitive content that should be discreet`,
}));

/**
 * Content context hints - help system optimize delivery
 */
const ContentContextSchema = Type.Optional(Type.Object({
  containsCode: Type.Boolean({ 
    description: 'Whether the content contains code snippets',
    default: false 
  }),
  containsURL: Type.Boolean({ 
    description: 'Whether the content contains URLs',
    default: false 
  }),
  emotional: Type.Boolean({ 
    description: 'Whether the content expresses emotions or empathy',
    default: false 
  }),
  userBusy: Type.Boolean({ 
    description: 'Whether the user appears to be busy (driving, in meeting, etc.)',
    default: false 
  }),
}, {
  description: 'Optional context hints to help optimize message delivery',
}));

const MessageSendSchema = Type.Object({
  content: Type.String({ 
    description: 'The message content to send' 
  }),
  intent: MessageIntentSchema,
  context: ContentContextSchema,
  mediaUrl: Type.Optional(Type.String({ 
    description: 'URL of the media to send (photo, video, audio, document)' 
  })),
  mediaType: Type.Optional(Type.Enum({
    photo: 'photo',
    video: 'video',
    audio: 'audio',
    document: 'document',
  }, { 
    description: 'Type of media to send' 
  })),
});

interface MessageContext {
  channel: string;
  chatId: string;
}

/**
 * Detect content characteristics for intelligent format selection
 */
function analyzeContent(content: string): {
  length: number;
  hasCode: boolean;
  hasURL: boolean;
  hasEmotion: boolean;
  isStructured: boolean;
} {
  const length = content.length;
  const hasCode = /```|`[^`]+`|\b(function|class|const|let|var|if|for|while)\b/.test(content);
  const hasURL = /https?:\/\/\S+/.test(content);
  const hasEmotion = /[!?]{2,}|\b(love|hate|amazing|terrible|wonderful|awful|excited|worried|sorry|congratulations)\b/i.test(content);
  const isStructured = /^(\d+\.\s|\-\s|\*\s|#{1,6}\s)/m.test(content);

  return { length, hasCode, hasURL, hasEmotion, isStructured };
}

/**
 * Intelligent message format selection
 * Combines agent intent with content analysis and system context
 */
function selectMessageFormat(
  intent: string,
  content: string,
  contextHints?: Static<typeof ContentContextSchema>
): { format: 'text' | 'voice'; reason: string; tts: boolean } {
  const contentAnalysis = analyzeContent(content);

  // 1. Honor explicit intent first
  switch (intent) {
    case 'text':
      return { 
        format: 'text', 
        reason: 'Explicit text intent',
        tts: false 
      };
    
    case 'voice':
      return { 
        format: 'voice', 
        reason: 'Explicit voice intent',
        tts: true 
      };
    
    case 'urgent':
      // Urgent: use voice if user is busy, otherwise text with emphasis
      if (contextHints?.userBusy) {
        return { 
          format: 'voice', 
          reason: 'Urgent message + user busy',
          tts: true 
        };
      }
      return { 
        format: 'text', 
        reason: 'Urgent message (text with emphasis)',
        tts: false 
      };
    
    case 'whisper':
      return { 
        format: 'text', 
        reason: 'Private/whisper intent',
        tts: false 
      };
  }

  // 2. Smart default based on content analysis
  
  // Definitely text: code, URLs, structured data
  if (contentAnalysis.hasCode || contentAnalysis.hasURL || contentAnalysis.isStructured) {
    return { 
      format: 'text', 
      reason: 'Content contains code/URLs/structured data',
      tts: false 
    };
  }

  // Context hints override
  if (contextHints?.containsCode || contextHints?.containsURL) {
    return { 
      format: 'text', 
      reason: 'Context: contains code/URL',
      tts: false 
    };
  }

  // Voice preferred: long content + emotional
  if (contentAnalysis.length > 300 && contentAnalysis.hasEmotion) {
    return { 
      format: 'voice', 
      reason: 'Long emotional content',
      tts: true 
    };
  }

  if (contextHints?.emotional && contentAnalysis.length > 200) {
    return { 
      format: 'voice', 
      reason: 'Emotional content (context hint)',
      tts: true 
    };
  }

  // User busy: voice for longer content
  if (contextHints?.userBusy && contentAnalysis.length > 150) {
    return { 
      format: 'voice', 
      reason: 'User busy + moderate length',
      tts: true 
    };
  }

  // Long narrative: voice
  if (contentAnalysis.length > 500 && !contentAnalysis.isStructured) {
    return { 
      format: 'voice', 
      reason: 'Long narrative content',
      tts: true 
    };
  }

  // Default to text for short/simple messages
  return { 
    format: 'text', 
    reason: 'Default (short/simple content)',
    tts: false 
  };
}

export function createMessageTool(
  bus: MessageBus,
  getContext: () => MessageContext | null
): AgentTool<typeof MessageSendSchema, {}> {
  return {
    name: 'send_message',
    description: `Send a message to the current conversation.

**Recommended approach:**
Use 'intent' to express your communication goal, and let the system optimize the delivery format.

**Intent guidelines:**
- 'default' (recommended): Let system decide based on content. Use for most messages.
- 'text': When sharing code, URLs, or content the user needs to copy/reference.
- 'voice': For emotional content, storytelling, or when you know user is hands-free.
- 'urgent': For important notifications. System will choose best format (voice if user busy).
- 'whisper': For private/sensitive content (uses text with subtle notification).

**Context hints (optional):**
Provide context hints to help the system make better decisions:
- containsCode: true - if message has code
- containsURL: true - if message has links
- emotional: true - if expressing feelings
- userBusy: true - if you know user is driving/in meeting

**Examples:**
- Simple response: { content: "Hello!", intent: "default" }
- Code sharing: { content: "Here's the fix...", intent: "text", context: { containsCode: true } }
- Emotional support: { content: "I'm so sorry to hear...", intent: "voice", context: { emotional: true } }
- Urgent alert: { content: "Server is down!", intent: "urgent" }`,

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
        // Intelligent format selection
        const formatDecision = selectMessageFormat(
          params.intent || 'default',
          params.content,
          params.context
        );

        const msg: OutboundMessage = {
          channel: ctx.channel,
          chat_id: ctx.chatId,
          content: params.content,
          mediaUrl: params.mediaUrl,
          mediaType: params.mediaType as 'photo' | 'video' | 'audio' | 'document' | undefined,
          tts: formatDecision.tts,
        };

        await bus.publishOutbound(msg);

        const formatLabel = formatDecision.format === 'voice' ? 'voice message' : 'text';
        const mediaInfo = params.mediaUrl ? ` + ${params.mediaType || 'media'}` : '';
        
        return {
          content: [{ 
            type: 'text', 
            text: `✅ Message sent as ${formatLabel}${mediaInfo} (${formatDecision.reason})` 
          }],
          details: { 
            intent: params.intent || 'default',
            format: formatDecision.format,
            tts: formatDecision.tts,
            reason: formatDecision.reason,
            contentAnalysis: analyzeContent(params.content),
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Send error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}
