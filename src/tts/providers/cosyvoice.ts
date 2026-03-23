/**
 * CosyVoice TTS Provider
 * 
 * 本地 CosyVoice API 服务集成
 * 需要先启动 CosyVoice 服务: http://localhost:8080
 */

import { BaseTTSProvider, type BaseProviderConfig } from './base.js';
import type { TTSOptions, TTSResult } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('TTS:CosyVoice');

export interface CosyVoiceProviderConfig extends BaseProviderConfig {
  /** API 服务地址 */
  apiUrl?: string;
  /** 参考语音文本 */
  promptText?: string;
  /** 参考语音文件路径（可选，用于自定义音色） */
  promptAudioPath?: string;
}

const DEFAULT_API_URL = 'http://localhost:8080';
const DEFAULT_PROMPT_TEXT = '希望你以后能够做的比我还好呦。';

export class CosyVoiceProvider extends BaseTTSProvider {
  readonly name = 'cosyvoice';

  private apiUrl: string;
  private promptText: string;
  private promptAudioPath?: string;

  constructor(config: CosyVoiceProviderConfig = {}) {
    super(config);
    this.apiUrl = config.apiUrl || DEFAULT_API_URL;
    this.promptText = config.promptText || DEFAULT_PROMPT_TEXT;
    this.promptAudioPath = config.promptAudioPath;
  }

  isConfigured(): boolean {
    return true; // 始终可用，只要服务运行
  }

  protected async doSpeak(text: string, options?: TTSOptions): Promise<TTSResult> {
    const startTime = Date.now();

    // 调用本地 CosyVoice API
    const response = await fetch(`${this.apiUrl}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        prompt_text: this.promptText,
        speed: options?.speed || 1.0,
      }),
      signal: this.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CosyVoice API error: ${response.status} - ${errorText}`);
    }

    // 解析响应
    const result = await response.json() as {
      audio: string;
      duration: number;
      sample_rate: number;
    };
    
    // 解码 base64 音频
    const audioBuffer = Buffer.from(result.audio, 'base64');
    const duration = result.duration || 0;

    log.debug({
      textLength: text.length,
      duration,
      sampleRate: result.sample_rate,
    }, 'CosyVoice TTS completed');

    return {
      audio: audioBuffer,
      format: 'wav',
      duration,
      provider: this.name,
    };
  }

  /**
   * 检查服务是否可用
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
