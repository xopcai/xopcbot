import type { ProgressState, GatewayClientConfig } from './types.js';
import { apiUrl, authHeaders } from './helpers.js';

/** Must match ChatPanel resume lookup — same string as JSON `chatId` on /api/agent. */
export function pendingAgentRunStorageKey(chatId: string): string {
  return `xopcbot:pendingAgentRun:${chatId}`;
}

export type MessagingCallbacks = {
  /** First SSE event includes `runId` for POST /api/agent/resume after reconnect. */
  onStreamStart: (runId?: string) => void;
  onToken: (delta: string) => void;
  onThinking: (content: string, isDelta: boolean) => void;
  onThinkingEnd: () => void;
  onToolStart: (toolName: string, args?: unknown) => void;
  onToolEnd: (toolName: string, isError: boolean, result?: string) => void;
  onProgress: (progress: ProgressState) => void;
  onResult: () => void;
  onError: (msg: string) => void;
};

export class MessageSender {
  private _abort?: AbortController;
  /** chatId for the in-flight POST /api/agent or /api/agent/resume body (pending run storage). */
  private _sseChatId?: string;

  constructor(private _config: GatewayClientConfig) {}

  get isSending() {
    return !!this._abort;
  }

  async send(
    content: string,
    chatId: string,
    attachments?: Array<{ type: string; mimeType?: string; data?: string; name?: string; size?: number }>,
    thinkingLevel?: string,
    callbacks?: MessagingCallbacks,
  ): Promise<void> {
    this._abort = new AbortController();
    this._sseChatId = chatId;
    try {
      const res = await fetch(apiUrl('/api/agent'), {
        method: 'POST',
        headers: { ...authHeaders(this._config.token), Accept: 'text/event-stream' },
        body: JSON.stringify({ message: content, channel: 'webchat', chatId, attachments, thinking: thinkingLevel }),
        signal: this._abort.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || `HTTP ${res.status}`);
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const ct = res.headers.get('Content-Type') || '';
      if (ct.includes('text/event-stream') && res.body) {
        await this._consumeSSE(res.body, callbacks);
      } else {
        const json = await res.json();
        if (json.ok && json.payload?.content) {
          callbacks?.onToken(json.payload.content);
          this._clearPendingRunStorage();
          callbacks?.onResult();
        }
      }
    } finally {
      this._sseChatId = undefined;
      this._abort = undefined;
    }
  }

  /**
   * Re-attach to an in-flight agent run (replay buffered events + live tail).
   * POST /api/agent/resume — same SSE shape as POST /api/agent.
   */
  async resume(
    runId: string,
    chatId: string,
    callbacks?: MessagingCallbacks,
  ): Promise<void> {
    this._abort = new AbortController();
    this._sseChatId = chatId;
    try {
      const res = await fetch(apiUrl('/api/agent/resume'), {
        method: 'POST',
        headers: { ...authHeaders(this._config.token), Accept: 'text/event-stream' },
        body: JSON.stringify({ runId, chatId }),
        signal: this._abort.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(
          (body as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`,
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const ct = res.headers.get('Content-Type') || '';
      if (ct.includes('text/event-stream') && res.body) {
        await this._consumeSSE(res.body, callbacks);
      }
    } finally {
      this._sseChatId = undefined;
      this._abort = undefined;
    }
  }

  abort(): void {
    this._abort?.abort();
    this._abort = undefined;
  }

  private async _consumeSSE(body: ReadableStream<Uint8Array>, callbacks?: MessagingCallbacks): Promise<void> {
    const reader = body
      .pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>)
      .getReader();
    let buf = '';
    let evtType = '';
    let evtData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;

        while (buf.includes('\n')) {
          const idx = buf.indexOf('\n');
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          line = line.replace(/\r$/, '');

          if (line.startsWith('event:')) {
            evtData = '';
            evtType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const payload = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
            evtData += (evtData ? '\n' : '') + payload;
          } else if (line === '' && evtData) {
            this._dispatchSSE(evtType || 'message', evtData, callbacks);
            evtType = '';
            evtData = '';
          }
        }
      }
      if (evtData) this._dispatchSSE(evtType || 'message', evtData, callbacks);
    } finally {
      reader.releaseLock();
    }
  }

  private _dispatchSSE(event: string, data: string, cb?: MessagingCallbacks): void {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    // Persist runId using the same chatId as the request body (not ChatPanel state).
    // Also handle payloads where SSE event name is `message` but JSON has type/status + runId.
    if (
      this._sseChatId &&
      parsed &&
      typeof parsed === 'object' &&
      parsed.type === 'status' &&
      typeof parsed.runId === 'string'
    ) {
      try {
        sessionStorage.setItem(
          pendingAgentRunStorageKey(this._sseChatId),
          JSON.stringify({ runId: parsed.runId }),
        );
      } catch {
        /* ignore quota / private mode */
      }
    }

    switch (event) {
      case 'status':
        cb?.onStreamStart(typeof parsed.runId === 'string' ? parsed.runId : undefined);
        break;
      case 'token': {
        const chunk =
          typeof parsed.content === 'string'
            ? parsed.content
            : typeof parsed.delta === 'string'
              ? parsed.delta
              : typeof parsed.text === 'string'
                ? parsed.text
                : '';
        if (chunk) cb?.onToken(chunk);
        break;
      }
      case 'thinking':
        if (parsed.status === 'started') {
          cb?.onThinking('', false);
          break;
        }
        cb?.onThinking(parsed.content || '', Boolean(parsed.delta));
        break;
      case 'thinking_end':
        cb?.onThinkingEnd();
        break;
      case 'message_end':
        cb?.onThinkingEnd();
        break;
      case 'tool_start':
        cb?.onToolStart(parsed.toolName || 'unknown', parsed.args);
        break;
      case 'tool_end':
        cb?.onToolEnd(parsed.toolName, !!parsed.isError, parsed.result);
        break;
      case 'progress':
        cb?.onProgress({
          stage: parsed.stage || 'thinking',
          message: parsed.message || '',
          detail: parsed.detail,
          toolName: parsed.toolName,
          timestamp: Date.now(),
        });
        break;
      case 'result':
        this._clearPendingRunStorage();
        cb?.onResult();
        break;
      case 'error':
        this._clearPendingRunStorage();
        cb?.onError(parsed.content || parsed.error?.message || 'Send failed');
        break;
      default: {
        const chunk =
          typeof parsed.content === 'string'
            ? parsed.content
            : typeof parsed.delta === 'string'
              ? parsed.delta
              : typeof parsed.text === 'string'
                ? parsed.text
                : '';
        if (chunk) cb?.onToken(chunk);
        break;
      }
    }
  }

  private _clearPendingRunStorage(): void {
    if (!this._sseChatId) return;
    try {
      sessionStorage.removeItem(pendingAgentRunStorageKey(this._sseChatId));
    } catch {
      /* ignore */
    }
  }
}
