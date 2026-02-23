# Configuration Reference

All xopcbot configuration is centralized in the `~/.config/xopcbot/config.json` file.

## Full Configuration Example

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

## Configuration Options

### agents

Default configuration for agents.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `workspace` | string | `~/.xopcbot/workspace` | Workspace directory |
| `model` | string / object | `anthropic/claude-sonnet-4-5` | Default model |
| `models` | object | `{}` | Model aliases map |
| `imageModel` | string / object | - | Image/Vision model config |
| `max_tokens` | number | `8192` | Maximum output tokens |
| `temperature` | number | `0.7` | Temperature parameter (0-2) |
| `max_tool_iterations` | number | `20` | Maximum tool call iterations |

### agents.defaults.model

Model configuration supports two formats:

**Simple format (single model):**
```json
{
  "agents": {
    "defaults": {
      "model": "anthropic/claude-sonnet-4-5"
    }
  }
}
```

**Full format (primary + fallbacks):**
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

| Field | Type | Description |
|-------|------|-------------|
| `primary` | string | Primary model (provider/model format) |
| `fallbacks` | string[] | Fallback models, used when primary fails |

#### Model Fallback Mechanism

When the primary model fails, xopcbot automatically tries fallback models:

1. **Supported failure types**:
   - `auth` - Authentication failure (401, 403)
   - `rate_limit` - Rate limit exceeded (429)
   - `billing` - Billing/quota issues (402)
   - `timeout` - Request timeout
   - `format` - Request format error (400)

2. **Fallback flow**:
   - Primary model call fails
   - Detect failure reason
   - Try fallbacks in order
   - Return result if any succeeds
   - Throw error if all fail

3. **Example configuration**:
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

Model ID formats:
- **Short format**: `gpt-4o` (uses default provider)
- **Full format**: `anthropic/claude-sonnet-4-5`

### agents.defaults.models

Model aliases configuration. Map full model IDs to short aliases.

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

After defining aliases, you can use them:
```json
{
  "model": { "primary": "kimi" }
}
```

### agents.defaults.imageModel

Configuration for image/vision model used in image understanding tasks.

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

### models (OpenClaw-style)

LLM provider configuration in OpenClaw format.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | string | `merge` | Merge or replace built-in providers |
| `providers` | object | `{}` | Provider configurations |

#### Provider Configuration

Each provider under `models.providers`:

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

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | string | API base URL |
| `apiKey` | string | API key (supports `${ENV_VAR}` syntax) |
| `api` | string | API type: `openai-completions`, `anthropic-messages`, etc. |
| `models` | array | Model definitions |

#### API Types

- `openai-completions` - OpenAI Chat Completions API
- `openai-responses` - OpenAI Responses API
- `anthropic-messages` - Anthropic Messages API
- `google-generative-ai` - Google Generative AI API
- `github-copilot` - GitHub Copilot API
- `bedrock-converse-stream` - Amazon Bedrock

#### Model Definition

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string | - | Model ID |
| `name` | string | - | Display name |
| `reasoning` | boolean | `false` | Supports reasoning/thinking |
| `input` | array | `["text"]` | Input modalities: `text`, `image` |
| `cost` | object | `{0,0,0,0}` | Pricing per 1M tokens |
| `contextWindow` | number | `128000` | Context window size |
| `maxTokens` | number | `16384` | Max output tokens |

### channels

Communication channel configurations.

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

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable channel |
| `token` | string | Bot Token |
| `allow_from` | string[] | Whitelist users |

Get Token: [@BotFather](https://t.me/BotFather)

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

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable channel |
| `bridge_url` | string | WA Bridge WebSocket URL |
| `allow_from` | string[] | Whitelist users |

### gateway

REST gateway configuration.

```json
{
  "gateway": {
    "host": "0.0.0.0",
    "port": 18790
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `host` | string | Bind address |
| `port` | number | Port number |

### tools

Built-in tool configurations.

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

## Environment Variables

Configuration can also be set via environment variables, which override config file:

| Config | Environment Variable |
|--------|---------------------|
| OpenAI API Key | `OPENAI_API_KEY` |
| Anthropic API Key | `ANTHROPIC_API_KEY` |
| OpenRouter API Key | `OPENROUTER_API_KEY` |
| Groq API Key | `GROQ_API_KEY` |
| Google API Key | `GOOGLE_API_KEY` |
| MiniMax API Key | `MINIMAX_API_KEY` |
| DeepSeek API Key | `DEEPSEEK_API_KEY` |
| Brave Search API Key | `BRAVE_API_KEY` |
| Telegram Bot Token | `TELEGRAM_BOT_TOKEN` |

Example:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export MINIMAX_API_KEY="..."
export DEEPSEEK_API_KEY="..."
```

### Env Var Substitution in Config

Reference env vars in any config string value with `${VAR_NAME}`:

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

Rules:
- Only uppercase names matched: `[A-Z_][A-Z0-9_]*`
- Missing/empty vars throw an error at load time
- Escape with `$${VAR}` for literal output

## Config File Locations

| Purpose | Location |
|---------|----------|
| Config file | `~/.config/xopcbot/config.json` |
| Workspace | `~/.xopcbot/workspace/` |
| Session data | `~/.xopcbot/workspace/sessions/` |

## Verify Configuration

Run commands to test configuration:

```bash
# Test provider connection
npm run dev -- agent -m "Hello"

# List cron jobs
npm run dev -- cron list
```

## FAQ

### Q: Need to restart after config changes?

Yes, restart the service after modifying config.json.

### Q: How to use multiple providers?

Configure multiple providers in `models.providers`, agent automatically selects based on model name:

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

Set different models to use different providers.

### Q: API Key Security

- Don't commit config files to Git
- Use environment variables for sensitive data
- Set config file permissions to 600

### modelsDev

Models.dev integration configuration. models.dev provides a comprehensive database of open-source AI model specifications.

```json
{
  "modelsDev": {
    "enabled": true
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable models.dev model data |

When enabled, xopcbot automatically loads model information from the built-in local cache.

## Migration from Old Config

### Old Format (Deprecated)
```json
{
  "providers": {
    "kimi": { "apiKey": "sk-xxx", "baseUrl": "..." }
  }
}
```

### New Format (OpenClaw-style)
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

See [models-config.md](./models-config.md) for detailed migration guide.
