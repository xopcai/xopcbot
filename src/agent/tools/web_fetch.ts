import { Tool } from './base.js';

export class WebFetchTool extends Tool {
  readonly name = 'web_fetch';
  readonly description = 'Fetch and extract readable content from a URL.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      max_chars: { type: 'number', description: 'Max characters (default: 10000)' },
    },
    required: ['url'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const url = String(params.url);
    const maxChars = Number(params.max_chars) || 10000;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'xopcbot/1.0', 'Accept': 'text/html' } });
      if (!res.ok) return `Error: Fetch failed with status ${res.status}`;
      const html = await res.text();
      let text = html.replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > maxChars) text = text.substring(0, maxChars) + '...';
      return text || 'No readable content found.';
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
