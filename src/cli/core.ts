import { Command } from 'commander';

export function createCLI() {
  const program = new Command();

  program
    .name('xopcbot')
    .description('Ultra-Lightweight Personal AI Assistant')
    .version('0.1.0')
    .option('--config <path>', 'Config file path')
    .option('--workspace <path>', 'Workspace directory');

  return program;
}
