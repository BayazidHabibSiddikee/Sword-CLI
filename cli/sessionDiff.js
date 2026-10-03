// A compact "what changed in this workspace" block for the system prompt.
//
// Why: once history archiving kicks in, the in-memory message list no longer
// describes the session — the oldest turns are gone from it. A model that can no
// longer see what it did starts re-reading files and re-running commands, or worse,
// claims nothing has changed. So the workspace state is reconstructed from git
// (the checkpoint ref list plus the diff against a baseline tree) rather than from
// the message log, which keeps working after archiving has truncated the log.
//
// Non-repos are a normal case, not an error: `available:false` is returned and the
// caller simply omits the block.
import { isRepo, list as listCheckpoints } from './checkpoint.js';

const DEFAULT_MAX_ITEMS = 20;
const STATUS_LABEL = { A: 'new', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'typechange', U: 'conflicted' };

async function git(cwd, args) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  try {
    const { stdout } = await promisify(execFile)('git', args, { cwd, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch { return null; }
}

function parseNameStatus(out) {
  if (!out) return [];
  return out.split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    return { status: status[0] ?? '?', path: parts[parts.length - 1], from: parts[1] && parts[1] !== parts[parts.length - 1] ? parts[1] : null };
  });
}

/**
 * Files changed since the session's baseline.
 *
 * `snapshot` is the session-start checkpoint; when it is missing (a resumed session,
 * or one whose snapshot was pruned) the oldest surviving checkpoint ref is used
 * instead, which is why this keeps working after history archiving.
 * `history`/`archivedCount` only inform the headline — no file list is ever derived
 * from the message log.
 */
export async function sessionDiff({ cwd, snapshot = null, history = [], archivedCount = 0, maxItems = DEFAULT_MAX_ITEMS } = {}) {
  if (!cwd || !(await isRepo(cwd))) return { available: false, reason: 'not a git repository' };

  let baseline = snapshot && snapshot.tree ? snapshot : null;
  let refLabel = baseline ? `checkpoint ${baseline.id}` : null;
  if (!baseline) {
    // for-each-ref is chronological ascending and list() reverses it, so the tail is
    // the oldest checkpoint that survived pruning.
    const checkpoints = await listCheckpoints(cwd);
    const oldest = checkpoints[checkpoints.length - 1];
    if (!oldest?.commit) return { available: false, reason: 'no checkpoint to compare against' };
    const tree = await git(cwd, ['rev-parse', `${oldest.commit}^{tree}`]);
    if (!tree) return { available: false, reason: 'no checkpoint to compare against' };
    baseline = { id: oldest.id, label: oldest.label, commit: oldest.commit, tree: tree.trim(), files: await listTree(cwd, tree.trim()) };
    refLabel = `checkpoint ${oldest.id}`;
  }

  const tracked = parseNameStatus(await git(cwd, ['diff', '--name-status', baseline.tree]));
  const untrackedOut = await git(cwd, ['ls-files', '--others', '--exclude-standard']);
  const known = new Set(baseline.files ?? []);
  const untracked = (untrackedOut ?? '').split('\n').filter(Boolean)
    .filter(f => !known.has(f))
    .map(f => ({ status: 'A', path: f, from: null }));

  const files = [...tracked, ...untracked];
  const limit = Number.isSafeInteger(maxItems) && maxItems > 0 ? maxItems : DEFAULT_MAX_ITEMS;
  const turns = (history ?? []).filter(m => m?.role === 'user').length;
  return {
    available: true,
    baseline: { id: baseline.id, ref: baseline.ref ?? null, commit: baseline.commit ?? null },
    since: refLabel,
    total: files.length,
    tracked: tracked.length,
    untracked: untracked.length,
    files: files.slice(0, limit),
    hidden: Math.max(0, files.length - limit),
    archivedCount: Number.isSafeInteger(archivedCount) ? archivedCount : 0,
    turns
  };
}

async function listTree(cwd, tree) {
  const out = await git(cwd, ['ls-tree', '-r', '--name-only', tree]);
  return (out ?? '').split('\n').filter(Boolean);
}

/** Compact `<workspace-diff>` block, or '' when unavailable. */
export function formatSessionDiff(diff) {
  if (!diff?.available) return '';
  const lines = [`<workspace-diff>`, `baseline: ${diff.since}`];
  if (!diff.total) lines.push('no files changed since the session started.');
  else {
    lines.push(`changed since session start (${diff.total} file${diff.total === 1 ? '' : 's'}):`);
    for (const file of diff.files) lines.push(`  ${STATUS_LABEL[file.status] ?? file.status} ${file.path}`);
    if (diff.hidden) lines.push(`  ... and ${diff.hidden} more`);
  }
  if (diff.archivedCount) lines.push(`${diff.archivedCount} earlier turn(s) were archived out of context; query the knowledge library under \`history\` if they matter.`);
  if (diff.turns) lines.push(`${diff.turns} user turn(s) remain in context.`);
  lines.push('</workspace-diff>');
  return lines.join('\n');
}
