import { createServer, type Socket } from 'node:net';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger } from '../../utils/logger.js';
import type { AgentIPCMessage } from './types.js';

const log = createLogger('AgentIpcSocket');

const isUnix = process.platform !== 'win32';

/**
 * Unix domain socket server for low-latency IPC (non-Windows).
 */
export class AgentIpcSocketServer {
  private server: ReturnType<typeof createServer> | null = null;

  constructor(
    private readonly socketPath: string,
    private readonly onMessage: (msg: AgentIPCMessage) => Promise<void>,
  ) {}

  async listen(): Promise<void> {
    if (!isUnix) {
      log.debug('IPC socket skipped on Windows');
      return;
    }
    mkdirSync(dirname(this.socketPath), { recursive: true });
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
        // ignore
      }
    }
    this.server = createServer((sock: Socket) => {
      let buf = '';
      sock.setEncoding('utf8');
      sock.on('data', (chunk: string) => {
        buf += chunk;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as AgentIPCMessage;
            void this.onMessage(msg);
          } catch (e) {
            log.warn({ err: e }, 'Invalid IPC line');
          }
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.socketPath, () => resolve());
      this.server!.on('error', reject);
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
    if (isUnix && existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
        // ignore
      }
    }
  }
}

export function sendViaSocket(socketPath: string, message: AgentIPCMessage): Promise<void> {
  if (!isUnix || !existsSync(socketPath)) {
    return Promise.resolve();
  }
  return import('node:net').then(
    ({ createConnection }) =>
      new Promise<void>((resolve, reject) => {
        const sock = createConnection(socketPath);
        sock.setEncoding('utf8');
        sock.write(`${JSON.stringify(message)}\n`, (err) => {
          sock.end();
          if (err) reject(err);
          else resolve();
        });
      }),
  );
}
