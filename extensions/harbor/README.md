# Harbor Extension for xopcbot

📊 Run Harbor benchmark evaluations (Terminal-Bench-2.0, SWE-Bench, etc.) directly from xopcbot.

## Features

- **Run Benchmarks**: Execute Harbor evaluations with simple commands
- **List Datasets**: View available benchmark datasets
- **Track Progress**: Monitor running evaluations in real-time
- **Get Results**: Retrieve detailed evaluation results with pass rates

## Installation

### Prerequisites

1. **Python 3.11+**
2. **Harbor CLI**: `uv tool install harbor` or `pip install harbor`

### Enable Extension

Add to your xopcbot config (`~/.xopcbot/config.json` or workspace config):

```json
{
  "extensions": {
    "enabled": ["harbor"],
    "harbor": {
      "pythonPath": "python3",
      "maxConcurrentRuns": 5,
      "defaultProvider": "docker"
    }
  }
}
```

## Usage

### Tools (for AI Agent)

The extension provides these tools that xopcbot can use:

| Tool | Description |
|------|-------------|
| `harbor_run` | Run a benchmark evaluation |
| `harbor_datasets` | List available datasets |
| `harbor_status` | Check run status |
| `harbor_results` | Get evaluation results |

### Commands (for Users)

```bash
# Start evaluation
/harbor run terminal-bench@2.0 --agent xopcbot --model bailian/qwen3.5-plus

# List datasets
/harbor datasets

# Check status
/harbor status <runId>

# Get results
/harbor results <runId> --include-logs

# Stop running evaluation
/harbor stop <runId>

# Help
/harbor help
```

### Example: Evaluate xopcbot

1. **Start evaluation**:
   ```
   /harbor run terminal-bench@2.0 --agent xopcbot --model bailian/qwen3.5-plus --concurrent 4
   ```

2. **Check progress**:
   ```
   /harbor status harbor-123456-terminal-bench-2-0
   ```

3. **Get results**:
   ```
   /harbor results harbor-123456-terminal-bench-2-0 --include-logs
   ```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pythonPath` | string | `python3` | Python interpreter path |
| `maxConcurrentRuns` | number | `5` | Maximum concurrent Harbor runs |
| `defaultProvider` | string | `docker` | Default environment provider |

## Supported Datasets

- `terminal-bench@2.0` - Terminal-Bench 2.0 (official)
- `swe-bench` - SWE-Bench for software engineering
- `aider-polyglot` - Aider Polyglot benchmark
- More via `harbor datasets list`

## Supported Providers

- **docker** (default) - Local Docker containers
- **daytona** - Daytona cloud provider
- **modal** - Modal cloud provider
- **e2b** - E2B cloud provider

## Development

```bash
cd extensions/harbor

# Install dependencies
pnpm install

# Build
pnpm run build

# Test
pnpm run test

# Develop (watch mode)
pnpm run dev
```

## License

MIT
