import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export function ensureDir(path: string): void {
  if (!existsSync(dirname(path))) {
    mkdirSync(dirname(path), { recursive: true });
  }
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_');
}

export function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function getWorkspacePath(customPath?: string): string {
  if (customPath) {
    return customPath.replace(/^~/, require('os').homedir());
  }
  return join(require('os').homedir(), '.xopcbot', 'workspace');
}
