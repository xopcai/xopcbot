export type AgentIPCMessageType = 'task' | 'query' | 'response' | 'event' | 'signal';

export interface AgentIPCMessage {
  id: string;
  version: 1;
  from: string;
  to: string;
  type: AgentIPCMessageType;
  payload: unknown;
  replyTo?: string;
  timeoutMs?: number;
  createdAt: number;
  expiresAt?: number;
}

export interface AgentTaskPayload {
  task: string;
  context?: string;
  priority?: 'low' | 'normal' | 'high';
  sessionKey?: string;
  callbackAgentId?: string;
}

export interface AgentSignalPayload {
  signal: 'STOP' | 'PAUSE' | 'RESUME' | 'RELOAD' | 'STATUS';
}

type TaskOptionsPriority = 'low' | 'normal' | 'high';

export interface TaskOptions {
  priority?: TaskOptionsPriority;
  sessionKey?: string;
  callbackAgentId?: string;
  timeoutMs?: number;
}

export interface SpawnOptions extends TaskOptions {
  childAgentId?: string;
}

export interface SubagentResult {
  runId: string;
  messageId: string;
  ok: boolean;
  summary?: string;
}

export type AgentSignal = AgentSignalPayload['signal'];
