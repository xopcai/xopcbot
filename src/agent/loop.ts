import { ToolRegistry } from './tools/index.js';
import { ReadFileTool, WriteFileTool, EditFileTool, ListDirTool } from './tools/index.js';
import { ExecTool } from './tools/shell.js';
import { WebSearchTool, WebFetchTool } from './tools/index.js';
import { MessageTool } from './tools/message.js';
import { MessageTool as SpawnTool } from './tools/spawn.js';
import { MessageBus } from '../bus/index.js';
import { LLMProvider } from '../providers/index.js';
import { ContextBuilder } from './context.js';
import { SubagentManager } from './subagent.js';
import { SessionManager } from '../session/index.js';
import { InboundMessage, OutboundMessage, ToolCall } from '../types/index.js';

export class AgentLoop {
  private context: ContextBuilder;
  private sessions: SessionManager;
  private tools: ToolRegistry;
  private subagents: SubagentManager;
  private running = false;

  constructor(
    private bus: MessageBus,
    private provider: LLMProvider,
    private workspace: string,
    private model?: string,
    private maxIterations = 20,
    private braveApiKey?: string
  ) {
    this.context = new ContextBuilder(workspace, new SessionManager());
    this.sessions = new SessionManager();
    this.tools = new ToolRegistry();
    this.subagents = new SubagentManager(provider, workspace, bus, model || this.provider.getDefaultModel());
    
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // File tools
    this.tools.register(new ReadFileTool());
    this.tools.register(new WriteFileTool());
    this.tools.register(new EditFileTool());
    this.tools.register(new ListDirTool());
    
    // Shell tool
    this.tools.register(new ExecTool(this.workspace));
    
    // Web tools
    this.tools.register(new WebSearchTool(this.braveApiKey));
    this.tools.register(new WebFetchTool());
    
    // Message tool
    const messageTool = new MessageTool();
    messageTool.setSendCallback(async (msg) => {
      await this.bus.publishOutbound(msg);
    });
    this.tools.register(messageTool);
    
    // Spawn tool
    const spawnTool = new SpawnTool();
    spawnTool.setCallback(async (task, label, channel, chatId) => {
      return this.subagents.spawn(task, label, channel, chatId);
    });
    this.tools.register(spawnTool);
  }

  async run(): Promise<void> {
    this.running = true;
    console.log('Agent loop started');

    while (this.running) {
      try {
        const msg = await this.bus.consumeInbound();
        await this.processMessage(msg);
      } catch (error) {
        console.error('Error in agent loop:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  stop(): void {
    this.running = false;
    console.log('Agent loop stopping');
  }

  async processMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    // Handle system messages
    if (msg.channel === 'system') {
      return this.processSystemMessage(msg);
    }

    console.log(`Processing message from ${msg.channel}:${msg.sender_id}`);

    // Get or create session
    const session = this.sessions.getOrCreate(msg.content || 'cli:direct');

    // Update tool contexts
    const messageTool = this.tools.get('message') as MessageTool | undefined;
    if (messageTool) {
      messageTool.setDefaultTarget(msg.channel, msg.chat_id);
    }

    const spawnTool = this.tools.get('spawn') as SpawnTool | undefined;
    if (spawnTool) {
      spawnTool.setDefaultTarget(msg.channel, msg.chat_id);
    }

    // Build messages
    const messages = this.context.buildMessages(
      session.messages,
      msg.content
    );

    // Agent loop
    let iteration = 0;
    let finalContent: string | null = null;

    while (iteration < this.maxIterations) {
      iteration++;

      const response = await this.provider.chat(
        messages,
        this.tools.getDefinitions().map(t => t.function) as ToolCall[],
        this.model || this.provider.getDefaultModel(),
        8192,
        0.7
      );

      if (response.tool_calls.length > 0) {
        // Add assistant message with tool calls
        this.context.addAssistantMessage(
          messages,
          response.content || '',
          response.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }))
        );

        // Execute tools
        for (const toolCall of response.tool_calls) {
          console.log(`Executing tool: ${toolCall.name}`);
          const result = await this.tools.execute(toolCall.name, toolCall.arguments);
          this.context.addToolResult(messages, toolCall.id, toolCall.name, result);
        }
      } else {
        finalContent = response.content;
        break;
      }
    }

    if (!finalContent) {
      finalContent = "I've completed processing but have no response to give.";
    }

    // Save to session
    session.messages.push({ role: 'user', content: msg.content, timestamp: new Date().toISOString() });
    session.messages.push({ role: 'assistant', content: finalContent, timestamp: new Date().toISOString() });
    this.sessions.save(session);

    return {
      channel: msg.channel,
      chat_id: msg.chat_id,
      content: finalContent,
    };
  }

  private async processSystemMessage(msg: InboundMessage): Promise<OutboundMessage | null> {
    console.log(`Processing system message from ${msg.sender_id}`);

    // Parse origin from chat_id (format: "channel:chat_id")
    let originChannel = 'cli';
    let originChatId = msg.chat_id;
    
    if (msg.chat_id.includes(':')) {
      const parts = msg.chat_id.split(':', 2);
      originChannel = parts[0];
      originChatId = parts[1];
    }

    const sessionKey = `${originChannel}:${originChatId}`;
    const session = this.sessions.getOrCreate(sessionKey);

    // Build messages
    const messages = this.context.buildMessages(
      session.messages,
      msg.content
    );

    // Agent loop (limited iterations)
    let iteration = 0;
    let finalContent: string | null = null;

    while (iteration < this.maxIterations) {
      iteration++;

      const response = await this.provider.chat(
        messages,
        this.tools.getDefinitions().map(t => t.function) as ToolCall[],
        this.model || this.provider.getDefaultModel(),
        8192,
        0.7
      );

      if (response.tool_calls.length > 0) {
        this.context.addAssistantMessage(
          messages,
          response.content || '',
          response.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }))
        );

        for (const toolCall of response.tool_calls) {
          const result = await this.tools.execute(toolCall.name, toolCall.arguments);
          this.context.addToolResult(messages, toolCall.id, toolCall.name, result);
        }
      } else {
        finalContent = response.content;
        break;
      }
    }

    if (!finalContent) {
      finalContent = 'Background task completed.';
    }

    // Save to session
    session.messages.push({ 
      role: 'user', 
      content: `[System: ${msg.sender_id}] ${msg.content}`,
      timestamp: new Date().toISOString() 
    });
    session.messages.push({ role: 'assistant', content: finalContent, timestamp: new Date().toISOString() });
    this.sessions.save(session);

    return {
      channel: originChannel,
      chat_id: originChatId,
      content: finalContent,
    };
  }

  async processDirect(content: string, sessionKey = 'cli:direct'): Promise<string> {
    const msg: InboundMessage = {
      channel: 'cli',
      sender_id: 'user',
      chat_id: 'direct',
      content,
    };

    const response = await this.processMessage(msg);
    return response?.content || '';
  }
}
