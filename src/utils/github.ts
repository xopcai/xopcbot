// GitHub configuration utility
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

interface GitHubConfig {
  github: {
    token: string;
    owner: string;
    repo: string;
  };
}

const CONFIG_PATH = join(homedir(), '.config', 'xopcbot', 'config.json');

export function getGitHubConfig(): GitHubConfig | null {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }
  
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as GitHubConfig;
  } catch {
    return null;
  }
}

export function getGitHubToken(): string | null {
  const config = getGitHubConfig();
  return config?.github?.token || null;
}

export function getRepoInfo(): { owner: string; repo: string } | null {
  const config = getGitHubConfig();
  if (!config?.github) return null;
  return {
    owner: config.github.owner,
    repo: config.github.repo,
  };
}

// Example usage:
if (import.meta.url === `file://${process.argv[1]}`) {
  const token = getGitHubToken();
  const repo = getRepoInfo();
  console.log('GitHub Token:', token ? '✓ Saved' : '✗ Not found');
  console.log('Repo:', repo ? `${repo.owner}/${repo.repo}` : 'Not configured');
}
