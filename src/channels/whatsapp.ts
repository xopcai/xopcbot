import { EventEmitter } from 'events';
import { InboundMessage, OutboundMessage } from '../../types/index.js';

// Baileys type declarations
interface BaileysSocket {
  ev: {
    on(event: string, callback: (...args: unknown[]) => void): void;
  };
  sendMessage(jid: string, message: { text: string }): Promise<unknown>;
  end(): void;
}

interface BaileysConfig {
  printQRInTerminal: boolean;
  auth: unknown;
  logger?: { level: string };
}

declare module '@whiskeysockets/baileys' {
  function default(config: BaileysConfig): BaileysSocket;
  function makeInMemoryStore(config: unknown): { state: unknown; clear(): void };
  export default default;
}

import { default as BaileysLib, makeInMemoryStore } from '@whiskeysockets/baileys';
import { BaseChannel } from './base.js';
import { MessageBus } from '../bus/index.js';

export class WhatsAppChannel extends BaseChannel {
  name = 'whatsapp';
  private sock: BaileysSocket | null = null;
  private store: ReturnType<typeof makeInMemoryStore> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Record<string, unknown>, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (this.running) return;

    try {
      // Create in-memory store for session
      this.store = makeInMemoryStore({});

      // Create socket
      this.sock = BaileysLib({
        printQRInTerminal: true,
        auth: this.store.state,
        logger: { level: 'silent' },
      });

      // Handle connection updates
      this.sock.ev.on('connection.update', (update: { connection: string; lastDisconnect?: { error?: Error } }) => {
        const { connection } = update;

        if (connection === 'close') {
          const shouldReconnect = update.lastDisconnect?.error?.message !== 'Connection Closed';
          
          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`WhatsApp reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
          } else {
            console.log('WhatsApp disconnected');
          }
        } else if (connection === 'open') {
          this.reconnectAttempts = 0;
          console.log('✅ WhatsApp connected');
        }
      });

      // Handle messages
      this.sock.ev.on('messages.upsert', (event: { messages: Array<{ key: { fromMe: boolean; remoteJid: string; participant?: string }; message?: { conversation?: string; extendedTextMessage?: { text: string } } }> }) => {
        for (const message of event.messages) {
          if (message.key.fromMe) continue;
          
          const chatId = message.key.remoteJid;
          const senderId = message.key.participant || chatId;
          const content = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || 
                         '[media]';

          this.handleMessage(senderId, String(chatId), content);
        }
      });

      this.connect();
      this.running = true;
      console.log('✅ WhatsApp channel started');
    } catch (error) {
      console.error('Failed to start WhatsApp channel:', error);
      throw error;
    }
  }

  private connect(): void {
    // Connection is handled by Baileys event listeners
  }

  async stop(): Promise<void> {
    this.running = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.sock) {
      this.sock.end();
      this.sock = null;
    }

    this.store?.clear();
    this.store = null;

    console.log('🛑 WhatsApp channel stopped');
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.sock) {
      console.error('WhatsApp socket not initialized');
      return;
    }

    try {
      await this.sock.sendMessage(msg.chat_id, { text: msg.content });
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
    }
  }

  private async handleMessage(senderId: string, chatId: string, content: string): Promise<void> {
    if (!this.isAllowed(senderId)) {
      return;
    }

    const msg: InboundMessage = {
      channel: this.name,
      sender_id: String(senderId),
      chat_id: String(chatId),
      content,
    };

    await this.bus.publishInbound(msg);
  }
}
