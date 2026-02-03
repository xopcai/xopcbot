// ============================================
// xopcbot Core Types - Simplified
// ============================================

export interface InboundMessage {
  channel: string;
  sender_id: string;
  chat_id: string;
  content: string;
  media?: string[];
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  channel: string;
  chat_id: string;
  content: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
  tool_call_id?: string;
  name?: string;
}

// Tool types - simplified
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface LLMResponse {
  content: string | null;
  tool_calls: ToolCall[];
  finish_reason: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Config
export interface Config {
  agents: {
    defaults: {
      workspace: string;
      model: string;
      max_tokens: number;
      temperature: number;
      max_tool_iterations: number;
    };
  };
  channels: {
    telegram?: { enabled: boolean; token: string; allow_from: string[] };
    whatsapp?: { enabled: boolean; bridge_url: string; allow_from: string[] };
  };
  providers: Record<string, { api_key: string; api_base?: string }>;
  gateway: { host: string; port: number };
  tools?: {
    web?: {
      search?: { api_key: string; max_results: number };
    };
  };
}
