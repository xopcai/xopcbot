/**
 * OpenAI Whisper STT Provider
 */

import OpenAI from 'openai';
import type { STTProvider, STTResult, STTOptions } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('STT:OpenAI');

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
}

export class OpenAIProvider implements STTProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'whisper-1';
  }

  isConfigured(): boolean {
    return true; // Client is initialized with API key
  }

  async transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult> {
    const startTime = Date.now();
    
    try {
      // Telegram voice messages are OGG, but OpenAI supports multiple formats
      // We'll use the raw buffer directly
      const file = new File([audioBuffer], 'voice.ogg', { 
        type: 'audio/ogg' 
      });

      log.debug({ 
        model: this.model, 
        bufferSize: audioBuffer.length,
        language: options?.language 
      }, 'Sending to OpenAI Whisper');

      const result = await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        language: options?.language,
        response_format: 'json',
      });

      const duration = (Date.now() - startTime) / 1000;
      
      log.info({ 
        provider: 'openai',
        duration,
        textLength: result.text?.length 
      }, 'Transcription completed');

      return {
        text: result.text || '',
        provider: 'openai',
        duration,
      };
    } catch (error) {
      log.error({ error }, 'OpenAI transcription failed');
      throw new Error(`OpenAI STT failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}