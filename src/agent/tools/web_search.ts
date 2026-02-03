import { Tool } from './base.js';

export class WebSearchTool extends Tool {
  readonly name = 'web_search';
  readonly description = 'Search the web using Brave Search API.';
  
  readonly parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      count: { type: 'number', description: 'Max results (default: 5)' },
    },
    required: ['query'],
  };

  constructor(private apiKey?: string) { super(); }

  async execute(params: Record<string, unknown>): Promise<string> {
    const query = String(params.query);
    const count = Number(params.count) || 5;
    if (!this.apiKey) return 'Error: BRAVE_SEARCH_API_KEY not configured.';

    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': this.apiKey },
      });
      if (!res.ok) return `Error: Brave Search returned ${res.status}`;
      const data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
      const results = data.web?.results || [];
      if (!results.length) return 'No results found.';
      return `Search results for "${query}":\n\n${results.slice(0, count).map((r, i) => `${i + 1}. ${r.title || 'No title'}\n   ${r.url || ''}\n   ${r.description || ''}`).join('\n\n')}`;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
