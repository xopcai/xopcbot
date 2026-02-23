# OpenClaw-Style Model Configuration

## New Config Format

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

## API Types

- `openai-completions` - OpenAI Chat Completions API
- `openai-responses` - OpenAI Responses API
- `anthropic-messages` - Anthropic Messages API
- `google-generative-ai` - Google Generative AI API
- `github-copilot` - GitHub Copilot API
- `bedrock-converse-stream` - Amazon Bedrock

## Environment Variables

Use `${VAR_NAME}` syntax in config values:
```json
{
  "apiKey": "${KIMI_API_KEY}"
}
```

## Model Aliases

Define aliases in `agents.defaults.models`:
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

Then use the alias:
```json
{
  "model": { "primary": "kimi" }
}
```

## Migration from Old Config

### Old Format
```json
{
  "providers": {
    "kimi": { "apiKey": "sk-xxx", "baseUrl": "..." }
  }
}
```

### New Format
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
