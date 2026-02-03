# xopcbot

<div align="center">
  <h1>🐈 xopcbot: Ultra-Lightweight Personal AI Assistant</h1>
  <p>
    <a href="#">![npm](https://img.shields.io/npm/v/xopcbot)</a>
    <a href="#">![node](https://img.shields.io/node/v/xopcbot)</a>
    <a href="#">![license](https://img.shields.io/license/MIT)</a>
  </p>
</div>

**xopcbot** is an **ultra-lightweight** personal AI assistant, a Node.js + TypeScript port of [nanobot](https://github.com/HKUDS/nanobot).

⚡️ Delivers core agent functionality in just **~4,000** lines of code.

## Features

🪶 **Ultra-Lightweight**: Just ~4,000 lines of code  
🔬 **Research-Ready**: Clean, readable code  
⚡️ **Lightning Fast**: Node.js 22 + TypeScript  
💎 **Easy-to-Use**: Simple CLI commands

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

# Interactive
npm run dev -- agent -i
```

## Architecture

```
xopcbot/
├── src/
│   ├── agent/          # 🧠 Core agent logic
│   ├── bus/            # 🚌 Message routing
│   ├── channels/       # 📱 Chat channels
│   ├── cli/            # 🖥️ Commands
│   ├── config/         # ⚙️ Configuration
│   ├── providers/      # 🤖 LLM providers
│   ├── session/        # 💬 Sessions
│   └── types/          # 📝 TypeScript types
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22.x |
| Language | TypeScript 5.x |
| HTTP Framework | Hono 4.x |
| LLM SDK | OpenAI + Anthropic SDK |
| Validation | Zod |
| CLI | Commander |
| Telegram | node-telegram-bot-api |
| WhatsApp | Baileys |

## License

MIT
