// Type declarations for modules without @types packages

declare module 'node-telegram-bot-api' {
  interface TelegramBotOptions {
    polling: boolean;
  }

  interface Message {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
    };
    text?: string;
    photo?: Array<{ file_id: string }>;
    date: number;
  }

  class TelegramBot {
    constructor(token: string, options: TelegramBotOptions);
    on(event: string, callback: (msg: Message) => void): void;
    sendMessage(chatId: string | number, text: string, options?: object): Promise<Message>;
    stopPolling(): Promise<void>;
  }

  export = TelegramBot;
}

declare module '@whiskeysockets/baileys' {
  interface SocketConfig {
    printQRInTerminal: boolean;
    auth: unknown;
    logger?: { level: string };
  }

  interface ConnectionUpdate {
    connection: string;
    lastDisconnect?: {
      error?: Error & { output?: { statusCode?: number } };
    };
  }

  interface MessageUpsert {
    messages: Array<{
      key: {
        fromMe: boolean;
        remoteJid: string;
        participant?: string;
      };
      message?: {
        conversation?: string;
        extendedTextMessage?: {
          text: string;
        };
      };
    }>;
  }

  interface BaileysSocket {
    ev: {
      on(event: 'connection.update', callback: (update: ConnectionUpdate) => void): void;
      on(event: 'messages.upsert', callback: (event: MessageUpsert) => void): void;
    };
    sendMessage(jid: string, message: { text: string }): Promise<unknown>;
    end(): void;
  }

  function createSocket(config: SocketConfig): BaileysSocket;
  function makeInMemoryStore(config: unknown): { state: unknown; clear(): void };

  export = createSocket;
  export { makeInMemoryStore, ConnectionUpdate, MessageUpsert };
}
