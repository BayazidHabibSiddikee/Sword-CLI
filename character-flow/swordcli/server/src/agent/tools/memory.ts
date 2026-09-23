import { getDb } from '../../db/index.js';
import type { AgentTool } from '../types.js';

const argText = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? (args[key] as string) : undefined;

/** Cross-session long-term memory: persistent facts the agent has learned
 *  (user preferences, project conventions, decisions). Lives in
 *  `agent_memories` and is auto-recalled into the system prompt of every
 *  session. */
export const memoryTools: AgentTool[] = [
  {
    name: 'add_memory',
    description:
      'Persist a durable fact to long-term memory so future sessions can recall it. Save user preferences, project conventions, and important decisions. Do NOT save transient task state, code details, or anything already in the repo.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'A single self-contained fact, written so it makes sense out of context' },
      },
      required: ['text'],
    },
    source: 'builtin',
    async execute(args) {
      const text = argText(args, 'text');
      if (!text || !text.trim()) return { ok: false, text: 'add_memory: "text" is required' };
      getDb().prepare('INSERT INTO agent_memories (text) VALUES (?)').run(text.trim());
      return { ok: true, text: 'Memory saved.' };
    },
  },
  {
    name: 'recall_memories',
    description:
      'List the agent\'s long-term memories. Pass a query to filter by substring (case-insensitive).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional substring to filter by' },
      },
    },
    source: 'builtin',
    async execute(args) {
      const q = argText(args, 'query');
      const db = getDb();
      const rows = q
        ? (db
            .prepare('SELECT text FROM agent_memories WHERE text LIKE ? ORDER BY id DESC LIMIT 50')
            .all(`%${q}%`) as { text: string }[])
        : (db.prepare('SELECT text FROM agent_memories ORDER BY id DESC LIMIT 50').all() as { text: string }[]);
      if (rows.length === 0) return { ok: true, text: q ? `No memories matching "${q}".` : 'No memories yet.' };
      return { ok: true, text: rows.map((r) => r.text).join('\n') };
    },
  },
];

/** Load the full memory bank (capped) for injection into the system prompt. */
export function loadMemoryPromptBlock(limit = 50): string {
  const db = getDb();
  const rows: { text: string }[] = db
    .prepare('SELECT text FROM agent_memories ORDER BY id DESC LIMIT ?')
    .all(limit) as { text: string }[];
  if (rows.length === 0) return '';
  return `## Long-term memory\nThe agent remembers the following across sessions:\n${rows
    .map((r) => `- ${r.text}`)
    .join('\n')}`;
}
