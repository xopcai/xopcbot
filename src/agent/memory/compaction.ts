// Session Compaction - Compress old messages using dual-strategy approach
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { complete, type Model, type Api } from '@mariozechner/pi-ai';
import { generateStructuredSummary, formatSummaryAsText, type ConversationSummary } from './summary-generator.js';

export interface CompactionResult {
  summary: string;
  firstKeptIndex: number;
  tokensBefore: number;
  tokensAfter: number;
  compacted: boolean;
  structuredSummary?: ConversationSummary;
}

export interface CompactionConfig {
  enabled: boolean;
  mode: 'extractive' | 'abstractive' | 'structured';
  reserveTokens: number;
  triggerThreshold: number;
  minMessagesBeforeCompact: number;
  keepRecentMessages: number;
  summaryMaxTokens: number;
  // Dual-strategy config
  evictionWindow: number;    // Eviction window ratio (0.2 = 20% oldest messages)
  retentionWindow: number;   // Retention window (keep last N turns)
}

const DEFAULT_CONFIG: CompactionConfig = {
  enabled: true,
  mode: 'abstractive',
  reserveTokens: 8000,
  triggerThreshold: 0.8,
  minMessagesBeforeCompact: 10,
  keepRecentMessages: 10,
  summaryMaxTokens: 500,
  evictionWindow: 0.2,    // 20% oldest messages
  retentionWindow: 6,     // Keep last 6 turns
};

// Rough token estimation (4 chars per token average)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(msg: AgentMessage): number {
  let text = '';
  
  if (typeof msg.content === 'string') {
    text = msg.content;
  } else if (Array.isArray(msg.content)) {
    text = msg.content
      .filter(c => c.type === 'text')
      .map(c => (c as { text?: string }).text || '')
      .join('\n');
  }
  
  return estimateTokens(text) + 10;
}

/**
 * Count conversation turns (user+assistant pairs)
 * Reserved for future use
 */
function _countTurns(messages: AgentMessage[]): number {
  let turns = 0;
  let lastRole: string | null = null;
  
  for (const msg of messages) {
    if (msg.role === 'user' && lastRole !== 'user') {
      turns++;
    }
    lastRole = msg.role;
  }
  
  return turns;
}

/**
 * Find the index of the Nth turn from the end
 */
function findNthTurnFromEnd(messages: AgentMessage[], n: number): number {
  if (n <= 0) return messages.length;
  
  let turnsFound = 0;
  let lastRole: string | null = null;
  
  // Iterate from end to beginning
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    
    if (msg.role === 'user' && lastRole !== 'user') {
      turnsFound++;
      if (turnsFound === n) {
        return i;
      }
    }
    lastRole = msg.role;
  }
  
  return 0; // Return beginning if not enough turns
}

/**
 * Calculate compaction range using dual-strategy approach
 * Takes the minimum of eviction and retention strategies (more conservative)
 */
export function calculateCompactionRange(
  messages: AgentMessage[],
  config: CompactionConfig
): { start: number; end: number } | null {
  const totalMessages = messages.length;
  
  if (totalMessages < config.minMessagesBeforeCompact) {
    return null;
  }
  
  // Strategy 1: Eviction window - evict oldest N% of messages
  const evictionEnd = Math.floor(totalMessages * config.evictionWindow);
  
  // Strategy 2: Retention window - keep last N turns
  const retentionStart = findNthTurnFromEnd(messages, config.retentionWindow);
  const retentionEnd = retentionStart > 0 ? retentionStart - 1 : 0;
  
  // Take the smaller range (more conservative compaction)
  const compactionEnd = Math.min(evictionEnd, retentionEnd);
  
  if (compactionEnd <= 1) {
    return null; // Not enough messages to compact
  }
  
  return { start: 0, end: compactionEnd };
}

export class SessionCompactor {
  private config: CompactionConfig;
  
  constructor(
    config: Partial<CompactionConfig> = {},
    private model?: Model<Api>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if compaction is needed
   */
  needsCompaction(
    messages: AgentMessage[],
    contextWindow: number
  ): { needed: boolean; reason: string; usagePercent?: number } {
    if (!this.config.enabled) {
      return { needed: false, reason: 'disabled' };
    }

    if (messages.length < this.config.minMessagesBeforeCompact) {
      return { needed: false, reason: 'not_enough_messages' };
    }

    const totalTokens = this.estimateTotalTokens(messages);
    const usagePercent = totalTokens / contextWindow;

    if (usagePercent > this.config.triggerThreshold) {
      return { 
        needed: true, 
        reason: 'threshold_exceeded',
        usagePercent 
      };
    }

    return { needed: false, reason: 'within_threshold' };
  }

  /**
   * Compact messages by summarizing old ones using dual-strategy
   */
  async compact(
    messages: AgentMessage[],
    _instructions?: string
  ): Promise<CompactionResult> {
    if (messages.length < this.config.minMessagesBeforeCompact) {
      return {
        summary: '',
        firstKeptIndex: 0,
        tokensBefore: this.estimateTotalTokens(messages),
        tokensAfter: this.estimateTotalTokens(messages),
        compacted: false,
      };
    }

    // Calculate compaction range using dual-strategy
    const range = calculateCompactionRange(messages, this.config);
    
    // Fallback to simple strategy if dual-strategy returns null
    const keepRecent = range ? messages.length - range.end : this.config.keepRecentMessages;
    const messagesToSummarize = range 
      ? messages.slice(0, range.end)
      : messages.slice(0, -keepRecent);
    const keptMessages = range 
      ? messages.slice(range.end)
      : messages.slice(-keepRecent);

    // Generate summary based on mode
    const summary = await this.generateSummary(messagesToSummarize);
    const structuredSummary = this.config.mode === 'structured' 
      ? generateStructuredSummary(messagesToSummarize)
      : undefined;

    const tokensBefore = this.estimateTotalTokens(messages);
    const summaryTokens = estimateTokens(summary) + 20;
    const keptTokens = this.estimateTotalTokens(keptMessages);
    const tokensAfter = summaryTokens + keptTokens;

    return {
      summary,
      firstKeptIndex: keptMessages.length > 0 ? messages.length - keptMessages.length : 0,
      tokensBefore,
      tokensAfter,
      compacted: true,
      structuredSummary,
    };
  }

  /**
   * Generate summary based on configured mode
   */
  private async generateSummary(messages: AgentMessage[]): Promise<string> {
    // Use LLM if available and mode is abstractive/structured
    if (this.model && (this.config.mode === 'abstractive' || this.config.mode === 'structured')) {
      try {
        if (this.config.mode === 'structured') {
          // Generate structured summary and format as text
          const structured = generateStructuredSummary(messages);
          return formatSummaryAsText(structured, true);
        } else {
          return await this.llmAbstractiveSummary(messages);
        }
      } catch (err) {
        console.warn('[Compactor] LLM summarization failed, falling back to extractive', err);
      }
    }

    // Fallback to extractive summary
    return this.extractiveSummary(messages);
  }

  /**
   * LLM-based abstractive summary (natural language summary)
   */
  private async llmAbstractiveSummary(messages: AgentMessage[]): Promise<string> {
    if (!this.model) {
      throw new Error('Model not available');
    }

    const conversation = this.formatMessages(messages);
    const prompt = `Summarize the following conversation in 2-3 concise sentences. Focus on:
1. What the user was trying to accomplish
2. Key decisions, outcomes, or solutions
3. Any important context that should be preserved

Conversation:
${conversation}

Summary:`;

    const result = await complete(this.model, { 
      messages: [{ role: 'user', content: prompt }] as any 
    }, {
      maxTokens: this.config.summaryMaxTokens,
      temperature: 0.3,
    });

    const text = Array.isArray(result.content)
      ? result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
      : '';

    return text.trim();
  }

  /**
   * Format messages for LLM consumption
   */
  private formatMessages(messages: AgentMessage[]): string {
    return messages
      .map(m => {
        const role = m.role;
        const content = typeof m.content === 'string' 
          ? m.content 
          : (m.content as any[]).filter(c => c.type === 'text').map(c => c.text || '').join('\n');
        return `[${role}]: ${content}`;
      })
      .join('\n\n');
  }

  /**
   * Simple extractive summary (fallback when LLM unavailable)
   */
  private extractiveSummary(messages: AgentMessage[]): string {
    const userMessages = messages
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            .filter(c => c.type === 'text')
            .map(c => (c as { text?: string }).text || '')
            .join('\n');
        }
        return '';
      })
      .filter(t => t.length > 0)
      .join('; ');

    return `Previous conversation covered: ${userMessages.slice(0, 300)}...`;
  }

  /**
   * Estimate tokens for messages array
   */
  estimateTotalTokens(messages: AgentMessage[]): number {
    return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
  }

  /**
   * Apply compaction result to messages
   */
  applyCompaction(
    messages: AgentMessage[],
    result: CompactionResult
  ): AgentMessage[] {
    if (!result.compacted || !result.summary) {
      return messages;
    }

    const summaryMessage: AgentMessage = {
      role: 'user',
      content: [{ type: 'text', text: `[Previous conversation summary]: ${result.summary}` }],
      timestamp: Date.now(),
    };

    const keptMessages = messages.slice(result.firstKeptIndex);
    return [summaryMessage, ...keptMessages];
  }
}
