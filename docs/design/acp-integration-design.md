# xopcbot ACP 集成技术方案

## 概述

本文档描述如何在 xopcbot 中集成 ACP (Agent Client Protocol) 能力，实现与外部编码 Agent（如 Claude Code、OpenCode、Codex）的标准化通信。

## 背景

### 为什么需要 ACP

xopcbot 本身具备文件读写、命令执行、Web 搜索等能力，但专业编码场景需要更深层次的项目理解：

| 场景 | xopcbot 原生能力 | 外部编码 Agent |
|------|------------------|----------------|
| 写脚本/改配置 | ✅ 够用 | 不需要 |
| 多文件重构 | ⚠️ 能做但效率低 | ✅ 专长 |
| 项目级依赖理解 | ❌ 弱 | ✅ 强 |
| 完整测试套件 | ⚠️ 需手动组织 | ✅ 自动化 |
| IDE 级别导航 | ❌ 无 | ✅ 原生支持 |

ACP 解决的核心问题：**让 xopcbot 能以标准化协议指挥外部编码 Agent 工作**。

### ACP vs PTY 方式对比

| 维度 | PTY 暴力流 | ACP 协议 |
|------|-----------|----------|
| 原理 | 开 PTY 终端跑 Agent | 标准化事件流通信 |
| 输出格式 | Raw text + ANSI 码 | 结构化 ndjson |
| 过程可见性 | 黑盒（轮询日志） | 实时事件流 |
| 取消机制 | kill 进程 | 优雅 cancel |
| 状态管理 | 无 | 完整状态机 |
| 配置复杂度 | 零 | 中等 |

**结论**：两者并存，根据场景选择。简单任务用 PTY，专业编码用 ACP。

---

## 架构设计

### 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                      xopcbot Core                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ AgentService │  │  Commands    │  │   Gateway    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                 │                │
│         └────────────────┬┴─────────────────┘                │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ACP Control Plane                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ AcpManager  │  │  Registry   │  │ Policy      │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ACP Runtime Layer                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ AcpxRuntime │  │  Direct     │  │  Custom     │  │   │
│  │  │ (acpx CLI)  │  │  (embedded) │  │  (plugin)   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼ (stdio/ndjson)
        ┌──────────────────────────────────────────┐
        │           External Coding Agents          │
        │  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
        │  │ OpenCode│ │ Claude  │ │  Codex  │ ... │
        │  │         │ │  Code   │ │         │     │
        │  └─────────┘ └─────────┘ └─────────┘     │
        └──────────────────────────────────────────┘
```

### 核心组件

#### 1. AcpSessionManager (控制面)

负责 ACP session 的生命周期管理：

```typescript
// src/acp/manager.ts
export class AcpSessionManager {
  // Session 初始化
  async initializeSession(input: {
    sessionKey: string;
    agent: string;        // 'opencode' | 'claude' | 'codex' | ...
    mode: 'persistent' | 'oneshot';
    cwd?: string;
    backendId?: string;
  }): Promise<{
    runtime: AcpRuntime;
    handle: AcpRuntimeHandle;
    meta: SessionAcpMeta;
  }>;

  // 执行 turn
  async runTurn(input: {
    sessionKey: string;
    text: string;
    mode: 'prompt' | 'steer';
    requestId: string;
    signal?: AbortSignal;
    onEvent?: (event: AcpRuntimeEvent) => void;
  }): Promise<void>;

  // 取消任务
  async cancelSession(params: {
    sessionKey: string;
    reason?: string;
  }): Promise<void>;

  // 关闭 session
  async closeSession(input: {
    sessionKey: string;
    reason: string;
    clearMeta?: boolean;
  }): Promise<void>;

  // 获取状态
  async getSessionStatus(params: {
    sessionKey: string;
  }): Promise<AcpSessionStatus>;
}
```

#### 2. AcpRuntime (运行时接口)

定义外部 Agent 的统一接口：

```typescript
// src/acp/runtime/types.ts
export interface AcpRuntime {
  // 确保 session 存在
  ensureSession(input: AcpRuntimeEnsureInput): Promise<AcpRuntimeHandle>;

  // 执行一个 turn
  runTurn(input: AcpRuntimeTurnInput): AsyncIterable<AcpRuntimeEvent>;

  // 能力声明
  getCapabilities?(input: { handle?: AcpRuntimeHandle }): AcpRuntimeCapabilities;

  // 获取状态
  getStatus?(input: { handle: AcpRuntimeHandle }): Promise<AcpRuntimeStatus>;

  // 设置模式
  setMode?(input: { handle: AcpRuntimeHandle; mode: string }): Promise<void>;

  // 设置配置项
  setConfigOption?(input: {
    handle: AcpRuntimeHandle;
    key: string;
    value: string;
  }): Promise<void>;

  // 健康检查
  doctor?(): Promise<AcpRuntimeDoctorReport>;

  // 取消
  cancel(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void>;

  // 关闭
  close(input: { handle: AcpRuntimeHandle; reason: string }): Promise<void>;
}
```

#### 3. AcpRuntimeEvent (事件流)

标准化的执行事件：

```typescript
export type AcpRuntimeEvent =
  | { type: 'text_delta'; text: string; stream?: 'output' | 'thought' }
  | { type: 'status'; text: string }
  | { type: 'tool_call'; text: string }
  | { type: 'done'; stopReason?: string }
  | { type: 'error'; message: string; code?: string; retryable?: boolean };
```

#### 4. AcpRuntimeRegistry (后端注册)

支持多种后端实现：

```typescript
// src/acp/runtime/registry.ts
export function registerAcpRuntimeBackend(backend: {
  id: string;
  runtime: AcpRuntime;
  healthy?: () => boolean;
}): void;

export function getAcpRuntimeBackend(id?: string): AcpRuntimeBackend | null;
```

---

## 目录结构

```
src/acp/
├── index.ts                    # 导出入口
├── manager.ts                  # AcpSessionManager 实现
├── runtime/
│   ├── index.ts               # Runtime 导出
│   ├── types.ts               # AcpRuntime 接口定义
│   ├── registry.ts            # Runtime 后端注册
│   ├── errors.ts              # AcpRuntimeError
│   └── backends/
│       ├── acpx/              # acpx CLI 后端
│       │   ├── index.ts
│       │   ├── runtime.ts     # AcpxRuntime 实现
│       │   ├── config.ts      # 配置解析
│       │   └── process.ts     # 进程管理
│       └── direct/            # 直接调用后端（可选）
│           └── runtime.ts
├── session/
│   ├── store.ts               # ACP session 持久化
│   └── meta.ts                # Session 元数据管理
├── policy.ts                  # 访问策略
├── commands.ts                # CLI 命令注册
└── control-plane/
    ├── manager.core.ts        # 核心管理逻辑
    ├── runtime-cache.ts       # Runtime 实例缓存
    └── session-actor-queue.ts # 并发控制
```

---

## 配置设计

### 配置结构

```typescript
// 扩展 src/config/schema.ts

export const AcpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  backend: z.enum(['acpx', 'direct']).default('acpx'),
  defaultAgent: z.string().default('opencode'),
  allowedAgents: z.array(z.string()).default(['claude', 'opencode', 'codex']),
  maxConcurrentSessions: z.number().optional(),
  idleTtlMs: z.number().optional(),
  dispatch: z.object({
    enabled: z.boolean().default(false),
    autoSpawn: z.boolean().default(false),
  }).optional(),
}).optional();

export const ConfigSchema = z.object({
  // ... 现有配置
  acp: AcpConfigSchema,
});
```

### 配置示例

```json
{
  "acp": {
    "enabled": true,
    "backend": "acpx",
    "defaultAgent": "opencode",
    "allowedAgents": ["opencode", "claude"],
    "maxConcurrentSessions": 3,
    "idleTtlMs": 300000,
    "dispatch": {
      "enabled": true,
      "autoSpawn": false
    }
  },
  "plugins": {
    "acpx": {
      "permissionMode": "approve-reads",
      "nonInteractivePermissions": "fail",
      "timeoutSeconds": 300
    }
  }
}
```

### acpx 后端配置

acpx 有自己独立的配置文件 `~/.acpx/config.json`：

```json
{
  "defaultAgent": "opencode",
  "defaultPermissions": "approve-all",
  "nonInteractivePermissions": "fail",
  "authPolicy": "skip",
  "ttl": 300
}
```

---

## 命令设计

### /acp 命令族

```bash
# Session 管理
/acp spawn <agent> [task]     # 创建 ACP session
/acp close                    # 关闭当前 session
/acp status                   # 查看状态

# 运行时控制
/acp cancel                   # 取消当前任务
/acp steer <message>          # 中途引导

# 配置
/acp set-mode <mode>          # 设置模式
/acp set <key> <value>        # 设置配置项
/acp cwd [path]               # 查看或设置工作目录

# 诊断
/acp doctor                   # 健康检查
/acp install                  # 安装依赖
/acp sessions                 # 列出活跃 sessions
```

### spawn 流程

```
用户: /acp spawn opencode "修复 server.py 的并发 bug"
         │
         ▼
┌─────────────────────┐
│ 1. 解析命令         │
│    - agent: opencode│
│    - task: 修复...  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 2. 初始化 Session   │
│    - 调用 ensure    │
│    - 创建 sessionKey│
│    - 设置 cwd       │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 3. 执行 Turn        │
│    - runTurn()      │
│    - 流式事件       │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 4. 返回结果         │
│    - text_delta     │
│    - tool_call      │
│    - done/error     │
└─────────────────────┘
```

---

## 与现有系统集成

### 1. 与 AgentService 集成

```typescript
// src/agent/service.ts
export class AgentService {
  private acpManager?: AcpSessionManager;

  constructor(private bus: MessageBus, private config: AgentServiceConfig) {
    // ... 现有初始化

    // 初始化 ACP
    if (config.config?.acp?.enabled) {
      this.acpManager = new AcpSessionManager();
    }
  }

  private async handleUserMessage(msg: InboundMessage): Promise<void> {
    // 检查是否是 ACP 命令
    if (content.startsWith('/acp ') && this.acpManager) {
      await this.handleAcpCommand(msg, content);
      return;
    }

    // ... 现有处理逻辑
  }
}
```

### 2. 与命令系统集成

```typescript
// src/commands/acp.ts
import { register, commandRegistry } from '../registry.js';

register({
  id: 'acp',
  factory: (ctx) => {
    return new Command('acp')
      .description('ACP (Agent Client Protocol) commands')
      .argument('[action]', 'spawn|cancel|status|close|doctor|...')
      .argument('[args...]', 'Additional arguments')
      .action(async (action, args) => {
        const acpManager = ctx.getAcpManager?.();
        if (!acpManager) {
          ctx.reply('ACP is not enabled. Enable it in config.');
          return;
        }

        switch (action) {
          case 'spawn':
            await handleSpawn(acpManager, ctx, args);
            break;
          // ... 其他命令
        }
      });
  },
  metadata: { category: 'runtime' },
});
```

### 3. 与 Plugin 系统集成

```typescript
// src/plugins/acpx/index.ts
import type { XopcbotPluginDefinition } from '../types.js';

const acpxPlugin: XopcbotPluginDefinition = {
  id: 'acpx',
  name: 'ACPX Runtime',
  description: 'ACP runtime backend powered by acpx CLI',
  
  configSchema: {
    jsonSchema: {
      type: 'object',
      properties: {
        permissionMode: { type: 'string', enum: ['approve-all', 'approve-reads', 'deny-all'] },
        nonInteractivePermissions: { type: 'string', enum: ['deny', 'fail'] },
        timeoutSeconds: { type: 'number' },
      },
    },
  },

  register(api) {
    const runtime = new AcpxRuntime(api.pluginConfig);
    registerAcpRuntimeBackend({
      id: 'acpx',
      runtime,
      healthy: () => runtime.isHealthy(),
    });
  },
};

export default acpxPlugin;
```

### 4. 与 Gateway 集成

```typescript
// src/gateway/handlers/acp.ts
export function registerAcpGatewayMethods(handler: GatewayHandler) {
  // ACP session 管理
  handler.register('acp.initialize', async (params, ctx) => {
    const manager = ctx.getAcpManager();
    return await manager.initializeSession(params);
  });

  handler.register('acp.prompt', async (params, ctx) => {
    const manager = ctx.getAcpManager();
    const events: AcpRuntimeEvent[] = [];
    
    await manager.runTurn({
      sessionKey: params.sessionKey,
      text: params.text,
      mode: 'prompt',
      requestId: params.requestId,
      onEvent: (event) => events.push(event),
    });
    
    return { events };
  });

  // ... 其他方法
}
```

---

## Session 持久化

### Session 元数据结构

```typescript
// src/acp/session/meta.ts
export type SessionAcpMeta = {
  backend: string;              // 'acpx' | 'direct'
  agent: string;                // 'opencode' | 'claude' | ...
  runtimeSessionName: string;   // 运行时 session 标识
  identity?: SessionAcpIdentity;
  mode: 'persistent' | 'oneshot';
  runtimeOptions?: AcpSessionRuntimeOptions;
  cwd?: string;
  state: 'idle' | 'running' | 'error';
  lastActivityAt: number;
  lastError?: string;
};

export type SessionAcpIdentity = {
  state: 'pending' | 'resolved';
  source: 'ensure' | 'status';
  acpxRecordId?: string;
  backendSessionId?: string;
  agentSessionId?: string;
  lastUpdatedAt: number;
};
```

### 存储位置

```
~/.xopcbot/
├── sessions/
│   ├── telegram_123456.json   # Telegram chat session
│   └── acp_opencode_abc.json  # ACP session
└── workspace/
    └── .acp/
        └── sessions.json      # ACP session 元数据
```

---

## 错误处理

### 错误码定义

```typescript
// src/acp/runtime/errors.ts
export const ACP_ERROR_CODES = {
  // Session 初始化失败
  ACP_SESSION_INIT_FAILED: 'Failed to initialize ACP session',
  
  // 后端不可用
  ACP_BACKEND_UNAVAILABLE: 'ACP backend is not available',
  
  // 后端未注册
  ACP_BACKEND_MISSING: 'ACP backend is not configured',
  
  // 后端不支持的操作
  ACP_BACKEND_UNSUPPORTED_CONTROL: 'ACP backend does not support this control',
  
  // Turn 执行失败
  ACP_TURN_FAILED: 'ACP turn failed before completion',
  
  // 权限问题
  ACP_PERMISSION_DENIED: 'Permission denied for ACP operation',
} as const;

export class AcpRuntimeError extends Error {
  constructor(
    public code: keyof typeof ACP_ERROR_CODES,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'AcpRuntimeError';
  }
}
```

### 错误恢复策略

```typescript
// src/acp/manager.ts
async runTurnWithRetry(input: AcpRunTurnInput, retries = 2): Promise<void> {
  try {
    await this.runTurn(input);
  } catch (error) {
    if (error instanceof AcpRuntimeError) {
      // 后端不可用 - 清理缓存重试
      if (error.code === 'ACP_BACKEND_UNAVAILABLE') {
        this.clearCachedRuntimeState(input.sessionKey);
        if (retries > 0) {
          await this.runTurnWithRetry(input, retries - 1);
          return;
        }
      }
    }
    throw error;
  }
}
```

---

## 实现路线图

### Phase 1: 核心框架 (1-2 周)

1. 创建目录结构和类型定义
2. 实现 `AcpRuntime` 接口和 `AcpRuntimeRegistry`
3. 实现 `AcpSessionManager` 核心逻辑
4. 添加基础错误处理

### Phase 2: acpx 后端 (1 周)

1. 实现 `AcpxRuntime` 类
2. 进程管理和 ndjson 解析
3. 配置解析和验证
4. 健康检查 (`doctor`)

### Phase 3: 命令集成 (1 周)

1. 实现 `/acp` 命令族
2. 与现有命令系统集成
3. 添加权限检查
4. 实现流式输出

### Phase 4: Gateway 集成 (1 周)

1. 添加 ACP 相关的 Gateway 方法
2. WebSocket 事件推送
3. UI 组件支持（可选）

### Phase 5: 测试和文档 (1 周)

1. 单元测试
2. 集成测试
3. 文档编写
4. 示例代码

---

## 依赖

### 运行时依赖

```json
{
  "dependencies": {
    "@agentclientprotocol/sdk": "^0.13.x",
    "acpx": "^0.1.13"
  }
}
```

### 可选依赖

- `@agentclientprotocol/sdk`: 用于直接实现 ACP 协议（不使用 acpx 时）
- `acpx`: ACP 运行时 CLI 工具

---

## 安全考虑

### 1. 权限控制

```typescript
// src/acp/policy.ts
export type AcpAccessPolicy = {
  // 允许哪些用户触发 ACP
  allowedUsers?: string[];
  // 允许哪些 channel
  allowedChannels?: string[];
  // 允许哪些 agent
  allowedAgents?: string[];
  // 是否允许 auto-dispatch
  allowAutoDispatch?: boolean;
};

export function checkAcpAccess(
  policy: AcpAccessPolicy,
  context: { senderId: string; channel: string; agent: string }
): boolean {
  // 检查逻辑
}
```

### 2. 沙箱隔离

- acpx 支持沙箱执行模式
- 工作目录隔离
- 文件系统访问控制

### 3. 敏感信息

- API key 通过环境变量或配置文件传递
- 不在日志中打印敏感信息
- Session 元数据不包含凭证

---

## 参考

- [OpenClaw ACP 实现](https://github.com/openclaw/openclaw/tree/main/src/acp)
- [acpx CLI](https://www.npmjs.com/package/acpx)
- [Agent Client Protocol SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk)
- [OpenClaw AGENTS.md](https://github.com/openclaw/openclaw/blob/main/AGENTS.md)

---

## 变更历史

| 日期 | 版本 | 描述 |
|------|------|------|
| 2026-03-01 | v1.0 | 初始设计文档 |