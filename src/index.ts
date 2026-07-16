#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadState, withState, type Message } from './state.js';

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
    const text = withState((state) => {
      const existing = state.agents[name];
      if (existing && existing.project !== project) {
        return `**${name}** is already registered for project **${existing.project}**. Choose a different name, or use bridge-rename if this is a takeover.`;
      }
      state.agents[name] = { name, project, joinedAt: new Date().toISOString() };
      const others = Object.values(state.agents)
        .filter((a) => a.name !== name)
        .map((a) => `- **${a.name}** (${a.project})`)
        .join('\n');
      return `Registered as **${name}** on project **${project}**.\n\n${others ? `Other agents online:\n${others}` : 'No other agents online yet.'}`;
    });
    return { content: [{ type: 'text' as const, text }] };
  },
);

// --- Rename an agent ---
server.tool(
  'bridge-rename',
  'Rename your agent identity on the bridge, preserving your project, join date, and message history.',
  {
    oldName: z.string().describe('Your current agent name'),
    newName: z.string().describe('The new agent name to switch to'),
  },
  async ({ oldName, newName }) => {
    const text = withState((state) => {
      const agent = state.agents[oldName];
      if (!agent) {
        return `No agent named **${oldName}** found.`;
      }
      if (state.agents[newName]) {
        return `**${newName}** is already taken by another agent.`;
      }
      delete state.agents[oldName];
      state.agents[newName] = { ...agent, name: newName };
      for (const m of state.messages) {
        if (m.from === oldName) m.from = newName;
        if (m.to === oldName) m.to = newName;
      }
      return `Renamed **${oldName}** → **${newName}**. Message history preserved.`;
    });
    return { content: [{ type: 'text' as const, text }] };
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
    const id = withState((state) => {
      const msg: Message = {
        id: state.nextId++,
        from,
        to,
        content: message,
        timestamp: new Date().toISOString(),
        read: false,
      };
      state.messages.push(msg);
      return msg.id;
    });
    return {
      content: [{ type: 'text' as const, text: `Message #${id} sent to **${to}**` }],
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
    const text = withState((state) => {
      const msgs = state.messages.filter(
        (m) =>
          (m.to === name || m.to === 'all') &&
          m.from !== name &&
          (includeRead || !m.read),
      );

      for (const m of msgs) {
        if (m.to === name) m.read = true;
      }

      if (msgs.length === 0) {
        return 'No new messages.';
      }

      const formatted = msgs
        .map(
          (m) =>
            `**#${m.id}** [${m.timestamp.slice(11, 19)}] **${m.from}** → ${m.to === 'all' ? 'all' : 'you'}:\n${m.content}`,
        )
        .join('\n\n---\n\n');

      return `${msgs.length} message(s):\n\n${formatted}`;
    });
    return { content: [{ type: 'text' as const, text }] };
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
    withState((state) => {
      state.agents = {};
      state.messages = [];
      state.nextId = 1;
    });
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
