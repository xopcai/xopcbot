import { default as Baileys, DisconnectReason, makeInMemoryStore } from 'baileys';
import { BaseChannel } from './base.js';
import { OutboundMessage } from '../../types/index.js';
import { MessageBus } from '../bus/index.js';

export class WhatsAppChannel extends BaseChannel {
  name = 'whatsapp';
  private sock: Baileys.WASocket | null = null;
  private store: ReturnType<typeof makeInMemoryStore> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: Record<string, unknown>, bus: MessageBus) {
    super(config, bus);
  }

  async start(): Promise<void> {
    if (this.running) return;

    const bridgeUrl = this.config.bridge_url as string || 'ws://localhost:3001';

    try {
      // Create baileys socket
      this.store = makeInMemoryStore({});

      this.sock = Baileys.default({
        printQRInTerminal: true,
        auth: this.store.state,
        logger: {
          level: 'warn',
        },
      });

      // Handle connection updates
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as Error)?.output?.statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`WhatsApp reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => this.connect(), 5000);
          } else {
            console.error('WhatsApp disconnected permanently');
          }
        } else if (connection === 'open') {
          this.reconnectAttempts = 0;
          console.log('✅ WhatsApp connected');
        }
      });

      // Handle messages
      this.sock.ev.on('messages.upsert', async (event) => {
        for (const message of event.messages) {
          if (message.key.fromMe) continue;
          
          const chatId = message.key.remoteJid;
          const senderId = message.key.participant || chatId;
          const content = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || 
                         '[media]';

          await this.handleMessage(senderId, String(chatId), content);
        }
      });

      this.running = true;
      console.log('✅ WhatsApp channel started');
    } catch (error) {
      console.error('Failed to start WhatsApp channel:', error);
      throw error;
    }
  }

  async connect(): Promise<void> {
    if (!this.sock) return;
    // Reconnection is handled by the connection.update event
  }

  async stop(): Promise<void> {
    this.running = false;
    
    if (this.sock) {
      this.sock.end(undefined);
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
      await this.sock.sendMessage(msg.chat_id, {
        text: msg.content,
      });
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
    }
  }
}
