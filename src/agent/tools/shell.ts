import { Tool } from './base.js';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';

const sleep = promisify(setTimeout);

export class ExecTool extends Tool {
  name = 'shell';
  description = 'Execute a shell command and return the output.';
  
  parameters = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in seconds (default: 60)',
      },
      workdir: {
        type: 'string',
        description: 'Working directory for the command',
      },
    },
    required: ['command'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const { command, timeout = 60, workdir } = params as { command: string; timeout?: number; workdir?: string };
    
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const startTime = Date.now();
      
      const proc = spawn(command, {
        shell: '/bin/bash',
        cwd: workdir || process.cwd(),
        env: { ...process.env },
      });

      proc.stdout.on('data', (data: Buffer) => chunks.push(data));
      proc.stderr.on('data', (data: Buffer) => chunks.push(data));

      proc.on('close', (code) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const output = Buffer.concat(chunks).toString('utf-8').trim();
        
        if (code === 0) {
          resolve(output ? `Command executed in ${elapsed}s:\n${output}` : `Command executed successfully in ${elapsed}s`);
        } else {
          resolve(`Command failed (exit code ${code}) after ${elapsed}s:\n${output || '(no output)'}`);
        }
      });

      proc.on('error', (error) => {
        resolve(`Error executing command: ${error.message}`);
      });

      // Timeout handler
      const timeoutMs = timeout * 1000;
      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve(`Command timed out after ${timeout}s`);
      }, timeoutMs);

      proc.on('close', () => clearTimeout(timeoutId));
    });
  }
}
