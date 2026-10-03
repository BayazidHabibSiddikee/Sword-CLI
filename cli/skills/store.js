// Project-local skill store with integrity lockfile + ranked index.
//
// Skills install under <cwd>/.flow/skills/<name>/{SKILL.md,skill.lock.json}.
// The lockfile pins the sha256 of SKILL.md at install time; verifySkill()
// recomputes it, and listInstalledSkills({ verifiedOnly: true }) EXCLUDES any
// skill whose content no longer matches — a tampered skill never reaches the
// model. No shell execution and no network happen here; install() takes
// content the caller already fetched, so this module stays sandbox-neutral.
// Safety mirrors cli/externalSkills.js: plain-identifier names only (no path
// separators), symlinks refused, per-file size cap, atomic temp+rename writes.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Project-local store, relative to the session cwd (never global). */
export const SKILLS_STORE_REL = join('.flow', 'skills');
export const SKILL_FILE = 'SKILL.md';
export const MANIFEST_NAME = 'skill.lock.json';
export const MAX_SKILL_BYTES = 500 * 1024;
export const MAX_INDEX_CHARS = 4096;

export function skillStoreDir(cwd = process.cwd()) {
  return join(resolve(cwd), SKILLS_STORE_REL);
}

/** Lower-cased plain identifier; throws on paths, traversal or junk. */
export function normaliseSkillName(name) {
  const cleaned = String(name ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-_]{0,63}$/.test(cleaned)) {
    throw new Error('Skill name must be a plain identifier ([a-z0-9-_], max 64 chars)');
  }
  return cleaned;
}

export function sha256Hex(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function skillDir(cwd, name) {
  return join(skillStoreDir(cwd), normaliseSkillName(name));
}

function assertNotSymlink(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error('Symlinks are not allowed');
  return stat;
}

function atomicWriteFile(path, content) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, content, { flag: 'wx' });
    renameSync(tmp, path);
  } catch (error) {
    try { rmSync(tmp, { force: true }); } catch { /* already gone */ }
    throw error;
  }
}

/**
 * Install (or reinstall) a skill. Returns { name, sha256, path }.
 * With expectedSha256 set and mismatched, NOTHING is written.
 * Returns NEW objects; never mutates its arguments.
 */
export function installSkill({ cwd = process.cwd(), name, content, source = '', expectedSha256 = null } = {}) {
  const safe = normaliseSkillName(name);
  if (typeof content !== 'string' || !content.length) throw new Error('Invalid skill content');
  if (Buffer.byteLength(content, 'utf8') > MAX_SKILL_BYTES) throw new Error('Skill content exceeds size cap');
  const digest = sha256Hex(content);
  if (expectedSha256 && String(expectedSha256).toLowerCase() !== digest) {
    throw new Error('Skill integrity check failed: sha256 mismatch');
  }
  const dir = skillDir(cwd, safe);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  atomicWriteFile(join(dir, SKILL_FILE), content);
  const manifest = { name: safe, sha256: digest, source: String(source ?? ''),
    bytes: Buffer.byteLength(content, 'utf8'), installedAt: new Date().toISOString() };
  atomicWriteFile(join(dir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return { name: safe, sha256: digest, path: join(dir, SKILL_FILE) };
}

/**
 * Verify one installed skill. Never throws for a bad skill — returns
 * { ok: false, reason } so callers exclude it (tampered => excluded).
 */
export function verifySkill({ cwd = process.cwd(), name } = {}) {
  let safe;
  try { safe = normaliseSkillName(name); }
  catch (error) { return { ok: false, name: String(name ?? ''), reason: error.message }; }
  const dir = skillDir(cwd, safe);
  let body;
  try {
    assertNotSymlink(join(dir, SKILL_FILE));
    body = readFileSync(join(dir, SKILL_FILE), 'utf8');
  } catch { return { ok: false, name: safe, reason: 'missing skill file' }; }
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(dir, MANIFEST_NAME), 'utf8')); }
  catch { return { ok: false, name: safe, reason: 'missing lockfile' }; }
  if (manifest?.name !== safe || typeof manifest?.sha256 !== 'string') {
    return { ok: false, name: safe, reason: 'invalid lockfile' };
  }
  if (sha256Hex(body) !== String(manifest.sha256).toLowerCase()) {
    return { ok: false, name: safe, reason: 'tampered: sha256 mismatch' };
  }
  return { ok: true, name: safe, sha256: manifest.sha256, source: manifest.source ?? '', bytes: manifest.bytes ?? 0 };
}

/** Remove an installed skill. Refuses to follow symlinks. */
export function uninstallSkill({ cwd = process.cwd(), name } = {}) {
  const safe = normaliseSkillName(name);
  assertNotSymlink(skillDir(cwd, safe));
  rmSync(skillDir(cwd, safe), { recursive: true, force: true });
  return { removed: true, name: safe };
}

/**
 * List installed skills. With verifiedOnly (default) tampered/lockless skills
 * are EXCLUDED — they can never reach the model index.
 */
export function listInstalledSkills({ cwd = process.cwd(), verifiedOnly = true } = {}) {
  const root = skillStoreDir(cwd);
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    let safe;
    try { safe = normaliseSkillName(entry.name); } catch { continue; }
    const verdict = verifySkill({ cwd, name: safe });
    if (!verdict.ok && verifiedOnly) continue;
    let description = '';
    try {
      const body = readFileSync(join(root, safe, SKILL_FILE), 'utf8');
      const front = body.match(/^---\n[\s\S]*?\n---/);
      const line = front?.[0].split('\n').find(l => l.toLowerCase().startsWith('description:'));
      description = (line?.slice(line.indexOf(':') + 1) ?? '').trim().replace(/^['"]|['"]$/g, '').slice(0, 180);
    } catch { /* description is best-effort */ }
    const row = { name: safe, desc: description, source: verdict.source ?? '', bytes: verdict.bytes ?? 0 };
    out.push(verifiedOnly ? row : { ...row, ok: verdict.ok, reason: verdict.reason });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function queryTokens(query) {
  return String(query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
}

/**
 * Rank skills against a query so the index budget carries the RELEVANT skills,
 * not an arbitrary alphabetical prefix. Score: exact-name hit >> name-token
 * hits >> description-token hits. Pure, deterministic; ties break
 * alphabetically. Returns a NEW array.
 */
export function rankSkills(skills, query = '', { limit = 20 } = {}) {
  const tokens = queryTokens(query);
  const scored = (Array.isArray(skills) ? skills : []).map(skill => {
    const name = String(skill?.name ?? '').toLowerCase();
    const desc = String(skill?.desc ?? '').toLowerCase();
    let score = 0;
    if (query && name === String(query).toLowerCase()) score += 100;
    for (const token of tokens) {
      if (name.split(/[^a-z0-9]+/).includes(token)) score += 10;
      else if (name.includes(token)) score += 5;
      if (desc.includes(token)) score += 1;
    }
    return { skill, score };
  });
  scored.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  const capped = Number.isSafeInteger(limit) && limit >= 0 ? limit : 20;
  return scored.slice(0, capped).map(({ skill }) => ({ ...skill }));
}

/** Ranked, char-capped index block for system-prompt insertion. */
export function buildRankedSkillIndex(skills, query = '', maxIndexChars = MAX_INDEX_CHARS) {
  const ranked = rankSkills(skills, query);
  if (!ranked.length) return null;
  const lines = [];
  let used = '## Project Skills (verified)\n'.length;
  for (const skill of ranked) {
    const line = `  - ${skill.name}: ${skill.desc || '(no description)'}`;
    if (used + line.length + 1 > maxIndexChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (!lines.length) return null;
  return `## Project Skills (verified)\n${lines.join('\n')}`;
}
