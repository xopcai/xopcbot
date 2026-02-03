import { Tool } from './base.js';
import { spawn } from 'child_process';

export class ExecTool extends Tool {
  readonly name = 'shell';
  readonly description = 'Execute a shell command and return the output.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 60)' },
      workdir: { type: 'string', description: 'Working directory' },
    },
    required: ['command'],
  };

  constructor(private workingDir?: string) { super(); }

  async execute(params: Record<string, unknown>): Promise<string> {
    const command = String(params.command);
    const timeout = Number(params.timeout) || 60;
    const workdir = params.workdir ? String(params.workdir) : this.workingDir;
    
    return new Promise(resolve => {
      const chunks: Buffer[] = [];
      const startTime = Date.now();
      const proc = spawn(command, { shell: '/bin/bash', cwd: workdir || process.cwd(), env: process.env });
      
      proc.stdout.on('data', (d: Buffer) => chunks.push(d));
      proc.stderr.on('data', (d: Buffer) => chunks.push(d));
      
      proc.on('close', (code) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const output = Buffer.concat(chunks).toString('utf-8').trim();
        if (code === 0) {
          resolve(output ? `Command executed in ${elapsed}s:\n${output}` : `Success`);
        } else {
          resolve(`Command failed (exit code ${code}) after ${elapsed}s:\n${output || 'no output'}`);
        }
      });
      
      proc.on('error', (error) => resolve(`Error: ${error.message}`));
      setTimeout(() => { proc.kill('SIGTERM'); resolve(`Timeout after ${timeout}s`); }, timeout * 1000);
    });
  }
}
