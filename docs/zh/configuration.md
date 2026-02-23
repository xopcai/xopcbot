# 配置参考

xopcbot 的所有配置都集中在 `~/.config/xopcbot/config.json` 文件中。

## 完整配置示例

```json
{
  "agents": {
    "defaults": {
      "workspace": "~/.xopcbot/workspace",
      "model": {
        "primary": "anthropic/claude-sonnet-4-5",
        "fallbacks": ["openai/gpt-4o", "minimax/minimax-m2.1"]
      },
      "models": {
        "anthropic/claude-sonnet-4-5": { "alias": "claude" },
        "openai/gpt-4o": { "alias": "gpt4" }
      },
      "imageModel": {
        "primary": "openrouter/qwen/qwen-2.5-vl-72b-instruct:free",
        "fallbacks": ["openrouter/google/gemini-2.0-flash-vision:free"]
      },
      "max_tokens": 8192,
      "temperature": 0.7,
      "max_tool_iterations": 20
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "baseUrl": "https://api.openai.com/v1",
        "api": "openai-completions",
        "models": [
          { "id": "gpt-4o", "name": "GPT-4o", "contextWindow": 128000, "maxTokens": 16384 }
        ]
      },
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}",
        "api": "anthropic-messages",
        "models": [
          { "id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "contextWindow": 200000, "maxTokens": 8192 }
        ]
      },
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "api": "openai-completions",
        "models": []
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      "allow_from": []
    },
    "whatsapp": {
      "enabled": false,
      "bridge_url": "ws://localhost:3001",
      "allow_from": []
    }
  },
  "gateway": {
    "host": "0.0.0.0",
    "port": 18790
  },
  "tools": {
    "web": {
      "search": {
        "api_key": "",
        "max_results": 5
      }
    }
  },
  "modelsDev": {
    "enabled": true
  }
}
```

## 配置项详解

### agents

Agent 的默认配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `workspace` | string | `~/.xopcbot/workspace` | 工作区目录 |
| `model` | string / object | `anthropic/claude-sonnet-4-5` | 默认模型 |
| `models` | object | `{}` | 模型别名映射 |
| `imageModel` | string / object | - | 图像/视觉模型配置 |
| `max_tokens` | number | `8192` | 最大输出 token |
| `temperature` | number | `0.7` | 温度参数 (0-2) |
| `max_tool_iterations` | number | `20` | 最大工具调用次数 |

### agents.defaults.model

模型配置支持两种格式：

**简单格式（单个模型）：**
```json
{
  "agents": {
    "defaults": {
      "model": "anthropic/claude-sonnet-4-5"
    }
  }
}
```

**完整格式（主模型 + 备用模型）：**
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5",
        "fallbacks": [
          "openai/gpt-4o",
          "minimax/minimax-m2.1",
          "google/gemini-2.5-flash"
        ]
      }
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `primary` | string | 主要模型 (provider/model 格式) |
| `fallbacks` | string[] | 备用模型列表，当主模型失败时自动切换 |

#### 模型回退机制

当主模型调用失败时，xopcbot 会自动尝试备用模型列表中的模型：

1. **支持的失败类型**：
   - `auth` - 认证失败 (401, 403)
   - `rate_limit` - 速率限制 (429)
   - `billing` - 账单/配额问题 (402)
   - `timeout` - 请求超时
   - `format` - 请求格式错误 (400)

2. **回退流程**：
   - 主模型调用失败
   - 检测失败原因
   - 按顺序尝试备用模型
   - 任意模型成功则返回结果
   - 所有模型失败则抛出错误

3. **示例配置**：
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5",
        "fallbacks": [
          "openai/gpt-4o",
          "minimax/minimax-m2.1"
        ]
      }
    }
  },
  "models": {
    "providers": {
      "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}" },
      "openai": { "apiKey": "${OPENAI_API_KEY}" },
      "minimax": { "apiKey": "${MINIMAX_API_KEY}" }
    }
  }
}
```

模型 ID 格式：
- **简短格式**：`gpt-4o` (使用默认 provider)
- **完整格式**：`anthropic/claude-sonnet-4-5`

### agents.defaults.models

模型别名配置。将完整模型 ID 映射为简短别名。

```json
{
  "agents": {
    "defaults": {
      "models": {
        "kimi/kimi-k2.5": { "alias": "kimi" },
        "minimax/MiniMax-M2.1": { "alias": "minimax" },
        "anthropic/claude-sonnet-4-5": { "alias": "claude", "params": { "temperature": 0.8 } }
      }
    }
  }
}
```

定义别名后，可以这样使用：
```json
{
  "model": { "primary": "kimi" }
}
```

### agents.defaults.imageModel

用于图像理解任务的视觉模型配置。

```json
{
  "agents": {
    "defaults": {
      "imageModel": {
        "primary": "openrouter/qwen/qwen-2.5-vl-72b-instruct:free",
        "fallbacks": [
          "openrouter/google/gemini-2.0-flash-vision:free"
        ]
      }
    }
  }
}
```

### models (OpenClaw 风格)

OpenClaw 格式的 LLM 提供商配置。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | string | `merge` | 合并或替换内置提供商 |
| `providers` | object | `{}` | 提供商配置 |

#### 提供商配置

`models.providers` 下的每个提供商：

```json
{
  "models": {
    "providers": {
      "kimi": {
        "baseUrl": "https://api.moonshot.cn/v1",
        "apiKey": "${KIMI_API_KEY}",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "kimi-k2.5",
            "name": "Kimi K2.5",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0 },
            "contextWindow": 256000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `baseUrl` | string | API 基础 URL |
| `apiKey` | string | API 密钥（支持 `${ENV_VAR}` 语法） |
| `api` | string | API 类型：`openai-completions`、`anthropic-messages` 等 |
| `models` | array | 模型定义列表 |

#### API 类型

- `openai-completions` - OpenAI Chat Completions API
- `openai-responses` - OpenAI Responses API
- `anthropic-messages` - Anthropic Messages API
- `google-generative-ai` - Google Generative AI API
- `github-copilot` - GitHub Copilot API
- `bedrock-converse-stream` - Amazon Bedrock

#### 模型定义

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | - | 模型 ID |
| `name` | string | - | 显示名称 |
| `reasoning` | boolean | `false` | 支持推理/思考 |
| `input` | array | `["text"]` | 输入模态：`text`、`image` |
| `cost` | object | `{0,0,0,0}` | 每百万 token 定价 |
| `contextWindow` | number | `128000` | 上下文窗口大小 |
| `maxTokens` | number | `16384` | 最大输出 token |

### channels

通信通道配置。

#### telegram

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "123456:...",
      "allow_from": ["@username", "123456789"]
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用 |
| `token` | string | Bot Token |
| `allow_from` | string[] | 白名单用户 |

获取 Token：[@BotFather](https://t.me/BotFather)

#### whatsapp

```json
{
  "channels": {
    "whatsapp": {
      "enabled": false,
      "bridge_url": "ws://localhost:3001",
      "allow_from": []
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用 |
| `bridge_url` | string | WA Bridge WebSocket 地址 |
| `allow_from` | string[] | 白名单用户 |

### gateway

REST 网关配置。

```json
{
  "gateway": {
    "host": "0.0.0.0",
    "port": 18790
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `host` | string | 绑定地址 |
| `port` | number | 端口号 |

### tools

内置工具配置。

```json
{
  "tools": {
    "web": {
      "search": {
        "api_key": "",
        "max_results": 5
      }
    }
  }
}
```

## 环境变量

配置也可以通过环境变量设置，会覆盖配置文件：

| 配置项 | 环境变量 |
|--------|----------|
| OpenAI API Key | `OPENAI_API_KEY` |
| Anthropic API Key | `ANTHROPIC_API_KEY` |
| OpenRouter API Key | `OPENROUTER_API_KEY` |
| Groq API Key | `GROQ_API_KEY` |
| Google API Key | `GOOGLE_API_KEY` |
| MiniMax API Key | `MINIMAX_API_KEY` |
| DeepSeek API Key | `DEEPSEEK_API_KEY` |
| Brave Search API Key | `BRAVE_API_KEY` |
| Telegram Bot Token | `TELEGRAM_BOT_TOKEN` |

示例：

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export MINIMAX_API_KEY="..."
export DEEPSEEK_API_KEY="..."
```

### 配置中的环境变量替换

在任何配置字符串值中使用 `${VAR_NAME}` 引用环境变量：

```json
{
  "models": {
    "providers": {
      "kimi": {
        "apiKey": "${KIMI_API_KEY}",
        "baseUrl": "https://api.moonshot.cn/v1"
      }
    }
  }
}
```

规则：
- 仅匹配大写字母名称：`[A-Z_][A-Z0-9_]*`
- 缺失/空变量会在加载时抛出错误
- 使用 `$${VAR}` 进行字面量转义

## 配置文件位置

| 用途 | 位置 |
|------|------|
| 配置文件 | `~/.config/xopcbot/config.json` |
| 工作区 | `~/.xopcbot/workspace/` |
| 会话数据 | `~/.xopcbot/workspace/sessions/` |

## 验证配置

运行命令检查配置：

```bash
# 测试提供商连接
npm run dev -- agent -m "Hello"

# 列出定时任务
npm run dev -- cron list
```

## 常见问题

### Q: 修改配置后需要重启吗？

是的，修改 `config.json` 后需要重启服务。

### Q: 如何使用多个提供商？

在 `models.providers` 中配置多个提供商，agent 会根据模型名称自动选择：

```json
{
  "models": {
    "providers": {
      "openai": { "apiKey": "${OPENAI_API_KEY}" },
      "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}" }
    }
  }
}
```

设置不同模型以使用不同提供商。

### Q: API Key 安全性

- 不要将配置文件提交到 Git
- 使用环境变量存储敏感信息
- 配置文件权限应设为 600

### modelsDev

models.dev 集成配置。models.dev 是一个综合性的开源 AI 模型规格数据库。

```json
{
  "modelsDev": {
    "enabled": true
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 启用/禁用 models.dev 模型数据 |

启用后，xopcbot 会自动从内置的本地缓存加载模型信息。

## 从旧配置迁移

### 旧格式（已弃用）
```json
{
  "providers": {
    "kimi": { "apiKey": "sk-xxx", "baseUrl": "..." }
  }
}
```

### 新格式（OpenClaw 风格）
```json
{
  "models": {
    "providers": {
      "kimi": {
        "apiKey": "${KIMI_API_KEY}",
        "baseUrl": "https://api.moonshot.cn/v1",
        "api": "anthropic-messages",
        "models": [{ "id": "kimi-k2.5", "name": "Kimi K2.5" }]
      }
    }
  }
}
```

详见 [models-config.md](./models-config.md) 迁移指南。
