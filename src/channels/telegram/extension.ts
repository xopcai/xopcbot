/**
 * Telegram Channel Extension
 * 
 * Multi-account implementation with plugin architecture, supporting:
 * - Multiple accounts
 * - Hierarchical access control
 * - Update offset persistence
 * - Streaming messages
 */

import { Bot, type Context, InputFile } from 'grammy';
import { run } from '@grammyjs/runner';
import type {
  ChannelExtension,
  ChannelInitOptions,
  ChannelStartOptions,
  ChannelSendOptions,
  ChannelSendStreamOptions,
  ChannelSendResult,
  ChannelStatus,
  ChannelMetadata,
  TelegramAccountConfig,
} from '../types.js';
import {
  normalizeAllowFromWithStore,
  evaluateGroupBaseAccess,
  evaluateGroupPolicyAccess,
  resolveGroupPolicy,
  resolveRequireMention,
  hasBotMention,
  removeBotMention,
} from '../access-control.js';
import { readUpdateOffset, writeUpdateOffset } from '../update-offset-store.js';
import { draftStreamManager } from '../draft-stream.js';
import { renderTelegramHtmlText, markdownToTelegramChunks } from '../format.js';
import { splitTelegramCaption } from './caption.js';
import { isTelegramHtmlParseError } from './errors.js';
import { createRetryRunner, isRecoverableNetworkError } from '../../infra/retry.js';
import { createLogger } from '../../utils/logger.js';
import { compressAudio } from '../../utils/audio.js';
import { getMimeType, getMediaCategory } from '../../utils/media.js';
import { telegramUpdateDedupe, buildTelegramUpdateKey } from './dedupe.js';
import { sentMessageCache } from './sent-cache.js';
import { MediaGroupBuffer } from './media-group.js';
import { InboundDebounce, buildTelegramDebounceKey } from './debounce.js';
import type { Message } from '@grammyjs/types';
import type { Config } from '../../config/index.js';
import { createTelegramCommandHandler } from './command-handler.js';
<<<<<<< HEAD
=======
import { TelegramAccountManager } from './account-manager.js';
import { createInboundProcessor } from './inbound-processor.js';
import { createOutboundSender } from './outbound-sender.js';
import { renderTelegramHtmlText } from '../format.js';
import type { ProgressStage } from '../types.js';
import { createLogger } from '../../utils/logger.js';
// Import services for dependency injection into inbound-processor
import {
  normalizeAllowFromWithStore,
  evaluateGroupBaseAccess,
  resolveRequireMention,
  hasBotMention,
  removeBotMention,
} from '../access-control.js';
>>>>>>> 8b270f2 (fix(telegram): resolve Markdown formatting in outbound messages)
import { generateSessionKey } from '../../commands/session-key.js';
import { transcribe, isSTTAvailable } from '../../stt/index.js';
import type { ProgressStage } from '../types.js';
import { speak, isTTSAvailable } from '../../tts/index.js';

const log = createLogger('TelegramExtension');

// =============================================================================
// Constants
// =============================================================================

/** Maximum voice message duration in seconds for STT */
const STT_MAX_VOICE_DURATION_SECONDS = 60;

/** Maximum retry attempts for TTS generation */
const TTS_MAX_RETRIES = 3;

/** Delay between TTS retry attempts in milliseconds */
const TTS_RETRY_DELAY_MS = 500;

/** Maximum message chunk size (leaving margin for Telegram's 4096 limit) */
const MESSAGE_CHUNK_SIZE = 3800;

// ============================================
// Account Manager
// ============================================

class TelegramAccountManager {
  private accounts = new Map<string, TelegramAccountConfig>();
  private bots = new Map<string, Bot>();
  private runners = new Map<string, ReturnType<typeof run>>();
  private statuses = new Map<string, ChannelStatus>();
  private botUsernames = new Map<string, string>();

  registerAccount(account: TelegramAccountConfig): void {
    this.accounts.set(account.accountId, account);
    this.statuses.set(account.accountId, {
      accountId: account.accountId,
      running: false,
      mode: 'stopped',
    });
  }

  getAccount(accountId: string): TelegramAccountConfig | undefined {
    return this.accounts.get(accountId);
  }

  getAllAccounts(): TelegramAccountConfig[] {
    return Array.from(this.accounts.values());
  }

  registerBot(accountId: string, bot: Bot): void {
    this.bots.set(accountId, bot);
  }

  getBot(accountId: string): Bot | undefined {
    return this.bots.get(accountId);
  }

  registerRunner(accountId: string, runner: ReturnType<typeof run>): void {
    this.runners.set(accountId, runner);
  }

  async stopRunner(accountId: string): Promise<void> {
    const runner = this.runners.get(accountId);
    if (runner) {
      await runner.stop();
      this.runners.delete(accountId);
    }
  }

  updateStatus(status: ChannelStatus): void {
    this.statuses.set(status.accountId, status);
  }

  getStatus(accountId: string): ChannelStatus | undefined {
    return this.statuses.get(accountId);
  }

  setBotUsername(accountId: string, username: string): void {
    this.botUsernames.set(accountId, username);
  }

  getBotUsername(accountId: string): string | undefined {
    return this.botUsernames.get(accountId);
  }
}

// ============================================
// Message Processor
// ============================================

interface MessageProcessorDeps {
  bus: any;
  config: Config;
  accountManager: TelegramAccountManager;
  _commandHandler?: ReturnType<typeof createTelegramCommandHandler>;
}

interface QueuedMessage {
  ctx: Context;
  accountId: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

function createMessageProcessor(deps: MessageProcessorDeps) {
  const { bus, config, accountManager, _commandHandler } = deps;
  
  const messageQueues = new Map<string, QueuedMessage[]>();
  const processingLocks = new Map<string, Promise<void>>();

  const getChatKey = (accountId: string, chatId: string): string => `${accountId}:${chatId}`;

  const processNextMessage = async (chatKey: string): Promise<void> => {
    // Check if already processing - use promise-based lock to prevent race conditions
    if (processingLocks.has(chatKey)) return;

    const queue = messageQueues.get(chatKey);
    if (!queue || queue.length === 0) return;

    // Create a lock promise to prevent concurrent processing
    let lockResolve: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      lockResolve = resolve;
    });
    processingLocks.set(chatKey, lockPromise);

    const { ctx, accountId, resolve, reject } = queue.shift()!;

    try {
      await processMessageInternal(ctx, accountId);
      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      // Release the lock and clean up
      lockResolve?.();
      processingLocks.delete(chatKey);
      if (queue.length > 0) {
        processNextMessage(chatKey);
      } else {
        messageQueues.delete(chatKey);
      }
    }
  };

  const enqueueMessage = (ctx: Context, accountId: string): Promise<void> => {
    const chatId = String(ctx.chat?.id);
    const chatKey = getChatKey(accountId, chatId);
    
    return new Promise((resolve, reject) => {
      const queue = messageQueues.get(chatKey) || [];
      queue.push({ ctx, accountId, resolve, reject });
      messageQueues.set(chatKey, queue);
      processNextMessage(chatKey);
    });
  };

  const processMessageInternal = async (ctx: Context, accountId: string) => {
    // 1. Update deduplication - skip if already processed
    const updateKey = buildTelegramUpdateKey(ctx);
    if (updateKey && telegramUpdateDedupe.checkAndAdd(updateKey)) {
      log.debug({ updateKey, accountId }, 'Duplicate update detected, skipping');
      return;
    }

    const account = accountManager.getAccount(accountId);
    if (!account) {
      log.warn({ accountId }, 'Account not found for message processing');
      return;
    }

    const botUsername = accountManager.getBotUsername(accountId);
    if (!botUsername) {
      log.warn({ accountId }, 'Bot username not available');
      return;
    }

    const message = ctx.message;
    if (!message) return;

    const chatId = String(ctx.chat?.id);
    const senderId = String(ctx.from?.id);
    const senderUsername = ctx.from?.username;
    const content = message.text ?? message.caption ?? '';
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    // Thread ID for forum chats - typed as optional number
    const threadId = (message as { message_thread_id?: number }).message_thread_id;

    const groupConfig = account.groups?.[chatId];
    const topicConfig = threadId ? groupConfig?.topics?.[String(threadId)] : undefined;

    const effectiveAllowFrom = normalizeAllowFromWithStore({
      allowFrom: isGroup ? account.groupAllowFrom : account.allowFrom,
    });

    const baseAccess = evaluateGroupBaseAccess({
      isGroup,
      groupConfig,
      topicConfig,
      hasGroupAllowOverride: !!(groupConfig?.allowFrom || topicConfig?.allowFrom),
      effectiveGroupAllow: effectiveAllowFrom,
      senderId,
      senderUsername,
    });

    if (!baseAccess.allowed) {
      log.debug({ accountId, chatId, senderId, reason: baseAccess.reason }, 'Message blocked by base access');
      return;
    }

    const groupPolicy = resolveGroupPolicy({
      topicConfig,
      groupConfig,
      accountGroupPolicy: account.groupPolicy,
      defaultGroupPolicy: config.channels?.telegram?.groupPolicy,
    });

    const policyAccess = evaluateGroupPolicyAccess({
      isGroup,
      groupPolicy,
      effectiveGroupAllow: effectiveAllowFrom,
      senderId,
      senderUsername,
    });

    if (!policyAccess.allowed) {
      log.debug({ accountId, chatId, senderId, reason: policyAccess.reason }, 'Message blocked by policy');
      return;
    }

    if (isGroup) {
      const requireMention = resolveRequireMention({
        topicConfig,
        groupConfig,
        defaultRequireMention: true,
      });

      if (requireMention && !hasBotMention({ botUsername, text: content, entities: message.entities })) {
        log.debug({ accountId, chatId }, 'Group message without mention ignored');
        return;
      }
    }

    const cleanContent = isGroup ? removeBotMention(content, botUsername) : content;

    // Use unified session key generator for consistency with command system
    const sessionKey = generateSessionKey({
      source: 'telegram',
      chatId,
      senderId,
      isGroup,
      threadId: threadId ? String(threadId) : undefined,
    });

    const media: Array<{ type: string; fileId: string }> = [];
    if (message.photo?.length) {
      media.push({ type: 'photo', fileId: message.photo[message.photo.length - 1].file_id });
    }
    if (message.document) media.push({ type: 'document', fileId: message.document.file_id });
    if (message.video) media.push({ type: 'video', fileId: message.video.file_id });
    if (message.audio) media.push({ type: 'audio', fileId: message.audio.file_id });
    if (message.voice) media.push({ type: 'voice', fileId: message.voice.file_id });

    // Download media files and convert to attachments
    const attachments: Array<{ type: string; mimeType: string; data: string; name?: string; size?: number }> = [];
    let transcribedText = '';
    const bot = accountManager.getBot(accountId);
    const botToken = account.token;

    if (bot && botToken && media.length > 0) {
      const accountApiRoot = account.apiRoot?.replace(/\/$/, '') || 'https://api.telegram.org';
      for (const item of media) {
        try {
          const file = await bot.api.getFile(item.fileId);
          // Construct download URL using apiRoot if configured, otherwise default to api.telegram.org
          const downloadUrl = `${accountApiRoot}/file/bot${botToken}/${file.file_path}`;
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`);
          }
          const buffer = await response.arrayBuffer();
          
          // Handle voice messages with STT
          if (item.type === 'voice' && config?.stt && isSTTAvailable(config.stt)) {
            const voiceDuration = message.voice?.duration || 0;
            if (voiceDuration > STT_MAX_VOICE_DURATION_SECONDS) {
              log.warn({ duration: voiceDuration }, `Voice message too long (>${STT_MAX_VOICE_DURATION_SECONDS}s), skipping STT`);
              transcribedText = `[Voice message too long (>${STT_MAX_VOICE_DURATION_SECONDS}s), STT not supported]`;
            } else {
              try {
                log.info({ 
                  provider: config.stt.provider,
                  bufferSize: buffer.byteLength,
                  duration: voiceDuration 
                }, 'Starting STT transcription');
                
                const sttResult = await transcribe(Buffer.from(buffer), config.stt, {
                  language: config.stt.provider === 'alibaba' ? 'zh' : undefined,
                });
                transcribedText = sttResult.text;
                log.info({ provider: sttResult.provider, textLength: transcribedText.length }, 'Voice transcribed');
              } catch (sttError) {
                const errorMsg = sttError instanceof Error ? sttError.message : String(sttError);
                log.error({ 
                  error: errorMsg,
                  provider: config.stt.provider,
                  bufferSize: buffer.byteLength 
                }, 'STT transcription failed');
                transcribedText = `[STT failed: ${errorMsg}]`;
              }
            }
          }
          
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = getMimeType(item.type, file.file_path);
          attachments.push({
            type: item.type,
            mimeType,
            data: base64,
            name: file.file_path.split('/').pop(),
            size: buffer.byteLength,
          });
          log.debug({ type: item.type, size: buffer.byteLength }, 'Media downloaded');
        } catch (err) {
          log.error({ type: item.type, fileId: item.fileId, err }, 'Failed to download media');
        }
      }
    }

    // Combine transcribed text with original content
    const finalContent = transcribedText 
      ? transcribedText + (cleanContent ? '\n\n' + cleanContent : '')
      : cleanContent;

    // Check if it's a command
    const isCommand = cleanContent.startsWith('/');
    
    log.info({ 
      accountId, 
      chatId, 
      senderId, 
      isGroup, 
      threadId, 
      sessionKey, 
      contentLength: finalContent.length, 
      attachmentCount: attachments.length, 
      hasVoice: !!transcribedText,
      isCommand 
    }, 'Processing Telegram message');

    await bus.publishInbound({
      channel: 'telegram',
      sender_id: senderId,
      chat_id: chatId,
      content: finalContent,
      metadata: {
        sessionKey,
        messageId: String(message.message_id),
        isGroup,
        isCommand,
        threadId: threadId ? String(threadId) : undefined,
        media: media.length > 0 ? media : undefined,
        transcribedVoice: !!transcribedText || undefined,
      },
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  };

  return enqueueMessage;
}

// ============================================
// Telegram Extension Implementation
// ============================================

export class TelegramChannelExtension implements ChannelExtension {
  id = 'telegram' as const;

  meta: ChannelMetadata = {
    id: 'telegram',
    name: 'Telegram',
    description: 'Telegram messaging channel',
    capabilities: {
      chatTypes: ['direct', 'group', 'channel', 'thread'],
      reactions: true,
      threads: true,
      media: true,
      polls: false,
      nativeCommands: true,
      blockStreaming: true,
    },
  };

  private accountManager = new TelegramAccountManager();
  private messageProcessor!: ReturnType<typeof createMessageProcessor>;
  private commandHandlers = new Map<string, ReturnType<typeof createTelegramCommandHandler>>();
  private bus: any = null;
  private config: Config | null = null;

  // New: Media group buffer for combining album photos
  private mediaGroupBuffer: MediaGroupBuffer;

  // New: Inbound debounce for combining rapid messages
  private inboundDebounce: InboundDebounce<{
    ctx: Context;
    accountId: string;
    message: Message;
  }>;

  constructor() {
    // Initialize media group buffer
    this.mediaGroupBuffer = new MediaGroupBuffer({
      timeoutMs: 500,
      onFlush: async (messages, ctx) => {
        await this.processMediaGroup(messages, ctx);
      },
    });

    // Initialize inbound debounce
    this.inboundDebounce = new InboundDebounce({
      debounceMs: 300,
      buildKey: (item) => buildTelegramDebounceKey(item.ctx),
      shouldDebounce: (item) => {
        // Don't debounce commands or media
        const text = item.message.text ?? item.message.caption ?? '';
        if (text.startsWith('/')) return false;
        if (item.message.photo || item.message.document || item.message.video) return false;
        return text.length < 100; // Only debounce short messages
      },
      onFlush: async (items) => {
        await this.processDebouncedMessages(items);
      },
      onError: (err, items) => {
        log.error({ err, itemCount: items.length }, 'Debounced message processing failed');
      },
    });
  }

  async init(options: ChannelInitOptions): Promise<void> {
    this.bus = options.bus;
    this.config = options.config;
    
    // Create command handler for shared state
    const commandHandler = createTelegramCommandHandler({
      bus: options.bus,
      config: options.config,
      getSessionModel: (sessionKey) => this.getSessionModel(sessionKey),
      setSessionModel: (sessionKey, modelId) => this.setSessionModel(sessionKey, modelId),
    });
    
    this.messageProcessor = createMessageProcessor({
      bus: options.bus,
      config: options.config,
      accountManager: this.accountManager,
      _commandHandler: commandHandler,
    });

    const telegramConfig = options.config.channels?.telegram;
    if (!telegramConfig?.enabled) {
      log.info('Telegram channel disabled in config');
      return;
    }

    // Register legacy single-account config
    if (telegramConfig.token) {
      const legacyAccount: TelegramAccountConfig = {
        accountId: 'default',
        name: 'Default Account',
        enabled: true,
        token: telegramConfig.token,
        allowFrom: telegramConfig.allowFrom ?? [],
        dmPolicy: telegramConfig.dmPolicy ?? 'pairing',
        groupPolicy: telegramConfig.groupPolicy ?? 'open',
        apiRoot: telegramConfig.apiRoot,
      };
      this.accountManager.registerAccount(legacyAccount);
      log.info('Registered legacy Telegram account (default)');
    }

    // Register multi-account configs
    if (telegramConfig.accounts) {
      for (const [accountId, accountConfig] of Object.entries(telegramConfig.accounts)) {
        const account: TelegramAccountConfig = { ...accountConfig, accountId };
        this.accountManager.registerAccount(account);
        log.info({ accountId }, 'Registered Telegram account');
      }
    }
  }

  async start(options?: ChannelStartOptions): Promise<void> {
    const accounts = options?.accountId
      ? [this.accountManager.getAccount(options.accountId)].filter(Boolean) as TelegramAccountConfig[]
      : this.accountManager.getAllAccounts();

    for (const account of accounts) {
      await this.startAccount(account);
    }
  }

  private async startAccount(account: TelegramAccountConfig): Promise<void> {
    const { accountId, token, apiRoot } = account;

    if (!token) {
      log.warn({ accountId }, 'Skipping account - no token configured');
      return;
    }

    try {
      const botConfig = apiRoot ? { client: { apiRoot } } : undefined;
      const bot = new Bot(token, botConfig);
      this.accountManager.registerBot(accountId, bot);

      const me = await bot.api.getMe();
      this.accountManager.setBotUsername(accountId, me.username);
      log.info({ accountId, username: me.username }, 'Telegram bot initialized');

      // Get or create command handler for this account
      let commandHandler = this.commandHandlers.get(accountId);
      if (!commandHandler) {
        commandHandler = createTelegramCommandHandler({
          bus: this.bus!,
          config: this.config!,
          getSessionModel: (sessionKey) => this.getSessionModel(sessionKey),
          setSessionModel: (sessionKey, modelId) => this.setSessionModel(sessionKey, modelId),
          showProviderModels: async (ctx, providerId) => {
            await commandHandler!.handleProviderSelect(ctx, providerId);
          },
          showProvidersAgain: async (ctx) => {
            await commandHandler!.handleShowProviders(ctx);
          },
          handleCleanupConfirm: async (ctx) => {
            await commandHandler!.handleCleanupConfirm(ctx);
          },
        });
        this.commandHandlers.set(accountId, commandHandler);
      }

      // Register slash commands with Telegram Bot API
      try {
        await bot.api.setMyCommands([
          { command: 'start', description: 'Show welcome message and help' },
          { command: 'models', description: 'Show available models' },
          { command: 'usage', description: 'Show token usage stats' },
          { command: 'cleanup', description: 'Clean up old sessions' },
          { command: 'new', description: 'Start a new session (archive current)' },
          { command: 'skills', description: 'Manage skills (e.g., /skills reload)' },
        ]);
        log.info({ accountId }, 'Registered Telegram bot commands');
      } catch (err) {
        log.error({ accountId, err }, 'Failed to register Telegram bot commands');
      }

      // Register command handlers
      bot.command('models', async (ctx) => {
        await commandHandler!.handleModels(ctx);
      });
      
      bot.command('cleanup', async (ctx) => {
        await commandHandler!.handleCleanup(ctx);
      });

      bot.command('start', async (ctx) => {
        await commandHandler!.handleStart(ctx);
      });

      // Register message handler with media group and debounce support
      const enqueueMessage = this.messageProcessor;
      bot.on('message', async (ctx) => {
        try {
          // Check for media group (photo album)
          const mediaGroupId = (ctx.message as { media_group_id?: string }).media_group_id;
          if (mediaGroupId) {
            const buffered = await this.mediaGroupBuffer.process(ctx);
            if (buffered) return; // Message was buffered, will be processed as group
          }

          // Process through inbound debounce for text messages
          const debounceKey = buildTelegramDebounceKey(ctx);
          if (debounceKey) {
            await this.inboundDebounce.process({
              ctx,
              accountId,
              message: ctx.message,
            });
            return;
          }

          // Process immediately (no debounce key)
          await enqueueMessage(ctx, accountId);
        } catch (err) {
          log.error({ accountId, err }, 'Failed to process message');
        }
      });

      // Register callback query handler for inline keyboards
      bot.on('callback_query:data', async (ctx) => {
        try {
          const data = ctx.callbackQuery.data;
          
          if (data.startsWith('provider:')) {
            const providerId = data.slice('provider:'.length);
            await commandHandler!.handleProviderSelect(ctx, providerId);
          } else if (data.startsWith('model:')) {
            const modelId = data.slice('model:'.length);
            await commandHandler!.handleModelSelect(ctx, modelId);
          } else if (data === 'providers') {
            await commandHandler!.handleShowProviders(ctx);
          } else if (data === 'cleanup:confirm') {
            await commandHandler!.handleCleanupConfirm(ctx);
          } else if (data === 'cancel') {
            await commandHandler!.handleCancel(ctx);
          } else {
            log.warn({ callbackData: data, accountId }, 'Unknown callback query data');
            await ctx.answerCallbackQuery('Unknown action');
          }
        } catch (err) {
          log.error({ accountId, err }, 'Failed to handle callback query');
          await ctx.answerCallbackQuery('Failed to process action');
        }
      });

      // Error handler
      bot.catch((err) => {
        const ctx = err.ctx;
        log.error({ accountId, updateId: ctx.update.update_id, error: err.error }, 'Telegram bot error');
      });

      // Persist update offset
      const lastUpdateId = await readUpdateOffset(accountId);
      log.debug({ accountId, lastUpdateId }, 'Starting Telegram polling');

      bot.use(async (ctx, next) => {
        const updateId = ctx.update.update_id;
        if (lastUpdateId === null || updateId > lastUpdateId) {
          await writeUpdateOffset(accountId, updateId);
        }
        await next();
      });

      // Start polling
      const runner = run(bot, {
        runner: {
          fetch: { timeout: 30, allowed_updates: undefined },
          silent: true,
          maxRetryTime: 5 * 60 * 1000,
          retryInterval: 'exponential',
        },
      });

      this.accountManager.registerRunner(accountId, runner);

      this.accountManager.updateStatus({
        accountId,
        running: true,
        lastStartAt: Date.now(),
        mode: 'polling',
      });

      log.info({ accountId, mode: 'polling' }, 'Telegram account started');
    } catch (err) {
      log.error({ accountId, err }, 'Failed to start Telegram account');
      this.accountManager.updateStatus({
        accountId,
        running: false,
        lastError: err instanceof Error ? err.message : String(err),
        mode: 'stopped',
      });
      throw err;
    }
  }

  async stop(accountId?: string): Promise<void> {
    // Flush all pending buffers before stopping
    await this.mediaGroupBuffer.flushAll();
    await this.inboundDebounce.flushAll();

    const accounts = accountId
      ? [this.accountManager.getAccount(accountId)].filter(Boolean) as TelegramAccountConfig[]
      : this.accountManager.getAllAccounts();

    for (const account of accounts) {
      await this.accountManager.stopRunner(account.accountId);
      this.accountManager.updateStatus({
        accountId: account.accountId,
        running: false,
        lastStopAt: Date.now(),
        mode: 'stopped',
      });
      log.info({ accountId: account.accountId }, 'Telegram account stopped');
    }
  }

  /**
   * Process a media group (album) as a single message
   */
  private async processMediaGroup(messages: Message[], firstCtx: Context): Promise<void> {
    const accountId = this.getAccountIdFromContext(firstCtx);
    if (!accountId) {
      log.warn('Could not determine account ID for media group');
      return;
    }

    // Combine all photos into attachments
    const allMedia: Array<{ type: string; fileId: string }> = [];
    for (const msg of messages) {
      if (msg.photo?.length) {
        allMedia.push({ type: 'photo', fileId: msg.photo[msg.photo.length - 1].file_id });
      }
      if (msg.document) allMedia.push({ type: 'document', fileId: msg.document.file_id });
      if (msg.video) allMedia.push({ type: 'video', fileId: msg.video.file_id });
    }

    // Get combined caption from last message with caption
    const lastMessageWithCaption = [...messages].reverse().find(m => m.caption || m.text);
    const combinedCaption = lastMessageWithCaption?.caption || lastMessageWithCaption?.text || '';

    // Create synthetic context with combined media
    const syntheticCtx = {
      ...firstCtx,
      message: {
        ...firstCtx.message,
        caption: combinedCaption,
        photo: undefined, // Processed separately via allMedia
      },
    };

    log.info({
      accountId,
      chatId: firstCtx.chat?.id,
      messageCount: messages.length,
      mediaCount: allMedia.length,
    }, 'Processing media group');

    await this.messageProcessor(syntheticCtx as Context, accountId);
  }

  /**
   * Process debounced (combined) messages
   */
  private async processDebouncedMessages(items: Array<{ ctx: Context; accountId: string; message: Message }>): Promise<void> {
    if (items.length === 0) return;

    const first = items[0];
    const accountId = first.accountId;

    if (items.length === 1) {
      // Single message - process normally
      await this.messageProcessor(first.ctx, accountId);
      return;
    }

    // Combine messages
    const combinedText = items
      .map(item => item.message.text ?? item.message.caption ?? '')
      .filter(Boolean)
      .join('\n');

    // Create synthetic context with combined text
    const syntheticCtx = {
      ...first.ctx,
      message: {
        ...first.message,
        text: combinedText,
        caption: undefined,
      },
    };

    log.info({
      accountId,
      chatId: first.ctx.chat?.id,
      messageCount: items.length,
      combinedLength: combinedText.length,
    }, 'Processing debounced messages');

    await this.messageProcessor(syntheticCtx as Context, accountId);
  }

  /**
   * Get account ID from context (helper method)
   */
  private getAccountIdFromContext(ctx: Context): string | undefined {
    // Find account by matching bot info
    const botId = ctx.me?.id;
    if (!botId) return undefined;

    for (const account of this.accountManager.getAllAccounts()) {
      const bot = this.accountManager.getBot(account.accountId);
      if (bot && ctx.me?.username === ctx.me?.username) {
        return account.accountId;
      }
    }

    return 'default'; // Fallback to default
  }

  async send(options: ChannelSendOptions): Promise<ChannelSendResult> {
    const { chatId, content, type = 'message', accountId = 'default', threadId, replyToMessageId, mediaUrl, mediaType, silent } = options;

    log.info({ chatId, accountId, hasContent: !!content, hasMediaUrl: !!mediaUrl, mediaType, contentLength: content?.length }, 'TelegramExtension.send called');

    const bot = this.accountManager.getBot(accountId);
    if (!bot) {
      log.error({ accountId }, 'Bot not found for account');
      return { messageId: '', chatId, success: false, error: 'Bot not initialized' };
    }

    // Handle typing indicators
    if (type === 'typing_on') {
      try {
        await bot.api.sendChatAction(chatId, 'typing');
      } catch (err) {
        log.warn({ err }, 'Failed to send typing action');
      }
      return { messageId: '', chatId, success: true };
    }

    if (type === 'typing_off') {
      // Telegram handles this automatically
      return { messageId: '', chatId, success: true };
    }

    // Skip empty messages only if there's no media to send
    if ((!content || content.trim() === '') && !mediaUrl) {
      log.debug({ chatId }, 'Skipping empty message (no content and no media)');
      return { messageId: '', chatId, success: true };
    }

    try {
      let sentMessageId: number;

      // Check for data URL first (base64 encoded)
      if (mediaUrl && mediaUrl.startsWith('data:')) {
        log.info({ chatId, mediaType, contentLength: content.length, dataUrlLength: mediaUrl.length }, 'Sending media as data URL');
        // Handle data URL (base64 encoded media)
        const dataUrlMatch = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!dataUrlMatch) {
          log.error({ chatId }, 'Invalid data URL format');
          return { messageId: '', chatId, success: false, error: 'Invalid data URL format' };
        }
        const mimeType = dataUrlMatch[1];
        const base64Data = dataUrlMatch[2];
        const buffer = Buffer.from(base64Data, 'base64');
        log.debug({ chatId, mimeType, bufferSize: buffer.length }, 'Decoded base64 media');
        const file = new InputFile(buffer);

        // Use smart caption splitting for data URL media
        const { caption, followUpText } = content ? splitTelegramCaption(content) : { caption: '', followUpText: undefined };
        const htmlCaption = caption ? renderTelegramHtmlText(caption) : undefined;
        
        const sendOptions: any = {
          parse_mode: 'HTML',
          caption: htmlCaption,
        };
        if (threadId) sendOptions.message_thread_id = parseInt(threadId, 10);
        if (replyToMessageId) sendOptions.reply_to_message_id = parseInt(replyToMessageId, 10);
        if (silent) sendOptions.disable_notification = true;

        log.debug({ chatId, mediaType: mimeType, method: 'sendPhoto/sendDocument' }, 'Calling Telegram API');

        // Determine media type from mime type
        const mediaCategory = getMediaCategory(mimeType);
        let apiResult;
        switch (mediaCategory) {
          case 'image':
            apiResult = await bot.api.sendPhoto(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendPhoto response');
            sentMessageId = apiResult.message_id;
            break;
          case 'video':
            apiResult = await bot.api.sendVideo(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendVideo response');
            sentMessageId = apiResult.message_id;
            break;
          case 'audio':
            apiResult = await bot.api.sendAudio(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendAudio response');
            sentMessageId = apiResult.message_id;
            break;
          default:
            apiResult = await bot.api.sendDocument(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendDocument response');
            sentMessageId = apiResult.message_id;
        }

        // Send follow-up text if caption was split
        if (followUpText) {
          const followHtml = renderTelegramHtmlText(followUpText);
          const followOptions: any = { parse_mode: 'HTML' };
          if (threadId) followOptions.message_thread_id = parseInt(threadId, 10);
          followOptions.reply_to_message_id = sentMessageId;
          if (silent) followOptions.disable_notification = true;
          
          const followResult = await bot.api.sendMessage(chatId, followHtml, followOptions);
          sentMessageCache.record(chatId, followResult.message_id);
          log.info({ chatId, followUpLength: followUpText.length }, 'Sent follow-up text after media');
        }
      } else if (mediaUrl) {
        log.info({ chatId, mediaType, mediaUrl: mediaUrl.substring(0, 100), hasContent: !!content }, 'Sending media from URL');
        // Handle regular URL
        const response = await fetch(mediaUrl);
        if (!response.ok) {
          log.error({ chatId, status: response.status }, 'Failed to fetch media');
          throw new Error(`Failed to fetch media: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        log.debug({ chatId, bufferSize: buffer.byteLength }, 'Fetched media from URL');
        const file = new InputFile(Buffer.from(buffer));

        // Use smart caption splitting for media URL
        const { caption, followUpText } = content ? splitTelegramCaption(content) : { caption: '', followUpText: undefined };
        const htmlCaption = caption ? renderTelegramHtmlText(caption) : undefined;
        
        const sendOptions: any = {
          parse_mode: 'HTML',
          caption: htmlCaption,
        };
        if (threadId) sendOptions.message_thread_id = parseInt(threadId, 10);
        if (replyToMessageId) sendOptions.reply_to_message_id = parseInt(replyToMessageId, 10);
        if (silent) sendOptions.disable_notification = true;

        log.debug({ chatId, mediaType, method: 'sendPhoto/sendVideo/sendDocument' }, 'Calling Telegram API');

        let apiResult;
        switch (mediaType) {
          case 'photo':
            apiResult = await bot.api.sendPhoto(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendPhoto response');
            break;
          case 'video':
            apiResult = await bot.api.sendVideo(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendVideo response');
            break;
          case 'audio':
            apiResult = await bot.api.sendAudio(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendAudio response');
            break;
          default:
            apiResult = await bot.api.sendDocument(chatId, file, sendOptions);
            log.info({ chatId, messageId: apiResult?.message_id, ok: apiResult?.ok }, 'Telegram sendDocument response');
        }

        // Send follow-up text if caption was split
        if (followUpText) {
          const followHtml = renderTelegramHtmlText(followUpText);
          const followOptions: any = { parse_mode: 'HTML' };
          if (threadId) followOptions.message_thread_id = parseInt(threadId, 10);
          followOptions.reply_to_message_id = apiResult.message_id;
          if (silent) followOptions.disable_notification = true;
          
          await bot.api.sendMessage(chatId, followHtml, followOptions);
          log.info({ chatId, followUpLength: followUpText.length }, 'Sent follow-up text after media');
        }

        // Validate API response
        if (!apiResult || !apiResult.ok) {
          log.error({ chatId, apiResult }, 'Telegram API returned error');
          return { messageId: '', chatId, success: false, error: `Telegram API error: ${JSON.stringify(apiResult)}` };
        }
        if (!apiResult.message_id) {
          log.error({ chatId, apiResult }, 'Telegram API response missing message_id');
          return { messageId: '', chatId, success: false, error: 'Telegram API response missing message_id' };
        }
        sentMessageId = apiResult.message_id;
      } else if (options.tts && this.config?.tts && isTTSAvailable(this.config.tts)) {
        // TTS: Generate voice message
        log.info({ chatId, contentLength: content?.length }, 'Generating TTS voice message');

        let ttsErrorOccurred = false;
        const maxRetries = TTS_MAX_RETRIES;
        
        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
          try {
            const ttsResult = await speak(content || '', this.config.tts);

            // Compress audio if it's wav format (to reduce file size for Telegram)
            const { buffer: compressedAudio, format: compressedFormat } = await compressAudio(
              Buffer.from(ttsResult.audio),
              ttsResult.format
            );

            const file = new InputFile(compressedAudio, `voice.${compressedFormat}`);

            const sendOptions: any = {};
            if (threadId) sendOptions.message_thread_id = parseInt(threadId, 10);
            if (replyToMessageId) sendOptions.reply_to_message_id = parseInt(replyToMessageId, 10);
            if (silent) sendOptions.disable_notification = true;

            // Use sendVoice for opus, sendAudio for other formats
            if (compressedFormat === 'opus') {
              sentMessageId = (await bot.api.sendVoice(chatId, file, sendOptions)).message_id;
            } else {
              sentMessageId = (await bot.api.sendAudio(chatId, file, sendOptions)).message_id;
            }
            log.info({ chatId, messageId: sentMessageId, provider: ttsResult.provider, format: compressedFormat, attempt }, 'TTS voice message sent');
            break; // Success, exit retry loop
            
          } catch (ttsError) {
            const errorMsg = ttsError instanceof Error ? ttsError.message : String(ttsError);
            
            if (attempt <= maxRetries) {
              log.warn({ 
                error: errorMsg, 
                attempt, 
                maxRetries,
                textLength: content?.length 
              }, `TTS generation failed (attempt ${attempt}/${maxRetries + 1}), retrying...`);
              ttsErrorOccurred = true;
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, attempt * TTS_RETRY_DELAY_MS));
            } else {
              log.error({ 
                error: errorMsg, 
                attempt,
                textLength: content?.length,
                provider: this.config.tts.provider
              }, 'TTS generation failed after all retries, falling back to text');
              ttsErrorOccurred = true;
            }
          }
        }
        
        // Fallback to text message if all TTS attempts failed
        if (ttsErrorOccurred && !sentMessageId) {
          // Use IR-based chunking for better structure preservation
          const chunks = markdownToTelegramChunks(content || '', MESSAGE_CHUNK_SIZE);
          
          const sendOptions: any = { parse_mode: 'HTML' };
          if (threadId) sendOptions.message_thread_id = parseInt(threadId, 10);
          if (replyToMessageId) sendOptions.reply_to_message_id = parseInt(replyToMessageId, 10);
          if (silent) sendOptions.disable_notification = true;

          // Send first chunk with retry
          const retryRunner = createRetryRunner({
            attempts: 3,
            minDelayMs: 300,
            shouldRetry: (err) => isRecoverableNetworkError(err, 'send'),
          });

          sentMessageId = await retryRunner(async () => {
            const result = await bot.api.sendMessage(chatId, chunks[0].html, sendOptions);
            return result.message_id;
          }, 'tts-fallback-send').catch(async (htmlErr) => {
            // Fallback to plain text on HTML parse error
            if (isTelegramHtmlParseError(htmlErr)) {
              const plainResult = await bot.api.sendMessage(chatId, chunks[0].text, {
                reply_to_message_id: replyToMessageId ? parseInt(replyToMessageId, 10) : undefined,
              });
              return plainResult.message_id;
            }
            throw htmlErr;
          });
          
          // Send remaining chunks
          for (let i = 1; i < chunks.length; i++) {
            const replyOptions: any = { 
              parse_mode: 'HTML',
              reply_to_message_id: sentMessageId 
            };
            if (threadId) replyOptions.message_thread_id = parseInt(threadId, 10);
            if (silent) replyOptions.disable_notification = true;
            
            await retryRunner(() => bot.api.sendMessage(chatId, chunks[i].html, replyOptions), `tts-fallback-reply-${i}`);
          }
          
          log.info({ chatId, chunks: chunks.length }, 'Fallback text message sent');
        }
      } else {
        // Split long messages into chunks using IR-based chunking (Telegram limit: 4096 chars)
        const chunks = markdownToTelegramChunks(content || '', MESSAGE_CHUNK_SIZE);

        // Create retry runner for this send operation
        const retryRunner = createRetryRunner({
          attempts: 3,
          minDelayMs: 300,
          maxDelayMs: 5000,
          shouldRetry: (err) => isRecoverableNetworkError(err, 'send'),
        });

        // Send first chunk
        const sendFirstChunk = async (): Promise<number> => {
          const sendOptions: any = { parse_mode: 'HTML' };
          if (threadId) sendOptions.message_thread_id = parseInt(threadId, 10);
          if (replyToMessageId) sendOptions.reply_to_message_id = parseInt(replyToMessageId, 10);
          if (silent) sendOptions.disable_notification = true;

          return await retryRunner(async () => {
            const result = await bot.api.sendMessage(chatId, chunks[0].html, sendOptions);
            return result.message_id;
          }, 'sendMessage').catch(async (htmlErr) => {
            // Check if it's an HTML parse error
            if (!isTelegramHtmlParseError(htmlErr)) {
              throw htmlErr;
            }
            
            // Fallback to plain text
            log.warn({ chatId, err: htmlErr }, 'HTML parse error, retrying with plain text');
            const plainSendOptions: any = {};
            if (threadId) plainSendOptions.message_thread_id = parseInt(threadId, 10);
            if (replyToMessageId) plainSendOptions.reply_to_message_id = parseInt(replyToMessageId, 10);
            if (silent) plainSendOptions.disable_notification = true;

            return await retryRunner(async () => {
              const result = await bot.api.sendMessage(chatId, chunks[0].text, plainSendOptions);
              return result.message_id;
            }, 'sendMessage-plain');
          });
        };

        sentMessageId = await sendFirstChunk();

        // Send remaining chunks as replies
        for (let i = 1; i < chunks.length; i++) {
          const replyOptions: any = {
            parse_mode: 'HTML',
            reply_to_message_id: sentMessageId
          };
          if (threadId) replyOptions.message_thread_id = parseInt(threadId, 10);
          if (silent) replyOptions.disable_notification = true;

          await retryRunner(async () => {
            await bot.api.sendMessage(chatId, chunks[i].html, replyOptions);
          }, `sendMessage-reply-${i}`);
        }
      }

      // Record sent message in cache
      if (sentMessageId) {
        sentMessageCache.record(chatId, sentMessageId);
      }

      return { messageId: String(sentMessageId), chatId, success: true };
    } catch (err) {
      log.error({ accountId, chatId, err, mediaUrl: !!mediaUrl, mediaType }, 'Failed to send message - caught error');
      return { messageId: '', chatId, success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  startStream(options: ChannelSendStreamOptions): ReturnType<ChannelExtension['startStream']> {
    const { chatId, accountId = 'default', threadId, replyToMessageId, parseMode = 'HTML' } = options;

    const bot = this.accountManager.getBot(accountId);
    if (!bot) throw new Error('Bot not initialized');

    const streamKey = `${accountId}:${chatId}:${threadId || 'dm'}`;
    const draftStream = draftStreamManager.getOrCreate(streamKey, {
      api: bot.api,
      chatId,
      threadId: threadId ? parseInt(threadId, 10) : undefined,
      replyToMessageId: replyToMessageId ? parseInt(replyToMessageId, 10) : undefined,
      parseMode: parseMode === 'HTML' ? 'HTML' : 'Markdown',
      enableProgress: true, // Enable progress indicator
    });

    return {
      update: (text: string) => {
        // Convert Markdown to Telegram HTML before passing to draft stream.
        // The draft stream is configured with parseMode='HTML', so it expects
        // pre-converted HTML, not raw Markdown.
        const html = renderTelegramHtmlText(text);
        draftStream.update(html);
      },
      /** Update stream with progress stage indicator */
      updateProgress: (text: string, stage: ProgressStage, detail?: string) => {
        const html = renderTelegramHtmlText(text);
        draftStream.updateWithProgress(html, stage, detail);
      },
      /** Set progress stage without updating text */
      setProgress: (stage: ProgressStage, detail?: string) => {
        draftStream.setProgress(stage, detail);
      },
      end: async () => {
        // Clear progress indicator before ending
        draftStream.setProgress('idle');
        await draftStream.flush();
        await draftStreamManager.stop(streamKey);
      },
      abort: async () => {
        await draftStream.clear();
        await draftStreamManager.stop(streamKey);
      },
      messageId: () => draftStream.messageId(),
    };
  }

  getStatus(accountId?: string): ChannelStatus {
    if (accountId) {
      return this.accountManager.getStatus(accountId) ?? { accountId, running: false, mode: 'stopped' };
    }

    const allStatuses = this.accountManager.getAllAccounts().map((acc) => this.accountManager.getStatus(acc.accountId));
    const anyRunning = allStatuses.some((s) => s?.running);
    return { accountId: 'all', running: anyRunning, mode: anyRunning ? 'polling' : 'stopped' };
  }

  // ========== Session Model Management ==========

  private sessionModels = new Map<string, string>();

  getSessionModel(sessionKey: string): string | undefined {
    return this.sessionModels.get(sessionKey);
  }

  setSessionModel(sessionKey: string, modelId: string): void {
    this.sessionModels.set(sessionKey, modelId);
    log.info({ sessionKey, modelId }, 'Session model set');
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    for (const account of this.accountManager.getAllAccounts()) {
      const bot = this.accountManager.getBot(account.accountId);
      if (!bot) continue;

      try {
        await bot.api.getMe();
      } catch (err) {
        return { success: false, error: `Account ${account.accountId}: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    return { success: true };
  }
}

export const telegramExtension = new TelegramChannelExtension();
