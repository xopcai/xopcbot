import { Tool } from './base.js';

export class WebSearchTool extends Tool {
  name = 'web_search';
  description = 'Search the web using Brave Search API.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      count: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
      },
    },
    required: ['query'],
  };

  constructor(private apiKey?: string) {
    super();
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const { query, count = 5 } = params as { query: string; count?: number };
    
    if (!this.apiKey) {
      return 'Error: Web search requires BRAVE_SEARCH_API_KEY to be configured.';
    }

    try {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
        {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': this.apiKey,
          },
        }
      );

      if (!response.ok) {
        return `Error: Brave Search API returned ${response.status}`;
      }

      const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
      const results = data.web?.results || [];

      if (results.length === 0) {
        return 'No results found.';
      }

      const formatted = results.slice(0, count).map((r, i) => {
        return `${i + 1}. ${r.title || 'No title'}\n   URL: ${r.url || 'N/A'}\n   ${r.description || ''}`;
      }).join('\n\n');

      return `Search results for "${query}":\n\n${formatted}`;
    } catch (error) {
      return `Error performing web search: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
