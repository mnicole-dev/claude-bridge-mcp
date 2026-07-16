import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  openSync,
  closeSync,
  writeSync,
  statSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';

const BRIDGE_FILE = join(process.env.BRIDGE_PATH || '/tmp', 'claude-bridge.json');
const LOCK_FILE = `${BRIDGE_FILE}.lock`;
const LOCK_TIMEOUT_MS = 5000;
const STALE_LOCK_MS = 10000;
const RETENTION_DAYS = Number(process.env.BRIDGE_RETENTION_DAYS || 7);

export interface Message {
  id: number;
  from: string;
  to: string | 'all';
  content: string;
  timestamp: string;
  read: boolean;
}

export interface Agent {
  name: string;
  project: string;
  joinedAt: string;
  iterm_session?: string;
}

export interface BridgeState {
  agents: Record<string, Agent>;
  messages: Message[];
  nextId: number;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Acquire an exclusive lock via atomic file creation (O_EXCL). Busy-waits with a stale-lock timeout. */
function acquireLock(): void {
  const start = Date.now();
  while (true) {
    try {
      const fd = openSync(LOCK_FILE, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
        if (age > STALE_LOCK_MS) {
          unlinkSync(LOCK_FILE);
          continue;
        }
      } catch {
        continue; // lock file vanished between checks, retry immediately
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error('Could not acquire bridge lock (timeout, possibly a stale lock)');
      }
      sleep(20);
    }
  }
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // already gone
  }
}

export function loadState(): BridgeState {
  if (existsSync(BRIDGE_FILE)) {
    return JSON.parse(readFileSync(BRIDGE_FILE, 'utf-8'));
  }
  return { agents: {}, messages: [], nextId: 1 };
}

/** Write via temp file + rename so concurrent readers never see a partially written file. */
function saveState(state: BridgeState): void {
  const tmpFile = `${BRIDGE_FILE}.tmp.${process.pid}`;
  writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  renameSync(tmpFile, BRIDGE_FILE);
}

/** Drop read messages older than the retention window, so the file doesn't grow unbounded. */
export function purgeOldMessages(state: BridgeState): void {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  state.messages = state.messages.filter(
    (m) => !m.read || new Date(m.timestamp).getTime() > cutoff,
  );
}

/** Run a mutation against the bridge state under an exclusive lock, then persist it. */
export function withState<T>(mutator: (state: BridgeState) => T): T {
  acquireLock();
  try {
    const state = loadState();
    purgeOldMessages(state);
    const result = mutator(state);
    saveState(state);
    return result;
  } finally {
    releaseLock();
  }
}
