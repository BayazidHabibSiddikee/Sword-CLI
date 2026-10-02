// External-skill discovery and loading.
//
// Scans ~/.claude/skills, ~/.opencode/skills, ~/.gemini/skills and ~/.cline/skills
// plus this repo's vendored vendor/agent-scripts/skills tree for SKILL.md files,
// parses their frontmatter, and builds:
//   - A compact index of {name: description} pairs for inclusion in the system prompt
//   - A synchronous loadSkill(name) function that reads and validates the full
//     content before returning it.
//
// Safety constraints:
//   - Symlinks are skipped (avoids dangling / traversal attacks).
//   - Files above MAX_SIZE_BYTES are rejected.
//   - Content containing obvious prompt-injection patterns is rejected.
//   - No shell execution happens; only UTF-8 reading and string matching.
//
// The compact index is deliberately concise: raw descriptions can exceed 200
// characters, so they are truncated at the first period after 160 characters.
// This keeps the combined index under ~12 KB even with ~150 skills, which fits
// comfortably inside the system-prompt budget.

import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = process.env.HOME || process.env.USERPROFILE || '';
const __dirname = dirname(fileURLToPath(import.meta.url));
// Skills vendored into this repo (steipete/agent-scripts) are discovered alongside
// the home-directory roots, so a checkout gets its openclaw-relay / telecrawl /
// whatsapp skills without a global sync step. __dirname is cli/; the tree sits at
// ../vendor/agent-scripts/skills. Missing dirs are skipped by the caller.
const VENDORED_SKILL_DIRS = [
  join(__dirname, '..', 'vendor', 'agent-scripts', 'skills'),
];
const SKILL_DIRS = [
  join(HOME, '.claude', 'skills'),
  join(HOME, '.opencode', 'skills'),
  join(HOME, '.gemini', 'skills'),
  join(HOME, '.cline', 'skills'),
  ...VENDORED_SKILL_DIRS,
];
const MAX_SIZE_BYTES = 500 * 1024; // 500 KB per file
/** Truncate descriptions at the first sentence boundary past this length. */
const DESC_MAX_LEN = 180;
/** Safety pattern — any SKILL.md matching one of these is rejected outright. */
// Intent-targeted patterns. The old list matched bare English words (OVERRIDE,
// DISREGARD, NEVER FOLLOW) anywhere in the body, so a benign line like "Override
// with env or flags when needed" silently disqualified a legitimate skill — it
// dropped 9 of the 69 vendored agent-scripts skills, including openclaw-relay.
// Each pattern now requires an instruction actually aimed at the agent.
const INJECTION_PATTERNS = [
  /\bignore (all |any )?(previous|prior|above|earlier|the) ?(instructions|prompts|rules|context)\b/i,
  /\bdisregard (all |any )?(previous|prior|above|earlier|the) ?(instructions|prompts|rules|context)\b/i,
  /\bnever follow (the |your |any )?(user|system|previous|above) ?(instructions|prompts|rules)\b/i,
  /\bforget (everything|all previous|your instructions)\b/i,
  /\byou are (no longer|now) (an? )?(unrestricted|unfiltered|different|new)\b/i,
  /\bsystem prompt override\b/i,
  /\bnew role definition\b/i,
  /\breveal (your|the) (system |hidden )?(prompt|instructions)\b/i,
];

function truncateDescription(desc) {
  if (!desc) return '';
  const s = desc.replace(/\s+/g, ' ').trim();
  if (s.length <= DESC_MAX_LEN) return s;
  const cut = s.lastIndexOf('.', Math.min(s.length, DESC_MAX_LEN + 40));
  if (cut > DESC_MAX_LEN * 0.7) return s.slice(0, cut + 1);
  return s.slice(0, DESC_MAX_LEN) + '\u2026';
}

export function looksInjected(content) {
  for (const pat of INJECTION_PATTERNS) {
    if (pat.test(content)) return true;
  }
  return false;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const obj = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    obj[line.slice(0, idx).trim()] = val;
  }
  return obj;
}

function scanDir(dirPath) {
  const entries = [];
  try {
    const names = readdirSync(dirPath, { recursive: true });
    for (const rel of names) {
      if (!rel.endsWith('/SKILL.md') && !rel.endsWith('\\SKILL.md')) continue;
      const fullPath = join(dirPath, rel);
      // Skip symlinks (including symlinked dirs).
      let st;
      try { st = lstatSync(fullPath); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.size > MAX_SIZE_BYTES) continue;
      let content;
      try { content = readFileSync(fullPath, 'utf8'); } catch { continue; }
      if (looksInjected(content)) continue;
      const meta = parseFrontmatter(content);
      if (!meta) continue;
      const name = String(meta.name || rel.split('/').pop().replace(/\.md$/, '')).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      if (!name) continue;
      entries.push({ name, desc: truncateDescription(String(meta.description || '')), source: dirPath, fullPath, size: st.size });
    }
  } catch { /* directory unreadable, skip silently */ }
  return entries;
}

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/** Clear the in-memory discovery cache (mainly useful for tests). */
export function invalidateSkillCache() {
  _cache = null;
  _cacheTime = 0;
}

/** Discover all skills and return a compact index sorted alphabetically. */
export async function discoverSkills() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache;
  const seen = new Set();
  const out = [];
  for (const dir of SKILL_DIRS) {
    if (!dir || !existsSync(dir)) continue;
    for (const entry of scanDir(dir)) {
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      out.push(entry);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  _cache = out;
  _cacheTime = now;
  return out;
}

/** Return a compact human-readable index suitable for system-prompt insertion.
 *  Capped at MAX_INDEX_CHARS (default 4096) so it never swamps the prompt budget. */
export function buildCompactIndex(skills, maxIndexChars = 4096) {
  if (!skills.length) return null;
  const lines = [];
  let used = '## Available Skills\nThe following external skills may be relevant. Before using advice from a skill, load its full content via `load_skill` with its exact name.\n'.length;
  for (const s of skills) {
    const line = `  - ${s.name}: ${s.desc}`;
    if (used + line.length + 1 > maxIndexChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (!lines.length) return null;
  return `## Available Skills\nThe following external skills may be relevant. Before using advice from a skill, load its full content via \`load_skill\` with its exact name.\n${lines.join('\n')}`;
}

/** Load a single skill's full content. Returns null if not found or invalid. */
export async function loadSkill(name) {
  const list = await discoverSkills();
  const found = list.find(s => s.name === name.toLowerCase());
  if (!found) return null;
  let buf;
  try { buf = readFileSync(found.fullPath); } catch { return null; }
  if (buf.length > MAX_SIZE_BYTES) return null;
  const text = buf.toString('utf8');
  if (looksInjected(text)) return null;
  const cleaned = text.replace(/^---\n[\s\S]*?\n---/, '').trim();
  return { name: found.name, source: found.source, size: buf.length, content: cleaned };
}
