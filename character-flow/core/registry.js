/**
 * core/registry.js — slash-command registry for the swordcli agent.
 *
 * Commands live in a Map keyed by lowercase name. Each entry may declare
 * aliases (also lowercased, each alias independently runnable). Handlers are
 * async: handler(args, ctx) → string to print. ctx is injected by the caller:
 *   { config, bus, agentLoader }
 */

export const commands = new Map();

/**
 * Register a command (idempotent: re-registering replaces the entry).
 * @param {{name: string, description: string, handler: (args: string[], ctx: object) => Promise<string|void>|string|void, aliases?: string[]}} def
 */
export function register({ name, description, handler, aliases = [] }) {
  const lowerName = String(name).toLowerCase();
  const lowerAliases = [...new Set((aliases ?? []).map((alias) => String(alias).toLowerCase()))];

  // Drop stale alias entries that previously pointed at this command
  // (matters when a command is re-registered with different aliases).
  for (const [key, entry] of [...commands]) {
    if (entry?.isAlias && entry.aliasFor === lowerName) commands.delete(key);
  }

  commands.set(lowerName, {
    name: lowerName,
    description: description ?? '',
    handler,
    aliases: lowerAliases
  });

  // Wire alias lookup without duplicating the handler description.
  for (const alias of lowerAliases) {
    commands.set(alias, {
      name: lowerName,
      description: description ?? '',
      handler,
      aliases: lowerAliases.filter((a) => a !== alias),
      isAlias: true,
      aliasFor: lowerName
    });
  }
}

/**
 * Resolve an alias entry to its canonical command.
 */
function canonical(entry) {
  if (!entry) return null;
  if (entry.isAlias) return { ...entry, name: entry.aliasFor ?? entry.name };
  return entry;
}

/**
 * Execute a command line like '/help extra words' or '/tools'.
 * First token is matched case-insensitively (with or without leading slash).
 * @param {string} input raw user input
 * @param {{config: object, bus: object, agentLoader: object}} ctx injected context
 * @returns {Promise<string|null>} handler output, or an error hint string
 */
export async function run(input, ctx) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed || !trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).trim().split(/\s+/);
  const [name, ...args] = parts;
  const lookup = String(name || '').toLowerCase();
  if (!lookup) return null;

  const entry = canonical(commands.get(lookup));
  if (!entry) {
    return `Unknown command: /${name}. Type /help for the command list.`;
  }

  try {
    return (await entry.handler(args, ctx)) ?? '';
  } catch (err) {
    console.error(err);
    return `Error running /${entry.name}: ${err?.message ?? err}`;
  }
}

/**
 * Command names + aliases matching a prefix (case-insensitive), sorted.
 * @param {string} prefix
 * @returns {string[]}
 */
export function completions(prefix = '') {
  const lower = String(prefix ?? '').toLowerCase();
  const matches = new Set();
  for (const entry of commands.values()) {
    const candidates = entry.isAlias ? [entry.name, ...entry.aliases] : [entry.name, ...entry.aliases];
    for (const candidate of candidates) {
      if (lower === '' || candidate.startsWith(lower)) matches.add(candidate);
    }
  }
  return [...matches].sort();
}

/**
 * Formatted table of all canonical commands: name + description.
 * @returns {string}
 */
export function list() {
  const seen = new Set();
  const rows = [];
  for (const entry of commands.values()) {
    const canon = canonical(entry);
    if (!canon || seen.has(canon.name)) continue;
    seen.add(canon.name);
    const shown = canon.aliases?.length ? `${canon.name} (${canon.aliases.join(', ')})` : canon.name;
    rows.push({ name: shown, description: canon.description });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const width = Math.max(8, ...rows.map((row) => row.name.length));
  return rows
    .map((row) => `  ${row.name.padEnd(width)}  ${row.description}`)
    .join('\n');
}
