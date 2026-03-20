import { existsSync } from 'fs';
import { join } from 'path';
import { resolveExtensionsDir } from '../config/paths.js';
import { readLockfile } from './lockfile.js';

export interface ExtensionHealthReport {
  id: string;
  ok: boolean;
  detail?: string;
}

/**
 * Best-effort checks: lockfile presence and package.json per locked extension.
 */
export function runExtensionHealth(): ExtensionHealthReport[] {
  const lock = readLockfile();
  const root = resolveExtensionsDir();
  const reports: ExtensionHealthReport[] = [];
  for (const id of Object.keys(lock.extensions)) {
    const pkg = join(root, id, 'package.json');
    if (existsSync(pkg)) {
      reports.push({ id, ok: true });
    } else {
      reports.push({ id, ok: false, detail: 'package.json missing' });
    }
  }
  return reports;
}
