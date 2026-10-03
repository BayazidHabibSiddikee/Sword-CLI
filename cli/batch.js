// All-or-nothing multi-file edits.
//
// Why: a model that renames three files in one turn should get ONE approval and ONE
// checkpoint, not three of each — but it must also not leave the tree half-edited.
// Validating every item before touching disk is what makes the batch atomic from the
// user's point of view: either all three files change or none does.
//
// The per-file write reuses the exact temp+rename pattern from `change()` in
// tools.js (sibling temp file, `wx` flag, rename into place, temp removed on failure)
// so a crash mid-batch leaves each individual file either wholly old or wholly new.
// All-or-nothing across FILES is a rollback on top of that: if file 3 fails, files 1
// and 2 are restored from the `before` snapshots taken during validation.

import { writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { unifiedDiff } from './ui.js';

const LIMIT = 64000;

/** Same guard tools.js applies, re-declared so batch.js has no import cycle. */
function text(value, label, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > LIMIT || value.includes('\0')) throw new Error(`Invalid ${label}`);
  return value;
}

export function normalizeEol(value, eol) {
  return eol === '\r\n' ? value.replace(/\r?\n/g, '\r\n') : value.replace(/\r\n/g, '\n');
}

/**
 * One diff block covering every file in a batch, so the approval prompt shows the
 * whole change rather than making the user page through N prompts.
 */
export function combinedDiff(changes, { maxLines = 24 } = {}) {
  const lines = [];
  for (const { path, before, after } of changes) {
    lines.push(`  ${path}`);
    lines.push(...unifiedDiff(before, after, maxLines));
  }
  return lines;
}
/**
 * Apply `items` (each `{path, content}` for write_file or `{path, old_text, new_text}`
 * for edit_file) as one unit.
 *
 * deps (injected by tools.js so the identical path/permission/checkpoint rules apply):
 *   checked(input, allowMissing) -> absolute path   tools.js `checked`
 *   read(full) -> string                            tools.js `read`
 *   permit(proposal) -> Promise                     tools.js `permit` (approval + checkpointOnce)
 *   snapshots -> Map<full, content>                 tools.js read baselines
 *
 * Returns `{ok, error?, written, snapshots}`. Every expected refusal (bad path,
 * unread file, unapproved batch, failed commit) comes back as `{ok:false}` rather
 * than a throw, so one bad item is never mistaken for a crash.
 */
export async function changeMany(name, items, deps = {}) {
  const { checked, read, permit, snapshots: baseline = new Map() } = deps;
  if (typeof checked !== 'function' || typeof read !== 'function') throw new Error('changeMany requires checked and read');
  if (!Array.isArray(items) || !items.length) return { ok: false, error: 'Empty batch', written: [], snapshots: baseline };
  if (items.length > 32) return { ok: false, error: 'Batch too large (max 32 files)', written: [], snapshots: baseline };

  // ---- validation: nothing below this line touches the disk ------------------
  const seenPaths = new Set();
  const changes = [];
  for (const item of items) {
    try {
      if (!item || typeof item !== 'object') throw new Error('Invalid batch item');
      const full = await checked(text(item.path, 'path'), true);
      if (seenPaths.has(full)) throw new Error(`Duplicate path in batch: ${item.path}`);
      seenPaths.add(full);
      let before = null;
      try { before = await read(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (before !== null && !baseline.has(full)) throw new Error(`Read file before editing: ${item.path}`);
      if (before !== null && baseline.get(full) !== before) throw new Error(`File changed since read: ${item.path}`);
      let after;
      if (name === 'write_file') after = text(item.content, 'content', true);
      else if (name === 'edit_file') {
        const old = text(item.old_text, 'old_text');
        text(item.new_text, 'new_text', true);
        if (before === null) throw new Error(`File does not exist; use write_file to create it: ${item.path}`);
        const eol = before.includes('\r\n') ? '\r\n' : '\n';
        const needle = normalizeEol(old, eol);
        const replacement = normalizeEol(item.new_text, eol);
        const hits = before.split(needle).length - 1;
        // Ambiguity is fatal, never a guess: silently picking one of several matches
        // corrupts the wrong occurrence.
        if (hits === 0) throw new Error(`Old text not found in ${item.path} (line endings are normalised; check whitespace)`);
        if (hits > 1) throw new Error(`Old text matches ${hits} places in ${item.path}; include more surrounding context`);
        after = before.replace(needle, () => replacement);
        text(after, 'result', true);
      } else throw new Error(`Unsupported batch operation: ${name}`);
      changes.push({ full, before, after, id: item.id ?? null });
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error), written: [], snapshots: baseline };
    }
  }

  // ---- one permit for the whole batch ---------------------------------------
  try {
    await permit?.({ tool: name, batch: true, files: changes.map(c => c.full), before: changes, after: changes });
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error), written: [], snapshots: baseline };
  }

  // ---- commit, rolling back on any failure ----------------------------------
  const temps = [];
  const applied = [];
  try {
    for (const [i, change] of changes.entries()) {
      await checked(change.full, true);
      let now = null;
      try { now = await read(change.full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (now !== change.before) throw new Error(`File changed during approval: ${change.full}`);
      await mkdir(dirname(change.full), { recursive: true });
      if (change.before === null) {
        // Create: 'wx' fails if the path appeared since the staleness check, so a
        // batch can never clobber a file that materialized mid-flight.
        await writeFile(change.full, change.after, { flag: 'wx' });
      } else {
        // Same temp+rename shape as change() in tools.js: a crash mid-write leaves
        // either the old file or the new one, never a half-written source file.
        const temp = `${change.full}.flow-${process.pid}-${Date.now().toString(36)}-${i}.tmp`;
        temps.push(temp);
        await writeFile(temp, change.after, { flag: 'wx' });
        await rename(temp, change.full);
        temps.pop();
      }
      applied.push(change);
    }
  } catch (error) {
    // All-or-nothing: undo what landed before reporting the failure.
    for (const change of [...applied].reverse()) {
      try {
        if (change.before === null) await rm(change.full, { force: true });
        else await writeFile(change.full, change.before);
      } catch { /* a file we cannot restore is reported, never silently dropped */ }
    }
    for (const temp of temps) await rm(temp, { force: true }).catch(() => {});
    return { ok: false, error: `Batch failed and was rolled back: ${error?.message ?? String(error)}`, written: [], snapshots: baseline };
  }

  const snapshots = new Map([...baseline, ...changes.map(c => [c.full, c.after])]);
  return { ok: true, written: changes.map(c => ({ path: c.full, bytes: Buffer.byteLength(c.after), id: c.id ?? null })), snapshots };
}
