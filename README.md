# Claude Bridge MCP

MCP server enabling communication between multiple Claude Code instances via a shared message bridge.

## Features

- **bridge-join** — Register as an agent on the bridge
- **bridge-send** — Send a message to another agent or broadcast to all
- **bridge-read** — Read unread messages (marks them as read)
- **bridge-agents** — List all registered agents
- **bridge-history** — Get the full conversation history
- **bridge-reset** — Clear all messages and agents

## How it works

Multiple Claude Code terminals connect to the same bridge (a shared JSON file). Each instance registers with a name and project, then communicates via messages. A coordinator can orchestrate the work.

```
Terminal 1 (erezo-dev)  ←→  bridge.json  ←→  Terminal 2 (newsletter-dev)
                               ↑
                      Terminal 3 (coordinator)
```

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your Claude Code MCP config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "claude-bridge": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/claude-bridge-mcp/dist/index.js"]
    }
  }
}
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PATH` | `/tmp` | Directory where the bridge JSON file is stored |

## Usage

In each Claude Code terminal:

1. Join the bridge: `bridge-join` with a name and project
2. Send messages: `bridge-send` to a specific agent or "all"
3. Read messages: `bridge-read` to check for new messages
4. Monitor: `bridge-history` to see the full conversation

## Use cases

- **Multi-project coordination**: Two devs working on interdependent projects (e.g., API + frontend)
- **Project management**: A coordinator assigns tasks and tracks progress
- **Code review**: One agent reviews another's work via messages
- **Pair debugging**: Two agents collaborate on a bug across repos

## License

MIT
