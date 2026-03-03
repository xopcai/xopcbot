# P0 可靠性模块使用指南

本文档介绍 xopcbot 的 P0 级可靠性模块，包括指数退避重试和工具超时保护。

## 模块概览

| 模块 | 文件 | 用途 |
|------|------|------|
| Retry | `src/agent/retry.ts` | 指数退避重试机制 |
| Timeout Wrapper | `src/agent/timeout-wrapper.ts` | 工具执行超时保护 |

---

## Retry 模块

### 基本用法

```typescript
import { retryWithBackoff } from './agent/retry.js';

// 自动重试 API 调用
const result = await retryWithBackoff(
  () => callLLM(messages),
  { maxAttempts: 3, initialDelayMs: 1000 }
);
```

### 配置选项

```typescript
interface RetryConfig {
  maxAttempts: number;           // 最大重试次数 (默认: 3)
  initialDelayMs: number;        // 初始延迟 (默认: 1000ms)
  backoffFactor: number;         // 退避因子 (默认: 2)
  maxDelayMs: number;            // 最大延迟 (默认: 30000ms)
  retryableStatusCodes: number[]; // 可重试的 HTTP 状态码
  retryableErrors: string[];     // 可重试的错误模式
  onRetry?: (error, attempt, delayMs) => void; // 重试回调
}
```

### 高级用法

```typescript
import { retryWithResult, withRetry, RetryManager } from './agent/retry.js';

// 获取详细的重试结果
const result = await retryWithResult(() => fetchData(), {
  maxAttempts: 3,
  onRetry: (error, attempt, delayMs) => {
    console.log(`Retry ${attempt} after ${delayMs}ms: ${error.message}`);
  }
});

if (result.success) {
  console.log(`Success after ${result.attempts} attempts`);
} else {
  console.log(`Failed after ${result.attempts} attempts`);
}

// 包装函数
const fetchWithRetry = withRetry(fetchData, { maxAttempts: 3 });
const data = await fetchWithRetry();

// 统计重试情况
const retryManager = new RetryManager();
const data1 = await retryManager.execute(() => api.call1());
const data2 = await retryManager.execute(() => api.call2());
console.log(retryManager.getStats());
```

### 自动重试的错误类型

以下错误会自动重试：
- HTTP 状态码: 429, 500, 502, 503, 504
- 网络错误: timeout, ECONNRESET, ECONNREFUSED, ENOTFOUND
- 其他: "socket hang up", "network error", "rate limit"

---

## Timeout Wrapper 模块

### 基本用法

```typescript
import { executeWithTimeout } from './agent/timeout-wrapper.js';

// 保护工具执行
const result = await executeWithTimeout(
  () => shell.exec('long-running-command'),
  { toolName: 'shell', timeoutMs: 300000 } // 5分钟超时
);
```

### 默认超时时间

| 工具类型 | 默认超时 |
|---------|---------|
| shell/exec | 5分钟 (300000ms) |
| read/view | 30秒 (30000ms) |
| write/edit | 1分钟 (60000ms) |
| web/http/fetch | 1分钟 (60000ms) |
| 其他 | 5分钟 (300000ms) |

### 高级用法

```typescript
import { 
  executeWithTimeoutResult, 
  withTimeout, 
  TimeoutManager,
  TimeoutError 
} from './agent/timeout-wrapper.js';

// 获取详细的执行结果
const result = await executeWithTimeoutResult(() => readLargeFile(), {
  toolName: 'read_file'
  // 使用默认的 30 秒超时
});

if (result.success) {
  console.log(`Completed in ${result.executionTimeMs}ms`);
} else if (result.timedOut) {
  console.log('Operation timed out');
}

// 包装函数
const shellWithTimeout = withTimeout(
  shell.exec, 
  { toolName: 'shell', description: (cmd) => `Executing: ${cmd}` }
);

// 统计执行情况
const timeoutManager = new TimeoutManager();
await timeoutManager.execute(() => tool1(), { toolName: 'tool1' });
await timeoutManager.execute(() => tool2(), { toolName: 'tool2' });
console.log(timeoutManager.getStats());

// 处理超时错误
try {
  await executeWithTimeout(() => slowOperation(), { toolName: 'shell' });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log(error.getUserMessage());
    // 输出:
    // ⚠️ Tool 'shell' timed out after 300s. Consider breaking the operation into smaller steps.
    //
    // Suggestions:
    // • Break the command into smaller steps
    // • Add timeouts to individual commands
    // • Check for infinite loops or waiting for input
  }
}
```

---

## 在 AgentService 中集成

### 修改 service.ts 使用新模块

```typescript
import { 
  retryWithBackoff, 
  executeWithTimeout,
  TimeoutError 
} from './retry.js';

// 在 AgentService 中包装 LLM 调用
async callLLMWithRetry(messages: AgentMessage[]): Promise<LLMResponse> {
  return retryWithBackoff(
    () => this.llmClient.complete(messages),
    {
      maxAttempts: 3,
      onRetry: (error, attempt, delayMs) => {
        this.logger.warn(`LLM call failed, retrying in ${delayMs}ms`);
      }
    }
  );
}

// 包装工具执行
async executeToolWithTimeout(toolName: string, params: any): Promise<any> {
  try {
    return await executeWithTimeout(
      () => this.tools.execute(toolName, params),
      { toolName }
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      return {
        isError: true,
        output: error.getUserMessage()
      };
    }
    throw error;
  }
}
```

---

## 测试

运行测试：

```bash
# 运行所有测试
pnpm test

# 只运行重试模块测试
pnpm test src/agent/__tests__/retry.test.ts

# 只运行超时模块测试
pnpm test src/agent/__tests__/timeout-wrapper.test.ts
```

---

## 最佳实践

1. **始终使用超时保护** - 所有可能长时间运行的操作都应该有超时保护
2. **合理设置重试次数** - 通常 3 次重试足够，避免无限重试
3. **使用退避策略** - 指数退避可以避免对服务造成压力
4. **记录重试和超时** - 使用日志记录重试和超时事件，便于调试
5. **提供用户反馈** - 当重试或超时时，向用户说明情况

---

## 故障排除

### 重试不生效

检查错误消息是否包含可重试的模式：
```typescript
const isRetryable = retryableErrors.some(pattern => 
  error.message.toLowerCase().includes(pattern)
);
```

### 超时没有触发

确保使用 `await` 等待 Promise：
```typescript
// 正确
await executeWithTimeout(() => operation(), { toolName: 'test' });

// 错误 - 没有 await
executeWithTimeout(() => operation(), { toolName: 'test' });
```

### 内存泄漏

如果使用 `TimeoutManager`，定期清理旧记录：
```typescript
const manager = new TimeoutManager();
// ... 使用 manager ...
manager.cleanup(24 * 60 * 60 * 1000); // 清理 24 小时前的记录
```
