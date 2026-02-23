# OpenClaw 风格模型配置

## 新配置格式

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "kimi/kimi-k2.5",
        "fallbacks": ["minimax/MiniMax-M2.1"]
      },
      "models": {
        "kimi/kimi-k2.5": { "alias": "kimi" },
        "minimax/MiniMax-M2.1": { "alias": "minimax" }
      },
      "imageModel": {
        "primary": "openrouter/qwen-vl"
      }
    }
  },
  "models": {
    "mode": "merge",
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
      },
      "moonshot": {
        "baseUrl": "https://api.moonshot.ai/v1",
        "apiKey": "${MOONSHOT_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "kimi-k2.5",
            "name": "Kimi K2.5 (Global)"
          }
        ]
      }
    }
  }
}
```

## API 类型

- `openai-completions` - OpenAI Chat Completions API
- `openai-responses` - OpenAI Responses API
- `anthropic-messages` - Anthropic Messages API
- `google-generative-ai` - Google Generative AI API
- `github-copilot` - GitHub Copilot API
- `bedrock-converse-stream` - Amazon Bedrock

## 环境变量

在配置值中使用 `${VAR_NAME}` 语法：
```json
{
  "apiKey": "${KIMI_API_KEY}"
}
```

## 模型别名

在 `agents.defaults.models` 中定义别名：
```json
{
  "agents": {
    "defaults": {
      "models": {
        "kimi/kimi-k2.5": { "alias": "kimi" }
      }
    }
  }
}
```

然后使用别名：
```json
{
  "model": { "primary": "kimi" }
}
```

## 回退模型

配置多个回退模型以在主模型失败时自动切换：
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "kimi/kimi-k2.5",
        "fallbacks": [
          "minimax/MiniMax-M2.1",
          "anthropic/claude-sonnet-4-5",
          "openai/gpt-4o"
        ]
      }
    }
  }
}
```

## 图像模型配置

配置专用的视觉模型用于图像理解：
```json
{
  "agents": {
    "defaults": {
      "imageModel": {
        "primary": "openrouter/qwen/qwen-2.5-vl-72b-instruct:free",
        "fallbacks": ["openrouter/google/gemini-2.0-flash-vision:free"]
      }
    }
  }
}
```

## 从旧配置迁移

### 旧格式
```json
{
  "providers": {
    "kimi": { "apiKey": "sk-xxx", "baseUrl": "..." }
  }
}
```

### 新格式
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

## Kimi 配置示例

### 国内版 (Moonshot CN)
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

### 国际版 (Moonshot AI)
```json
{
  "models": {
    "providers": {
      "moonshot": {
        "baseUrl": "https://api.moonshot.ai/v1",
        "apiKey": "${MOONSHOT_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "kimi-k2.5",
            "name": "Kimi K2.5"
          }
        ]
      }
    }
  }
}
```
