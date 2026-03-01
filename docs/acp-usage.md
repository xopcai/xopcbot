# ACP (Agent Client Protocol) 使用指南

## 简介

ACP (Agent Client Protocol) 是 xopcbot 与外部编码 Agent 通信的标准化协议。通过 ACP，xopcbot 可以指挥 OpenCode、Claude Code、Codex 等专业编码 Agent 完成复杂的代码任务。

## 快速开始

### 1. 启用 ACP

在配置文件中启用 ACP：

```json
{
  "acp": {
    "enabled": true,
    "backend": "acpx",
    "defaultAgent": "opencode",
    "allowedAgents": ["opencode", "claude", "codex"]
  }
}
```

### 2. 安装 acpx

```bash
npm install -g acpx
```

### 3. 配置 acpx

创建 `~/.acpx/config.json`：

```json
{
  "defaultAgent": "opencode",
  "defaultPermissions": "approve-reads",
  "nonInteractivePermissions": "fail"
}
```

## 命令参考

### /acp spawn

创建新的 ACP session 并执行任务：

```
/acp spawn opencode "Fix the bug in server.py"
/acp spawn claude "Refactor the auth module"
/acp spawn codex "Write a test for utils.py"
```

### /acp status

查看 session 状态：

```
/acp status acp:opencode:abc123
```

### /acp cancel

取消正在运行的 session：

```
/acp cancel acp:opencode:abc123
```

### /acp close

关闭 session：

```
/acp close acp:opencode:abc123
```

### /acp doctor

检查 ACP 后端健康状态：

```
/acp doctor
```

## 配置选项

### ACP 主配置

```typescript
{
  acp: {
    // 是否启用 ACP
    enabled: boolean;
    
    // 后端类型: 'acpx' | 'direct'
    backend: string;
    
    // 默认 Agent
    defaultAgent: string;
    
    // 允许的 Agent 列表
    allowedAgents: string[];
    
    // 最大并发 sessions
    maxConcurrentSessions?: number;
    
    // 空闲 session TTL (毫秒)
    idleTtlMs?: number;
    
    // 自动分发配置
    dispatch?: {
      enabled: boolean;
      autoSpawn: boolean;
    };
  }
}
```

### acpx 后端配置

```typescript
{
  plugins: {
    acpx: {
      // 权限模式
      permissionMode: 'approve-all' | 'approve-reads' | 'deny-all';
      
      // 非交互模式权限策略
      nonInteractivePermissions: 'deny' | 'fail';
      
      // 超时时间 (秒)
      timeoutSeconds?: number;
      
      // 队列所有者 TTL (秒)
      queueOwnerTtlSeconds?: number;
    }
  }
}
```

## 架构说明

### 组件关系

```
┌─────────────────┐
│   AgentService  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AcpSessionManager
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│  AcpRuntime     │────▶│  acpx CLI    │
│  (interface)    │     └──────────────┘
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ External Agents │
│ (OpenCode, etc) │
└─────────────────┘
```

### Session 生命周期

```
spawn → idle → running → done/error
         │       │
         │       ▼
         │    cancel
         │       │
         ▼       ▼
       close ←───┘
```

## 事件类型

ACP 使用结构化事件流：

| 事件类型 | 说明 | 示例 |
|---------|------|------|
| `text_delta` | 文本输出 | `{ type: 'text_delta', text: 'Hello', stream: 'output' }` |
| `tool_call` | 工具调用 | `{ type: 'tool_call', text: 'read: file.txt' }` |
| `status` | 状态更新 | `{ type: 'status', text: 'Working...' }` |
| `done` | 完成 | `{ type: 'done', stopReason: 'end_turn' }` |
| `error` | 错误 | `{ type: 'error', message: 'Failed', code: '...' }` |

## 与原生能力的对比

| 场景 | xopcbot 原生 | ACP |
|------|-------------|-----|
| 简单脚本 | ✅ 推荐 | 可用但重 |
| 多文件重构 | ⚠️ 能做 | ✅ 推荐 |
| 项目级理解 | ❌ 弱 | ✅ 强 |
| 完整测试套件 | ⚠️ 需手动 | ✅ 自动化 |
| 快速原型 | ✅ 推荐 | 可用 |

## 故障排除

### acpx 命令未找到

```bash
npm install -g acpx
```

### 权限被拒绝

检查 `~/.acpx/config.json` 中的 `defaultPermissions` 设置。

### Session 创建失败

1. 检查 ACP 是否已启用
2. 运行 `/acp doctor` 检查后端状态
3. 查看日志获取详细信息

### 环境变量问题

确保 API keys 在 xopcbot 配置或环境变量中设置：

```json
{
  "providers": {
    "openai": "sk-...",
    "anthropic": "sk-ant-..."
  }
}
```

## 开发指南

### 添加新的 ACP 后端

实现 `AcpRuntime` 接口：

```typescript
import { AcpRuntime } from './acp/runtime/types.js';

class MyCustomRuntime implements AcpRuntime {
  async ensureSession(input) { /* ... */ }
  async *runTurn(input) { /* ... */ }
  async cancel(input) { /* ... */ }
  async close(input) { /* ... */ }
}

// 注册后端
registerAcpRuntimeBackend({
  id: 'my-backend',
  runtime: new MyCustomRuntime(),
});
```

### 扩展 ACP 命令

在 `src/commands/acp.ts` 中添加新的 action handler。

## 参考

- [OpenClaw ACP 文档](https://github.com/openclaw/openclaw/blob/main/docs.acp.md)
- [acpx CLI](https://www.npmjs.com/package/acpx)
- [Agent Client Protocol SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk)
