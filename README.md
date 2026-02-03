# xopcbot

<div align="center">
  <h1>🐈 xopcbot: Ultra-Lightweight Personal AI Assistant</h1>
  <p>
    <a href="#">![npm](https://img.shields.io/npm/v/xopcbot)</a>
    <a href="#">![node](https://img.shields.io/node/v/xopcbot)</a>
    <a href="#">![license](https://img.shields.io/license/MIT)</a>
    <a href="#">![lint](https://img.shields.io/badge/lint-0%20errors-green)</a>
  </p>
</div>

**xopcbot** is an **ultra-lightweight** personal AI assistant, a Node.js + TypeScript port of [nanobot](https://github.com/HKUDS/nanobot).

⚡️ Delivers core agent functionality in just **~2,800** lines of code.

## Features

🪶 **Ultra-Lightweight**: ~2,800 lines of TypeScript code  
🔬 **Research-Ready**: Clean, readable, well-documented code  
⚡️ **Lightning Fast**: Node.js 22 + TypeScript  
💎 **Easy-to-Use**: Simple CLI commands  
🔧 **Type-Safe**: Full TypeScript with ESLint  

## Quick Start

### Install

```bash
git clone https://github.com/yourusername/xopcbot.git
cd xopcbot
npm install
```

### Onboard

```bash
npm run dev -- onboard
```

### Configure

Edit `~/.xopcbot/config.json`:

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-xxx"
    }
  },
  "agents": {
    "defaults": {
      "model": "anthropic/claude-opus-4-5"
    }
  }
}
```

### Chat

```bash
# Single message
npm run dev -- agent -m "What is 2+2?"

# Interactive mode
npm run dev -- agent -i
```

### Start Gateway (with channels)

```bash
npm run dev -- gateway --port 18790
```

## Commands

| Command | Description |
|---------|-------------|
| `onboard` | Initialize config and workspace |
| `agent -m "..."` | Chat with agent |
| `agent -i` | Interactive chat mode |
| `gateway` | Start HTTP gateway server |
| `cron list` | List scheduled tasks |
| `cron add --schedule "0 9 * * *" --message "Good morning"` | Add task |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22.x |
| Language | TypeScript 5.x |
| CLI | Commander |
| LLM SDK | OpenAI + Anthropic SDK |
| Validation | Zod |
| Telegram | node-telegram-bot-api |
| WhatsApp | Baileys (placeholder) |
| HTTP Server | Native http module |
| Linting | TypeScript-ESLint |

## Architecture

```
xopcbot/
├── src/
│   ├── agent/          # 🧠 Core agent logic
│   │   ├── loop.ts     #   Agent loop (LLM ↔ tools)
│   │   ├── context.ts  #   Context builder
│   │   ├── memory.ts   #   Memory system
│   │   ├── subagent.ts #   Background tasks
│   │   └── tools/      #   Built-in tools
│   ├── bus/            # 🚌 Message routing
│   ├── channels/       # 📱 Chat channels
│   ├── cli/            # 🖥️ Commands
│   ├── config/         # ⚙️ Configuration
│   ├── cron/           # ⏰ Scheduled tasks
│   ├── heartbeat/      # 💓 Proactive wake-up
│   ├── providers/      # 🤖 LLM providers
│   ├── session/        # 💬 Conversations
│   └── types/          # 📝 TypeScript types
```

## Development

```bash
# Run (no compile needed)
npm run dev -- <command>

# Lint
npm run lint

# Test (coming soon)
npm run test
```

## Configuration

See [`.env.example`](.env.example) for available options.

## License

MIT
