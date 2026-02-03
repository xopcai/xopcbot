import { Tool } from './base.js';
import { JSDOM } from 'jsdom';

export class WebFetchTool extends Tool {
  name = 'web_fetch';
  description = 'Fetch and extract readable content from a URL (HTML to markdown/text).';
  
  parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
      max_chars: {
        type: 'number',
        description: 'Maximum characters to return (default: 10000)',
      },
    },
    required: ['url'],
  };

  async execute(params: Record<string, unknown>): Promise<string> {
    const { url, max_chars = 10000 } = params as { url: string; max_chars?: number };
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'xopcbot/1.0 (AI Assistant)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        return `Error: Fetch failed with status ${response.status}`;
      }

      const html = await response.text();
      
      // Simple HTML to text extraction
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // Remove scripts, styles, etc.
      document.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
      
      // Get text content
      let text = document.body.textContent || '';
      
      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();
      
      // Truncate if needed
      if (text.length > max_chars) {
        text = text.substring(0, max_chars) + '...';
      }

      return text || 'No readable content found.';
    } catch (error) {
      return `Error fetching URL: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
