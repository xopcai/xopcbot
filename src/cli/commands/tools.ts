import { Command } from 'commander';
import { existsSync, mkdirSync, symlinkSync, readlinkSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolveToolsDir, resolveBinDir } from '../../config/paths.js';
import { register, type CLIContext } from '../registry.js';

function createToolsCommand(_ctx: CLIContext): Command {
  const root = new Command('tools').description('Toolchain paths (Node shim placeholders)');

  root
    .command('list')
    .description('Show managed tool directories')
    .action(() => {
      console.log(`tools: ${resolveToolsDir()}`);
      console.log(`bin:   ${resolveBinDir()}`);
    });

  root
    .command('use <name>')
    .description('Record current tool alias (e.g. node@22) — creates stub marker')
    .action((name: string) => {
      const dir = resolveToolsDir();
      mkdirSync(dir, { recursive: true });
      const marker = join(dir, 'current.txt');
      writeFileSync(marker, `${name}\n`);
      console.log(`Marked active toolchain as "${name}" at ${marker}`);
    });

  root
    .command('link-cli [target]')
    .description('Symlink xopcbot into ~/.xopcbot/bin (optional target path)')
    .action((target?: string) => {
      const bin = resolveBinDir();
      mkdirSync(bin, { recursive: true });
      const link = join(bin, 'xopcbot');
      const dest = target || process.execPath;
      if (existsSync(link)) {
        try {
          rmSync(link);
        } catch {
          // ignore
        }
      }
      symlinkSync(dest, link);
      console.log(`${link} -> ${readlinkSync(link)}`);
      console.log('Add to PATH: export PATH="$HOME/.xopcbot/bin:$PATH"');
    });

  return root;
}

register({
  id: 'tools',
  name: 'tools',
  description: 'Toolchain directory helpers',
  factory: createToolsCommand,
  metadata: { category: 'utility' },
});
