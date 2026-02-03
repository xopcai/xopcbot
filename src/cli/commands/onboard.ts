import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, ConfigSchema } from '../../config/index.js';

export function createOnboardCommand(): Command {
  const cmd = new Command('onboard')
    .description('Initialize xopcbot configuration and workspace')
    .action(async () => {
      console.log('🧙 Starting xopcbot onboarding...\n');

      const configPath = join(homedir(), '.xopcbot', 'config.json');

      // Create config
      if (existsSync(configPath)) {
        console.log(`⚠️  Config already exists at ${configPath}`);
        const overwrite = process.env.OVERWRITE_CONFIG === 'true' || 
          process.argv.includes('--overwrite');
        
        if (!overwrite) {
          console.log('Skipping config creation.\n');
        } else {
          const config = ConfigSchema.parse({});
          saveConfig(config, configPath);
          console.log('✅  Created default config');
        }
      } else {
        const config = ConfigSchema.parse({});
        saveConfig(config, configPath);
        console.log('✅  Created config at', configPath);
      }

      // Create workspace
      const workspacePath = join(homedir(), '.xopcbot', 'workspace');
      if (!existsSync(workspacePath)) {
        mkdirSync(workspacePath, { recursive: true });
        console.log('✅  Created workspace at', workspacePath);
      } else {
        console.log('⚠️  Workspace already exists at', workspacePath);
      }

      // Create default bootstrap files
      createBootstrapFiles(workspacePath);

      console.log('\n🎉  xopcbot is ready!');
      console.log('\nNext steps:');
      console.log('  1. Add your API key to ~/.xopcbot/config.json');
      console.log('     Get one at: https://openrouter.ai/keys');
      console.log('  2. Chat: xopcbot agent -m "Hello!"');
      console.log('\nWant Telegram/WhatsApp? See: https://github.com/your-repo');
    });

  return cmd;
}

function createBootstrapFiles(workspace: string): void {
  const files: Record<string, string> = {
    'AGENTS.md': `# Agent Instructions

You are a helpful AI assistant. Be concise, accurate, and friendly.

## Guidelines

- Always explain what you're doing before taking actions
- Ask for clarification when the request is ambiguous
- Use tools to help accomplish tasks
- Remember important information in your memory files
`,
    'SOUL.md': `# Soul

I am xopcbot, a lightweight AI assistant.

## Personality

- Helpful and friendly
- Concise and to the point
- Curious and eager to learn
`,
    'USER.md': `# User

*Learn about the person you're helping. Update this as you go.*

## Context

*(What do they care about? What projects are they working on?)*
`,
    'TOOLS.md': `# Tools

*Local notes for your setup.*

## What Goes Here

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Device nicknames

---
`,
  };

  const memoryDir = join(workspace, 'memory');
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }

  for (const [filename, content] of Object.entries(files)) {
    const path = join(workspace, filename);
    if (!existsSync(path)) {
      writeFileSync(path, content, 'utf-8');
      console.log('✅  Created', filename);
    }
  }

  // Create MEMORY.md
  const memoryPath = join(workspace, 'memory', 'MEMORY.md');
  if (!existsSync(memoryPath)) {
    writeFileSync(memoryPath, '# Long-term Memory\n\n*Add important memories here.*\n', 'utf-8');
    console.log('✅  Created memory/MEMORY.md');
  }
}
