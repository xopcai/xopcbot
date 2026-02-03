import { BaseChannel } from './base.js';
import { OutboundMessage } from '../../types/index.js';
import { MessageBus } from '../bus/index.js';

export class WhatsAppChannel extends BaseChannel {
  name = 'whatsapp';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Record<string, unknown>, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (this.running) return;

    console.log('⚠️  WhatsApp channel requires @whiskeysockets/baileys setup');
    console.log('   See: https://github.com/WhiskeySockets/Baileys');
    
    this.running = true;
    console.log('✅ WhatsApp channel initialized');
  }

  async stop(): Promise<void> {
    this.running = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    console.log('🛑 WhatsApp channel stopped');
  }

  async send(msg: OutboundMessage): Promise<void> {
    console.log(`[WhatsApp] Would send to ${msg.chat_id}: ${msg.content.substring(0, 50)}...`);
  }
}
