import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { Message } from '../types/index.js';

export class MemoryStore {
  private memoryDir: string;
  private memoryFile: string;

  constructor(workspace: string) {
    this.memoryDir = join(workspace, 'memory');
    this.memoryFile = join(this.memoryDir, 'MEMORY.md');
    
    // Ensure memory directory exists
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  getTodayFile(): string {
    const today = new Date().toISOString().split('T')[0];
    return join(this.memoryDir, `${today}.md`);
  }

  readToday(): string {
    const todayFile = this.getTodayFile();
    if (existsSync(todayFile)) {
      return readFileSync(todayFile, 'utf-8');
    }
    return '';
  }

  appendToday(content: string): void {
    const todayFile = this.getTodayFile();
    
    let finalContent: string;
    if (existsSync(todayFile)) {
      const existing = readFileSync(todayFile, 'utf-8');
      finalContent = existing + '\n' + content;
    } else {
      const today = new Date().toISOString().split('T')[0];
      finalContent = `# ${today}\n\n` + content;
    }
    
    writeFileSync(todayFile, finalContent, 'utf-8');
  }

  readLongTerm(): string {
    if (existsSync(this.memoryFile)) {
      return readFileSync(this.memoryFile, 'utf-8');
    }
    return '';
  }

  writeLongTerm(content: string): void {
    writeFileSync(this.memoryFile, content, 'utf-8');
  }

  getRecentMemories(days = 7): string {
    const memories: string[] = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const filePath = join(this.memoryDir, `${dateStr}.md`);
      
      if (existsSync(filePath)) {
        memories.push(readFileSync(filePath, 'utf-8'));
      }
    }
    
    return memories.join('\n\n---\n\n');
  }

  getMemoryContext(): string {
    const parts: string[] = [];
    
    const longTerm = this.readLongTerm();
    if (longTerm) {
      parts.push(`## Long-term Memory\n${longTerm}`);
    }
    
    const today = this.readToday();
    if (today) {
      parts.push(`## Today's Notes\n${today}`);
    }
    
    return parts.join('\n\n');
  }
}
