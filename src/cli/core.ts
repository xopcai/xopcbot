import { Command } from 'commander';
import { version, name, description } from '../package.json' with { type: 'json' };

export function createCLI() {
  const program = new Command();

  program
    .name(name)
    .description(description)
    .version(version)
    .option('--config <path>', 'Config file path')
    .option('--workspace <path>', 'Workspace directory');

  return program;
}
