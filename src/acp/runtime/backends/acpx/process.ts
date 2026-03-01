/**
 * Acpx Process Management
 *
 * Utilities for spawning and managing acpx processes.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { AcpRuntimeError } from '../../errors.js';

export type SpawnResult = {
  child: ChildProcess;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
};

export type ExitResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
};

export function spawnWithResolvedCommand(params: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}): SpawnResult {
  const child = spawn(params.command, params.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: params.cwd,
    env: { ...process.env, ...params.env },
  });

  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error('Failed to create acpx stdio pipes');
  }

  return {
    child,
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
  };
}

export async function spawnAndCollect(params: {
  command: string;
  args: string[];
  cwd: string;
  input?: string;
  timeoutMs?: number;
}): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}> {
  return new Promise((resolve, reject) => {
    const { child, stdin, stdout, stderr } = spawnWithResolvedCommand({
      command: params.command,
      args: params.args,
      cwd: params.cwd,
    });

    let stdoutData = '';
    let stderrData = '';
    let timeoutId: NodeJS.Timeout | undefined;

    stdout.on('data', (chunk) => {
      stdoutData += String(chunk);
    });

    stderr.on('data', (chunk) => {
      stderrData += String(chunk);
    });

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ code: null, stdout: stdoutData, stderr: stderrData, error });
    });

    child.on('close', (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ code, stdout: stdoutData, stderr: stderrData });
    });

    if (params.timeoutMs && params.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
      }, params.timeoutMs);
    }

    if (params.input) {
      stdin.write(params.input);
      stdin.end();
    } else {
      stdin.end();
    }
  });
}

export async function waitForExit(child: ChildProcess): Promise<ExitResult> {
  return new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({ code: null, signal: null, error });
    });

    child.on('close', (code, signal) => {
      resolve({ code, signal });
    });
  });
}

export type SpawnFailure = 'missing-command' | 'missing-cwd' | 'other';

export function resolveSpawnFailure(error: Error, cwd: string): SpawnFailure {
  const message = error.message.toLowerCase();

  if (message.includes('enoent') || message.includes('no such file')) {
    // Check if it's the command or the cwd
    if (message.includes(cwd.toLowerCase())) {
      return 'missing-cwd';
    }
    return 'missing-command';
  }

  return 'other';
}
