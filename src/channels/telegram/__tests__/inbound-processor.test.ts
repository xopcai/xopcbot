import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInboundProcessor } from '../inbound-processor.js';
import { TelegramAccountManager } from '../account-manager.js';
import type { Config } from '../../../config/schema.js';
import type { MessageBus } from '../../../bus/index.js';
import type { Bot, Context } from 'grammy';
import type { Message } from '@grammyjs/types';

// Mock dependencies
vi.mock('../dedupe.js', () => ({
  telegramUpdateDedupe: {
    checkAndAdd: vi.fn(() => false), // Not a duplicate by default
  },
  buildTelegramUpdateKey: vi.fn(() => 'test-update-key'),
}));

vi.mock('../../../commands/session-key.js', () => ({
  generateSessionKey: vi.fn(() => 'telegram:12345:67890'),
}));

vi.mock('../../../stt/index.js', () => ({
  transcribe: vi.fn().mockResolvedValue({ text: 'Transcribed text' }),
  isSTTAvailable: vi.fn(() => false), // Disabled by default
}));

vi.mock('../../../utils/media.js', () => ({
  getMimeType: vi.fn(() => 'image/jpeg'),
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../access-control.js', () => ({
  normalizeAllowFromWithStore: vi.fn((x) => x.allowFrom ?? []),
  evaluateGroupBaseAccess: vi.fn(() => ({ allowed: true })),
  evaluateGroupPolicyAccess: vi.fn(() => ({ allowed: true })),
  resolveGroupPolicy: vi.fn(() => 'open'),
  resolveRequireMention: vi.fn(() => false),
  hasBotMention: vi.fn(() => true),
  removeBotMention: vi.fn((text) => text),
}));

describe('inbound-processor', () => {
  let accountManager: TelegramAccountManager;
  let mockBus: MessageBus;
  let mockConfig: Config;
  let processor: ReturnType<typeof createInboundProcessor>;
  let mockBot: Bot;

  beforeEach(() => {
    vi.clearAllMocks();

    accountManager = new TelegramAccountManager();
    mockBot = {
      api: {
        getFile: vi.fn().mockResolvedValue({
          file_path: 'photos/test.jpg',
        }),
      },
    } as unknown as Bot;

    accountManager.registerBot('default', mockBot);
    accountManager.registerAccount({
      accountId: 'default',
      name: 'Default',
      enabled: true,
      token: 'test-token',
    });
    accountManager.setBotUsername('default', 'test_bot');

    mockBus = {
      publishInbound: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessageBus;

    mockConfig = {};

    processor = createInboundProcessor({
      bus: mockBus,
      config: mockConfig,
      accountManager,
    });
  });

  describe('basic message processing', () => {
    it('should process text message', async () => {
      const mockCtx = createMockContext({
        text: 'Hello World',
        chatId: 12345,
        fromId: 67890,
      });

      await processor(mockCtx as Context, 'default');

      expect(mockBus.publishInbound).toHaveBeenCalled();
      const call = (mockBus.publishInbound as any).mock.calls[0][0];
      expect(call.content).toBe('Hello World');
      expect(call.channel).toBe('telegram');
    });

    it('should handle caption as content', async () => {
      const mockCtx = createMockContext({
        caption: 'Photo caption',
        chatId: 12345,
        fromId: 67890,
      });

      await processor(mockCtx as Context, 'default');

      const call = (mockBus.publishInbound as any).mock.calls[0][0];
      expect(call.content).toBe('Photo caption');
    });

    it('should skip if account not found', async () => {
      const mockCtx = createMockContext({ text: 'Hello' });

      await processor(mockCtx as Context, 'non-existent');

      expect(mockBus.publishInbound).not.toHaveBeenCalled();
    });

    it('should skip if bot username not available', async () => {
      accountManager.setBotUsername('default', '');
      const mockCtx = createMockContext({ text: 'Hello' });

      await processor(mockCtx as Context, 'default');

      expect(mockBus.publishInbound).not.toHaveBeenCalled();
    });
  });

  describe('queue management', () => {
    it('should process messages sequentially', async () => {
      const mockCtx1 = createMockContext({ text: 'Message 1', chatId: 12345 });
      const mockCtx2 = createMockContext({ text: 'Message 2', chatId: 12345 });

      await Promise.all([
        processor(mockCtx1 as Context, 'default'),
        processor(mockCtx2 as Context, 'default'),
      ]);

      expect(mockBus.publishInbound).toHaveBeenCalledTimes(2);
    });
  });

  describe('result structure', () => {
    it('should publish correct message structure', async () => {
      const mockCtx = createMockContext({
        text: 'Test',
        chatId: 12345,
        fromId: 67890,
      });

      await processor(mockCtx as Context, 'default');

      const call = (mockBus.publishInbound as any).mock.calls[0][0];
      expect(call).toHaveProperty('channel', 'telegram');
      expect(call).toHaveProperty('sender_id');
      expect(call).toHaveProperty('chat_id');
      expect(call).toHaveProperty('content');
      expect(call).toHaveProperty('metadata');
    });
  });
});

// Helper to create mock context
function createMockContext(options: {
  text?: string;
  caption?: string;
  chatId?: number;
  fromId?: number;
}): Partial<Context> {
  return {
    chat: {
      id: options.chatId ?? 12345,
      type: 'private',
    } as any,
    from: {
      id: options.fromId ?? 67890,
      username: 'testuser',
    } as any,
    message: {
      message_id: 1,
      text: options.text,
      caption: options.caption,
      date: Date.now(),
    } as Message,
  };
}
