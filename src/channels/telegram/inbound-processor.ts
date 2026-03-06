/**
 * Telegram Inbound Processor
 *
 * Handles inbound message processing from Telegram:
 * - Message queuing (per chat)
 * - Deduplication
 * - Access control
 * - Media download
 * - STT transcription
 * - Event publishing to bus
 */

import type { Context } from 'grammy';
import type { Config } from '../../config/schema.js';
import type { MessageBus } from '../../bus/index.js';
import type { TelegramAccountManager } from './account-manager.js';
import { telegramUpdateDedupe, buildTelegramUpdateKey } from './dedupe.js';
import {
  normalizeAllowFromWithStore,
  evaluateGroupBaseAccess,
  resolveRequireMention,
  hasBotMention,
  removeBotMention,
} from '../access-control.js';
import { generateSessionKey } from '../../commands/session-key.js';
import { transcribe, isSTTAvailable } from '../../stt/index.js';
import { getMimeType } from '../../utils/media.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('TelegramInboundProcessor');

/** Maximum voice message duration for STT in seconds */
const STT_MAX_VOICE_DURATION_SECONDS = 60;

export interface InboundProcessorDeps {
  bus: MessageBus;
  config: Config;
  accountManager: TelegramAccountManager;
}

interface QueuedMessage {
  ctx: Context;
  accountId: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * Create inbound message processor
 */
export function createInboundProcessor(deps: InboundProcessorDeps) {
  const { bus, config, accountManager } = deps;

  const messageQueues = new Map<string, QueuedMessage[]>();
  const processingLocks = new Map<string, Promise<void>>();

  const getChatKey = (accountId: string, chatId: string): string => `${accountId}:${chatId}`;

  const processNextMessage = async (chatKey: string): Promise<void> => {
    if (processingLocks.has(chatKey)) return;

    const queue = messageQueues.get(chatKey);
    if (!queue || queue.length === 0) return;

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
      lockResolve?.();
      processingLocks.delete(chatKey);
      if (queue.length > 0) {
        processNextMessage(chatKey);
      } else {
        messageQueues.delete(chatKey);
      }
    }
  };

  const processMessageInternal = async (ctx: Context, accountId: string) => {
    // Deduplication check
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
    const threadId = (message as { message_thread_id?: number }).message_thread_id;

    // Access control
    const effectiveAllowFrom = normalizeAllowFromWithStore({
      allowFrom: isGroup ? account.groupAllowFrom : account.allowFrom,
    });

    const baseAccess = evaluateGroupBaseAccess({
      isGroup,
      groupConfig: account.groups?.[chatId],
      topicConfig: threadId ? account.groups?.[chatId]?.topics?.[String(threadId)] : undefined,
      hasGroupAllowOverride: !!(account.groups?.[chatId]?.allowFrom ||
        (threadId && account.groups?.[chatId]?.topics?.[String(threadId)]?.allowFrom)),
      effectiveGroupAllow: effectiveAllowFrom,
      senderId,
      senderUsername,
    });

    if (!baseAccess.allowed) {
      log.debug({ accountId, chatId, reason: baseAccess.reason }, 'Message blocked by base access');
      return;
    }

    // Check mention in groups
    if (isGroup) {
      const requireMention = resolveRequireMention({
        topicConfig: threadId ? account.groups?.[chatId]?.topics?.[String(threadId)] : undefined,
        groupConfig: account.groups?.[chatId],
        defaultRequireMention: true,
      });

      if (requireMention && !hasBotMention({ botUsername, text: content, entities: message.entities })) {
        log.debug({ accountId, chatId }, 'Group message without mention ignored');
        return;
      }
    }

    const cleanContent = isGroup ? removeBotMention(content, botUsername) : content;

    // Generate session key
    const sessionKey = generateSessionKey({
      source: 'telegram',
      chatId,
      senderId,
      isGroup,
      threadId: threadId ? String(threadId) : undefined,
    });

    // Collect media
    const media: Array<{ type: string; fileId: string }> = [];
    if (message.photo?.length) {
      media.push({ type: 'photo', fileId: message.photo[message.photo.length - 1].file_id });
    }
    if (message.document) media.push({ type: 'document', fileId: message.document.file_id });
    if (message.video) media.push({ type: 'video', fileId: message.video.file_id });
    if (message.audio) media.push({ type: 'audio', fileId: message.audio.file_id });
    if (message.voice) media.push({ type: 'voice', fileId: message.voice.file_id });

    // Download media and convert to attachments
    const attachments: Array<{ type: string; mimeType: string; data: string; name?: string; size?: number }> = [];
    let transcribedText = '';
    const bot = accountManager.getBot(accountId);
    const botToken = account.token;

    if (bot && botToken && media.length > 0) {
      const accountApiRoot = account.apiRoot?.replace(/\/$/, '') || 'https://api.telegram.org';

      for (const item of media) {
        try {
          const file = await bot.api.getFile(item.fileId);
          const downloadUrl = `${accountApiRoot}/file/bot${botToken}/${file.file_path}`;
          const response = await fetch(downloadUrl);

          if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`);
          }

          const buffer = await response.arrayBuffer();

          // Handle voice messages with STT
          if (item.type === 'voice' && config?.stt && isSTTAvailable(config.stt)) {
            const voiceDuration = message.voice?.duration || 0;
            if (voiceDuration <= STT_MAX_VOICE_DURATION_SECONDS) {
              try {
                const sttResult = await transcribe(Buffer.from(buffer), config.stt, {
                  language: config.stt.provider === 'alibaba' ? 'zh' : undefined,
                });
                transcribedText = sttResult.text;
              } catch (sttError) {
                log.error({ sttError }, 'STT transcription failed');
                transcribedText = '[STT failed]';
              }
            } else {
              transcribedText = `[Voice message too long (>${STT_MAX_VOICE_DURATION_SECONDS}s)]`;
            }
          }

          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = getMimeType(item.type, file.file_path);

          attachments.push({
            type: item.type,
            mimeType,
            data: base64,
            name: file.file_path?.split('/').pop(),
            size: buffer.byteLength,
          });
        } catch (err) {
          log.error({ type: item.type, fileId: item.fileId, err }, 'Failed to download media');
        }
      }
    }

    // Combine transcribed text with content
    const finalContent = transcribedText
      ? transcribedText + (cleanContent ? '\n\n' + cleanContent : '')
      : cleanContent;

    const isCommand = cleanContent.startsWith('/');

    log.info({
      accountId,
      chatId,
      senderId,
      isGroup,
      sessionKey,
      contentLength: finalContent.length,
      attachmentCount: attachments.length,
      isCommand,
    }, 'Processing Telegram message');

    await bus.publishInbound({
      channel: 'telegram',
      sender_id: senderId,
      chat_id: chatId,
      content: finalContent,
      metadata: {
        accountId,
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

  // Main enqueue function
  return (ctx: Context, accountId: string): Promise<void> => {
    const chatId = String(ctx.chat?.id);
    const chatKey = getChatKey(accountId, chatId);

    return new Promise((resolve, reject) => {
      const queue = messageQueues.get(chatKey) || [];
      queue.push({ ctx, accountId, resolve, reject });
      messageQueues.set(chatKey, queue);
      processNextMessage(chatKey);
    });
  };
}
