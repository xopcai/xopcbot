import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveExtensionsDir } from '../config/paths.js';

export interface LockfileExtensionEntry {
  version: string;
  resolved?: string;
  integrity?: string;
  installedAt?: string;
  source?: 'npm' | 'local';
  localPath?: string;
}

export interface ExtensionsLockfile {
  version: number;
  lockfileVersion: number;
  extensions: Record<string, LockfileExtensionEntry>;
}

const DEFAULT_LOCK: ExtensionsLockfile = {
  version: 1,
  lockfileVersion: 1,
  extensions: {},
};

export function resolveLockfilePath(): string {
  return join(resolveExtensionsDir(), 'extensions-lock.json');
}

export function readLockfile(path?: string): ExtensionsLockfile {
  const p = path ?? resolveLockfilePath();
  if (!existsSync(p)) return { ...DEFAULT_LOCK, extensions: {} };
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as ExtensionsLockfile;
    if (!data.extensions) data.extensions = {};
    return data;
  } catch {
    return { ...DEFAULT_LOCK, extensions: {} };
  }
}

export function writeLockfile(lock: ExtensionsLockfile, path?: string): void {
  const p = path ?? resolveLockfilePath();
  writeFileSync(p, JSON.stringify(lock, null, 2), 'utf-8');
}

export function upsertLockEntry(
  extensionId: string,
  entry: LockfileExtensionEntry,
  path?: string,
): void {
  const lock = readLockfile(path);
  lock.extensions[extensionId] = entry;
  writeLockfile(lock, path);
}
