#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BRIDGE_FILE = join(process.env.BRIDGE_PATH || '/tmp', 'claude-bridge.json');

interface Message {
  id: number;
  from: string;
  to: string | 'all';
  content: string;
  timestamp: string;
  read: boolean;
}

interface BridgeState {
  agents: Record<string, { name: string; project: string; joinedAt: string }>;
  messages: Message[];
  nextId: number;
}

function loadState(): BridgeState {
  if (existsSync(BRIDGE_FILE)) {
    return JSON.parse(readFileSync(BRIDGE_FILE, 'utf-8'));
  }
  return { agents: {}, messages: [], nextId: 1 };
}

function saveState(state: BridgeState): void {
  writeFileSync(BRIDGE_FILE, JSON.stringify(state, null, 2));
}

const server = new McpServer({
  name: 'claude-bridge',
  version: '1.0.0',
});

// --- Register as an agent ---
server.tool(
  'bridge-join',
  'Register this Claude instance as an agent on the bridge. Call this first.',
  {
    name: z.string().describe('Your agent name (e.g., "louis", "backend-dev", "frontend-dev")'),
    project: z.string().describe('The project you are working on (e.g., "erezo", "emapack")'),
  },
  async ({ name, project }) => {
    const state = loadState();
    state.agents[name] = { name, project, joinedAt: new Date().toISOString() };
    saveState(state);
    const others = Object.values(state.agents)
      .filter((a) => a.name !== name)
      .map((a) => `- **${a.name}** (${a.project})`)
      .join('\n');
    return {
      content: [
        {
          type: 'text' as const,
          text: `Registered as **${name}** on project **${project}**.\n\n${others ? `Other agents online:\n${others}` : 'No other agents online yet.'}`,
        },
      ],
    };
  },
);

// --- Send a message ---
server.tool(
  'bridge-send',
  'Send a message to another agent or broadcast to all.',
  {
    from: z.string().describe('Your agent name'),
    to: z.string().describe('Recipient agent name, or "all" to broadcast'),
    message: z.string().describe('The message content'),
  },
  async ({ from, to, message }) => {
    const state = loadState();
    const msg: Message = {
      id: state.nextId++,
      from,
      to,
      content: message,
      timestamp: new Date().toISOString(),
      read: false,
    };
    state.messages.push(msg);
    saveState(state);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Message #${msg.id} sent to **${to}**`,
        },
      ],
    };
  },
);

// --- Read messages ---
server.tool(
  'bridge-read',
  'Read unread messages addressed to you (or broadcast). Marks them as read.',
  {
    name: z.string().describe('Your agent name'),
    includeRead: z.boolean().optional().describe('Include already-read messages (default: false)'),
  },
  async ({ name, includeRead }) => {
    const state = loadState();
    const msgs = state.messages.filter(
      (m) =>
        (m.to === name || m.to === 'all') &&
        m.from !== name &&
        (includeRead || !m.read),
    );

    // Mark as read
    for (const m of msgs) {
      if (m.to === name) m.read = true;
    }
    saveState(state);

    if (msgs.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No new messages.' }],
      };
    }

    const formatted = msgs
      .map(
        (m) =>
          `**#${m.id}** [${m.timestamp.slice(11, 19)}] **${m.from}** → ${m.to === 'all' ? 'all' : 'you'}:\n${m.content}`,
      )
      .join('\n\n---\n\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: `${msgs.length} message(s):\n\n${formatted}`,
        },
      ],
    };
  },
);

// --- List agents ---
server.tool(
  'bridge-agents',
  'List all registered agents on the bridge.',
  {},
  async () => {
    const state = loadState();
    const agents = Object.values(state.agents);
    if (agents.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No agents registered.' }],
      };
    }
    const list = agents
      .map((a) => `- **${a.name}** — projet: ${a.project} (depuis ${a.joinedAt.slice(0, 16)})`)
      .join('\n');
    return {
      content: [{ type: 'text' as const, text: `Agents connectés:\n${list}` }],
    };
  },
);

// --- Get conversation history ---
server.tool(
  'bridge-history',
  'Get the full conversation history between agents.',
  {
    limit: z.number().optional().describe('Number of recent messages to return (default: 50)'),
  },
  async ({ limit }) => {
    const state = loadState();
    const msgs = state.messages.slice(-(limit || 50));
    if (msgs.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No messages yet.' }],
      };
    }
    const formatted = msgs
      .map(
        (m) =>
          `**#${m.id}** [${m.timestamp.slice(11, 19)}] **${m.from}** → **${m.to}**: ${m.content}`,
      )
      .join('\n');
    return {
      content: [{ type: 'text' as const, text: formatted }],
    };
  },
);

// --- Clear bridge (reset) ---
server.tool(
  'bridge-reset',
  'Clear all messages and agents. Use with caution.',
  {},
  async () => {
    saveState({ agents: {}, messages: [], nextId: 1 });
    return {
      content: [{ type: 'text' as const, text: 'Bridge reset. All messages and agents cleared.' }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
