# Claude Bridge MCP

MCP server enabling communication between multiple Claude Code instances via a shared message bridge.

## Features

- **bridge-join** — Register as an agent on the bridge
- **bridge-rename** — Rename your agent identity, preserving project, join date, and message history
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

## Auto-connect hook (optional)

Instead of calling `bridge-join` manually in every terminal, a `UserPromptSubmit` hook
(`hooks/bridge-connect.sh`) auto-registers the current directory as an agent the first
time you send a prompt in a session. It skips re-joining on later prompts of the same
session (tracked via a marker file in `/tmp`).

By default the agent name is derived from the folder: `{folder}-dev`.

### Installing the hook

```bash
cp hooks/bridge-connect.sh ~/.claude/hooks/bridge-connect.sh
chmod +x ~/.claude/hooks/bridge-connect.sh
```

Then register it in `~/.claude/settings.json` under the `UserPromptSubmit` hook:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/bridge-connect.sh"
          }
        ]
      }
    ]
  }
}
```

### Custom agent name via `.bridge`

To use a name other than `{folder}-dev`, drop a `.bridge` file at the root of the
working directory the session starts in:

```
name=Rathilde
```

The hook picks up `name=` from this file and uses it as-is instead of the folder-derived
default. This is useful for a persistent per-project persona name that survives across
sessions and folder renames.

## Usage

In each Claude Code terminal:

1. Join the bridge: `bridge-join` with a name and project (or let the auto-connect hook do it)
2. Send messages: `bridge-send` to a specific agent or "all"
3. Read messages: `bridge-read` to check for new messages
4. Monitor: `bridge-history` to see the full conversation
5. Rename: `bridge-rename` to switch your agent identity without losing history

## Use cases

- **Multi-project coordination**: Two devs working on interdependent projects (e.g., API + frontend)
- **Project management**: A coordinator assigns tasks and tracks progress
- **Code review**: One agent reviews another's work via messages
- **Pair debugging**: Two agents collaborate on a bug across repos

## License

MIT
