// Job-based tool gating for the Business meeting chat.
//
// Principle (learned from the marin OS tool-calling design): tools are NOT for
// everyone — a character gets exactly the tools its job requires, nothing
// more. A CFO has no business running code; an Engineer has no business
// reading nothing. Roles absent from ROLE_TOOL_GRANTS are tool-less and their
// prompt never mentions tools, so the model cannot hallucinate calls.
import { hybridSearch } from '../services/rag.js';

export interface ToolDef {
  name: string;
  description: string;
  /** Sensitive tools would require explicit user confirmation before execution. */
  sensitive?: boolean;
  run: (args: any) => Promise<unknown> | unknown;
}

export const TOOL_CATALOG: ToolDef[] = [
  {
    name: 'rag_search',
    description:
      'Search the team knowledge library (hybrid BM25 + embeddings). Args: { "query": string }. Returns ranked excerpts with source document names.',
    run: (args) => {
      const query = String(args?.query || '').trim();
      if (!query) throw new Error('query must be a non-empty string');
      return hybridSearch(query, Math.min(10, Math.max(1, Number(args?.top_k) || 4)));
    },
  },
];

// Which jobs get which tools. Absence = no tools at all.
export const ROLE_TOOL_GRANTS: Record<string, string[]> = {
  'eng-lead': ['rag_search'],
  cto: ['rag_search'],
  product: ['rag_search'],
  pm: ['rag_search'],
};

export function toolsForRole(roleId: string | null | undefined): ToolDef[] {
  if (!roleId) return [];
  const granted = ROLE_TOOL_GRANTS[roleId];
  if (!granted || granted.length === 0) return [];
  const byName = new Map(TOOL_CATALOG.map((t) => [t.name, t]));
  // Only tools that exist in the catalog can be granted — never more.
  return granted.flatMap((name) => (byName.has(name) ? [byName.get(name)!] : []));
}

/** Build the system-prompt tool block for a role ('' when the role has none). */
export function buildToolBlock(roleId: string | null | undefined): string {
  const tools = toolsForRole(roleId);
  if (tools.length === 0) return '';
  const catalog = tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
  return (
    `\n\n[Tools available to your role]\n${catalog}\n` +
    `To use one, reply with ONLY a JSON object (optionally fenced as json):\n` +
    `{"tool":"<name>","args":{...}}\n` +
    `The system will run it and return the result; otherwise answer directly in plain text.`
  );
}

/**
 * Parse an optional tool call from a model reply.
 * Accepts {"tool":..., "args":{...}} bare or inside a ```json fence.
 * Anything else (normal speech, arrays, missing args) is NOT a call — this
 * mirrors marin's non-greedy structural validation so prose is never mistaken
 * for a plan.
 */
export function parseToolCall(text: string | null | undefined): { tool: string; args: Record<string, unknown> } | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const candidates: string[] = [];
  if (fenced) candidates.push(fenced[1]);
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) candidates.push(bare[0]);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)
        && typeof obj.tool === 'string'
        && obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)) {
        return { tool: obj.tool, args: obj.args };
      }
    } catch { /* not JSON — keep looking */ }
  }
  return null;
}
