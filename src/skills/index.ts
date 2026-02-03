/**
 * Skills Loader for xopcbot
 * 
 * Skills are markdown files (SKILL.md) that teach the agent how to use
 * specific tools or perform certain tasks.
 * 
 * Adapted from OpenClaw skill system.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const BUILTIN_SKILLS_DIR = join(dirname(new URL(import.meta.url).pathname), 'skills');

// Skill metadata interface
export interface SkillMetadata {
  name: string;
  description: string;
  requires?: {
    bins?: string[];
    env?: string[];
  };
  install?: Array<{
    id: string;
    kind: string;
    formula?: string;
    package?: string;
    bins?: string[];
    label: string;
  }>;
  always?: boolean;
}

export interface SkillInfo {
  name: string;
  path: string;
  source: 'workspace' | 'builtin';
}

export class SkillsLoader {
  private workspace: string;
  private workspaceSkills: string;
  private builtinSkills: string;

  constructor(workspace?: string) {
    this.workspace = workspace || join(homedir(), '.xopcbot', 'workspace');
    this.workspaceSkills = join(this.workspace, 'skills');
    this.builtinSkills = BUILTIN_SKILLS_DIR;
  }

  listSkills(): SkillInfo[] {
    const skills: SkillInfo[] = [];

    // Workspace skills (highest priority)
    if (existsSync(this.workspaceSkills)) {
      try {
        const entries = readdirSync(this.workspaceSkills);
        for (const entry of entries) {
          const entryPath = join(this.workspaceSkills, entry);
          if (statSync(entryPath).isDirectory()) {
            const skillFile = join(entryPath, 'SKILL.md');
            if (existsSync(skillFile)) {
              skills.push({ name: entry, path: skillFile, source: 'workspace' });
            }
          }
        }
      } catch {
        // Directory might not exist
      }
    }

    // Built-in skills
    if (existsSync(this.builtinSkills)) {
      try {
        const entries = readdirSync(this.builtinSkills);
        for (const entry of entries) {
          const entryPath = join(this.builtinSkills, entry);
          if (statSync(entryPath).isDirectory()) {
            const skillFile = join(entryPath, 'SKILL.md');
            if (existsSync(skillFile) && !skills.find(s => s.name === entry)) {
              skills.push({ name: entry, path: skillFile, source: 'builtin' });
            }
          }
        }
      } catch {
        // Directory might not exist
      }
    }

    return skills;
  }

  loadSkill(name: string): string | null {
    // Check workspace first
    const workspaceSkill = join(this.workspaceSkills, name, 'SKILL.md');
    if (existsSync(workspaceSkill)) {
      return readFileSync(workspaceSkill, 'utf-8');
    }

    // Check built-in
    const builtinSkill = join(this.builtinSkills, name, 'SKILL.md');
    if (existsSync(builtinSkill)) {
      return readFileSync(builtinSkill, 'utf-8');
    }

    return null;
  }

  loadSkillsContent(names: string[]): string {
    const parts: string[] = [];

    for (const name of names) {
      const content = this.loadSkill(name);
      if (content) {
        const stripped = this.stripFrontmatter(content);
        parts.push(`### Skill: ${name}\n\n${stripped}`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  buildSkillsSummary(): string {
    const skills = this.listSkills();
    if (skills.length === 0) {
      return '';
    }

    const lines = ['<skills>'];
    for (const skill of skills) {
      const meta = this.getSkillMetadata(skill.name);
      const desc = meta?.description || skill.name;
      lines.push(`  <skill>`);
      lines.push(`    <name>${this.escapeXml(skill.name)}</name>`);
      lines.push(`    <description>${this.escapeXml(desc)}</description>`);
      lines.push(`    <location>${skill.path}</location>`);
      lines.push(`  </skill>`);
    }
    lines.push('</skills>');

    return lines.join('\n');
  }

  getSkillMetadata(name: string): SkillMetadata | null {
    const content = this.loadSkill(name);
    if (!content) return null;

    // Parse YAML frontmatter with nanobot metadata
    if (content.startsWith('---')) {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const frontmatter = match[1];
        const meta = this.parseFrontmatter(frontmatter);
        
        // Extract metadata JSON if present
        const metadataJson = meta.metadata || '{}';
        try {
          const parsed = JSON.parse(metadataJson);
          const nanobot = parsed.nanobot || {};
          
          return {
            name: meta.name || name,
            description: meta.description || name,
            requires: nanobot.requires,
            install: nanobot.install,
            always: nanobot.always,
          };
        } catch {
          return {
            name: meta.name || name,
            description: meta.description || name,
          };
        }
      }
    }

    return { name, description: name };
  }

  private parseFrontmatter(frontmatter: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();
        
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        result[key] = value;
      }
    }
    
    return result;
  }

  stripFrontmatter(content: string): string {
    if (content.startsWith('---')) {
      const match = content.match(/^---\n[\s\S]*?\n---\n/);
      if (match && match.index !== undefined) {
        return content.slice(match.index + match[0].length).trim();
      }
    }
    return content;
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
