// Turn-scoped git checkpoints, for rolling back changes the agent made.
//
// Why a private ref instead of `git stash`: `stash push` mutates the user's own
// stash list, and a crash or `clear` would strand their work in a numbered stash
// they then have to find by hand. Instead we build the snapshot through a
// throwaway index and park the resulting commit under `refs/flow/checkpoints/`,
// which nothing else in git will ever touch or prune.
//
// Rollback restores both the working tree and the files that were created after
// the snapshot, then puts the user's staging area back exactly as it was —
// `read-tree -u` necessarily rewrites the index, so it is backed up first.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, copyFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const REF_ROOT = 'refs/flow/checkpoints';
const KEEP = 20;

async function git(cwd, args, env = {}) {
  const { stdout } = await run('git', args, {
    cwd, timeout: 30000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env }
  });
  return stdout;
}

async function tryGit(cwd, args, env) {
  try { return await git(cwd, args, env); } catch { return null; }
}

/** Is this a usable git work tree with a resolvable .git dir? */
export async function isRepo(cwd) {
  const out = await tryGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  return out?.trim() === 'true';
}

export async function gitDir(cwd) {
  const out = await tryGit(cwd, ['rev-parse', '--absolute-git-dir']);
  return out ? out.trim() : null;
}

/**
 * Refuse to snapshot or roll back while git is mid-operation. Restoring the tree
 * under an in-progress rebase or merge would silently discard the operation's own
 * state, which is far worse than having no checkpoint at all.
 */
export async function blockedReason(cwd) {
  const dir = await gitDir(cwd);
  if (!dir) return 'not a git repository';
  for (const [marker, label] of [['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert'], ['BISECT_LOG', 'bisect']]) {
    if (existsSync(join(dir, marker))) return `${label} in progress`;
  }
  const unmerged = await tryGit(cwd, ['diff', '--name-only', '--diff-filter=U']);
  if (unmerged?.trim()) return 'index has unmerged paths';
  return null;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Snapshot the current work tree (tracked + untracked, minus .gitignore'd files)
 * into a commit stored under refs/flow/checkpoints/.
 */
export async function create(cwd, label = 'checkpoint') {
  if (!(await isRepo(cwd))) return { ok: false, reason: 'not a git repository' };
  const blocked = await blockedReason(cwd);
  if (blocked) return { ok: false, reason: blocked };

  const dir = await gitDir(cwd);
  // GIT_INDEX_FILE must point at a FILE. mkdtemp gives us a directory, so the
  // index goes inside it and the whole thing is removed afterwards.
  const scratch = await mkdtemp(join(tmpdir(), 'flow-checkpoint-'));
  const indexFile = join(scratch, 'index');
  let snapshot;
  try {
    const env = { GIT_INDEX_FILE: indexFile };
    // Unborn HEAD has no tree to read, so start from empty in that case.
    const hasHead = (await tryGit(cwd, ['rev-parse', '--verify', 'HEAD'])) !== null;
    await git(cwd, hasHead ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], env);
    // Respects .gitignore, which is what we want: never snapshot build output.
    await git(cwd, ['add', '-A', '--', '.'], env);
    const tree = (await git(cwd, ['write-tree'], env)).trim();
    const parents = hasHead ? ['-p', (await git(cwd, ['rev-parse', 'HEAD'])).trim()] : [];
    const commit = (await git(cwd, ['commit-tree', tree, ...parents, '-m', `sword: ${label}`], env)).trim();
    const id = newId();
    const ref = `${REF_ROOT}/${id}`;
    await git(cwd, ['update-ref', ref, commit]);
    const files = (await git(cwd, ['ls-tree', '-r', '--name-only', tree])).split('\n').filter(Boolean);
    snapshot = { ok: true, id, ref, commit, tree, label, files, createdAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, reason: error?.message ?? String(error) };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }

  await prune(cwd);
  return snapshot;
}

/** Drop the oldest snapshots so refs do not accumulate forever. */
async function prune(cwd) {
  const out = await tryGit(cwd, ['for-each-ref', '--format=%(refname)', REF_ROOT]);
  if (!out) return;
  const refs = out.split('\n').filter(Boolean);
  if (refs.length <= KEEP) return;
  // Names start with a base36 timestamp, so lexical order is chronological order.
  for (const ref of refs.slice(0, refs.length - KEEP)) {
    await tryGit(cwd, ['update-ref', '-d', ref]);
  }
}

export async function list(cwd) {
  const out = await tryGit(cwd, ['for-each-ref', '--format=%(refname:short) %(objectname) %(contents:subject)', REF_ROOT]);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map(line => {
    const [short, commit, ...rest] = line.split(' ');
    // `refname:short` may or may not keep the `refs/` prefix depending on the git
    // version, so strip whatever prefix is actually present.
    const ref = short.startsWith('refs/') ? short : `refs/${short}`;
    return { id: ref.slice(REF_ROOT.length + 1), ref, commit, label: rest.join(' ') };
  }).reverse();
}

export async function drop(cwd, id) {
  const out = await tryGit(cwd, ['update-ref', '-d', `${REF_ROOT}/${id}`]);
  return out !== null;
}

/**
 * Restore the work tree to a snapshot.
 *  - read-tree --reset -u rewrites the index, so it is backed up and restored
 *    afterwards: the user's staging area must survive a rollback untouched.
 *  - Files created after the snapshot are removed. Gitignored paths are skipped,
 *    because the snapshot never contained them and deleting build output on a
 *    rollback would be destructive.
 */
export async function restore(cwd, snapshot) {
  if (!snapshot?.tree) return { ok: false, reason: 'no snapshot to restore' };
  if (!(await isRepo(cwd))) return { ok: false, reason: 'not a git repository' };
  const blocked = await blockedReason(cwd);
  if (blocked) return { ok: false, reason: `${blocked}; refusing to roll back` };

  const dir = await gitDir(cwd);
  const indexPath = join(dir, 'index');
  const hadIndex = existsSync(indexPath);
  let backup = null;
  try {
    if (hadIndex) {
      backup = await mkdtemp(join(tmpdir(), 'flow-index-'));
      await copyFile(indexPath, join(backup, 'index'));
    }
    await git(cwd, ['read-tree', '--reset', '-u', snapshot.tree]);
    if (hadIndex) await copyFile(join(backup, 'index'), indexPath);
  } catch (error) {
    return { ok: false, reason: error?.message ?? String(error) };
  } finally {
    if (backup) await rm(backup, { recursive: true, force: true }).catch(() => {});
  }

  const removed = await removeNewFiles(cwd, new Set(snapshot.files ?? []));
  return { ok: true, id: snapshot.id, removed };
}

async function removeNewFiles(cwd, known) {
  const others = (await tryGit(cwd, ['ls-files', '--others', '--exclude-standard'])) ?? '';
  const removed = [];
  for (const rel of others.split('\n').filter(Boolean)) {
    if (known.has(rel)) continue;
    // Belt and braces: never delete a path git is currently ignoring.
    const ignored = await tryGit(cwd, ['check-ignore', '-q', '--', rel]);
    if (ignored !== null) continue;
    const { rm } = await import('node:fs/promises');
    await rm(join(cwd, rel), { force: true, recursive: false }).then(
      () => removed.push(rel),
      () => { /* directory or vanished; leave it */ }
    );
  }
  return removed;
}

/** Cheap summary for the UI: how many tracked/untracked files differ from the snapshot. */
export async function changedSince(cwd, snapshot) {
  if (!snapshot?.tree) return null;
  const diff = await tryGit(cwd, ['diff', '--name-only', snapshot.tree]);
  if (diff === null) return null;
  const others = (await tryGit(cwd, ['ls-files', '--others', '--exclude-standard'])) ?? '';
  const tracked = diff.split('\n').filter(Boolean);
  const untracked = others.split('\n').filter(Boolean).filter(f => !snapshot.files?.includes(f));
  return { tracked: tracked.length, untracked: untracked.length, total: tracked.length + untracked.length };
}