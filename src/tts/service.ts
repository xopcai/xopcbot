import type { TTSConfig, TTSAutoMode, TTSResult } from './types.js';

const CHANNEL_OUTPUT_FORMATS: Record<string, { format: string; voiceCompatible: boolean }> = {
  telegram: { format: 'opus', voiceCompatible: true },
  discord: { format: 'opus', voiceCompatible: true },
  feishu: { format: 'opus', voiceCompatible: true },
  whatsapp: { format: 'ogg', voiceCompatible: true },
  default: { format: 'mp3', voiceCompatible: false },
};

export function getChannelOutputFormat(channel?: string): { format: string; voiceCompatible: boolean } {
  if (!channel) return CHANNEL_OUTPUT_FORMATS.default;
  return CHANNEL_OUTPUT_FORMATS[channel.toLowerCase()] || CHANNEL_OUTPUT_FORMATS.default;
}

export interface TTSContext {
  channel?: string;
  chatId?: string;
}

export function shouldUseTTS(config: TTSConfig, inboundAudio?: boolean): boolean {
  if (!config.enabled) return false;

  const trigger = config.trigger || 'off';

  switch (trigger) {
    case 'off':
      return false;
    case 'always':
      return true;
    case 'inbound':
      return inboundAudio === true;
    case 'tagged':
      return false;
    default:
      return false;
  }
}

export class TTSService {
  constructor(private config: TTSConfig) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getTriggerMode(): TTSAutoMode {
    return this.config.trigger;
  }

  async speak(text: string, context?: TTSContext): Promise<TTSResult> {
    const { speak } = await import('./index.js');
    return speak(text, this.config, {
      tts: {
        format: getChannelOutputFormat(context?.channel).format as 'opus' | 'mp3' | 'wav',
      },
    });
  }
}
