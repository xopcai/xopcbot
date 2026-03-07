/**
 * Channels Module
 *
 * Exports all channel implementations.
 *
 * Structure:
 * - telegram/: Telegram channel implementation
 * - format.ts: Markdown to Telegram HTML formatting (OpenClaw-based)
 */

export * from './types.js';
export { telegramExtension } from './telegram/extension.js';
export { TelegramClient } from './telegram/client.js';
export { createTelegramCommandHandler } from './telegram/command-handler.js';
export { TelegramInlineKeyboards } from './telegram/inline-keyboards.js';
export { startTelegramWebhook, validateWebhookSecret } from './telegram/webhook.js';
export * from './typing-controller.js';
export * from './access-control.js';
export * from './update-offset-store.js';
export * from './draft-stream.js';

// Format utilities - Telegram specific (based on OpenClaw implementation)
// For other channels, use the generic markdown processing in src/markdown/
export * from './format.js';

export { ChannelManager } from './manager.js';
