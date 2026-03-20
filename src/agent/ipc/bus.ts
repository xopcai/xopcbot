import { randomUUID } from 'node:crypto';
import { resolveAgentDir, resolveRunDir } from '../../config/paths.js';
import { join } from 'path';
import { AgentInbox } from './inbox.js';
import { sendViaSocket } from './socket.js';
import { SubagentRegistry } from '../subagent-registry.js';
import type {
  AgentIPCMessage,
  AgentSignal,
  SpawnOptions,
  SubagentResult,
  TaskOptions,
} from './types.js';

export class AgentBus {
  private readonly inbox: AgentInbox;
  private readonly subagentRegistry = new SubagentRegistry();
  private messageHandlers: Array<(msg: AgentIPCMessage) => Promise<void>> = [];

  constructor(
    _stateDir: string,
    private readonly agentId: string,
  ) {
    this.inbox = new AgentInbox(resolveAgentDir(agentId));
  }

  async sendTask(targetAgentId: string, task: string, options?: TaskOptions): Promise<string> {
    const id = randomUUID();
    const msg: AgentIPCMessage = {
      id,
      version: 1,
      from: this.agentId,
      to: targetAgentId,
      type: 'task',
      payload: {
        task,
        context: undefined,
        priority: options?.priority,
        sessionKey: options?.sessionKey,
        callbackAgentId: options?.callbackAgentId,
      },
      timeoutMs: options?.timeoutMs,
      createdAt: Date.now(),
    };
    const targetInbox = new AgentInbox(resolveAgentDir(targetAgentId));
    await targetInbox.enqueue(msg);
    const sock = join(resolveRunDir(targetAgentId), 'agent.sock');
    await sendViaSocket(sock, msg);
    return id;
  }

  async waitForResponse(_messageId: string, _timeoutMs?: number): Promise<AgentIPCMessage> {
    throw new Error('waitForResponse: use inbox polling or future response store');
  }

  async sendSignal(targetAgentId: string, signal: AgentSignal): Promise<void> {
    const id = randomUUID();
    const msg: AgentIPCMessage = {
      id,
      version: 1,
      from: this.agentId,
      to: targetAgentId,
      type: 'signal',
      payload: { signal },
      createdAt: Date.now(),
    };
    const targetInbox = new AgentInbox(resolveAgentDir(targetAgentId));
    await targetInbox.enqueue(msg);
    const sock = join(resolveRunDir(targetAgentId), 'agent.sock');
    await sendViaSocket(sock, msg);
  }

  onMessage(handler: (msg: AgentIPCMessage) => Promise<void>): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  async spawnSubagent(task: string, options?: SpawnOptions): Promise<SubagentResult> {
    const runId = `run-${randomUUID().slice(0, 8)}`;
    const childId = options?.childAgentId ?? `sub-${runId}`;
    await this.subagentRegistry.register({
      runId,
      parentAgentId: this.agentId,
      childAgentId: childId,
      task,
      status: 'pending',
      cleanup: 'keep',
      createdAt: Date.now(),
      requesterOrigin: { bus: 'AgentBus' },
    });
    await this.sendTask(childId, task, options);
    return { runId, messageId: runId, ok: true, summary: 'Task queued' };
  }
}
