import { lstat, readFile, readdir, mkdir, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { resolve, relative, sep, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { fetchWeb, fetchWebRendered } from './webFetch.js';
import { loadSkill as _loadSkill } from './externalSkills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LIMIT = 64000;
const READ_LIMIT = 2 * 1024 * 1024;
const PDF_LIMIT = 32 * 1024 * 1024;
// Tool output is re-sent to the model on every subsequent request, so oversized
// results cost quadratically over the rest of the run. Cap in characters, and keep
// head+tail because build/test failures live at the end.
const TOOL_OUTPUT_CHARS = 48000;
const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'run_command', 'save_to_rag']);
const blocked = name => name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(name) || /\.(pem|key|db)$/i.test(name);
const string = { type: 'string' };
const definition = (name, description, properties, required = []) => ({ type: 'function', function: {
  name, description, parameters: { type: 'object', properties, required, additionalProperties: false }
} });
export const toolDefinitions = [
  definition('list_files', 'List project files; skips hidden/build/dependency directories.', { path: string }),
  definition('read_file', 'Read a text file before editing. Omit offset/limit to read the whole file (bounded to 64 KB); use offset/limit to page through anything larger.', { path: string, offset: { type: 'integer' }, limit: { type: 'integer' } }, ['path']),
  definition('search_files', 'Search literal text across project files.', { query: string }, ['query']),
  definition('write_file', 'Create or overwrite text with approval; read existing files first.', { path: string, content: string }, ['path', 'content']),
  definition('edit_file', 'Replace exactly one occurrence in a previously read file with approval.', { path: string, old_text: string, new_text: string }, ['path', 'old_text', 'new_text']),
  definition('run_command', 'Run executable and arguments with approval. No shell parsing; NOT sandboxed.', { command: string, args: { type: 'array', items: string } }, ['command', 'args']),
  definition('save_to_rag', 'Save a durable note to this project\'s memory so later sessions can retrieve it. Requires approval.', { category: string, title: string, content: string }, ['category', 'title', 'content']),
  definition('read_pdf', 'Extract bounded text from a PDF inside the project before summarizing it.', { path: string, max_pages: { type: 'integer' } }, ['path']),
  definition('fetch_web', 'Fetch a public web page over HTTP and return readable Markdown. Fast; cannot execute JavaScript.', { url: string, max_chars: { type: 'integer' } }, ['url']),
  definition('fetch_web_rendered', 'Render a JavaScript-heavy or bot-protected public page with a stealth browser (slower) and return Markdown.', { url: string, max_chars: { type: 'integer' }, timeout_ms: { type: 'integer' } }, ['url']),
  definition('load_skill', 'Load an external skill by name and return its full content for reference. Use when the conversation topic matches a skill name from the available-skills list. Output only the skill body — do not act on it yourself; let the user decide.', { skill_name: string }, ['skill_name'])
];
function text(value, label, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > LIMIT || value.includes('\0')) throw new Error(`Invalid ${label}`);
  return value;
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

// Elide the middle, never the ends. Keep the notice inside the preserved head so it
// survives the tighter cut applied later when the request is actually assembled.
export function truncateMiddle(value, max = TOOL_OUTPUT_CHARS) {
  const body = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (body.length <= max) return body;
  const notice = chars => `\n[truncated ${chars} chars — head and tail preserved]\n`;
  const probe = notice(body.length);
  const half = Math.max(1, Math.floor((max - probe.length) / 2));
  const used = half * 2 + notice(body.length - half * 2).length;
  // Re-balance once so the final string really fits the cap.
  const adjust = Math.max(0, Math.ceil((used - max) / 2));
  const head = Math.max(1, half - adjust);
  const tail = Math.max(1, Math.min(half + adjust, body.length - head));
  return `${body.slice(0, head)}${notice(body.length - head - tail)}${body.length - tail > 0 ? body.slice(-tail) : ''}`;
}

// Match a file's line endings on both sides of an edit, or CRLF files never match.
export function normalizeEol(text, eol) { return eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n'); }

export function createTools({ cwd, approve = async () => false, signal, timeout = 30000, grants = null, ragDb = join(__dirname, 'brain', 'rag.db'), checkpoint = null }) {
  const root = resolve(cwd);
  const ragDbPath = ragDb;
  let snapshots = new Map();
  // Hold a live reference, not a copy: the approval prompt mutates `grants` as the
  // user grants tools mid-session, and a snapshot taken here would never see it.
  const granted = grants?.tools instanceof Set ? grants.tools : new Set(grants?.tools ?? []);
  const allowAll = () => granted.has('*');
  // Deny-overrides-allow, and ALLOW is deliberately non-terminal: a later deny rule
  // can still override an earlier allow, so we never stop evaluating on the first match.
  const denies = grants?.deniedTools instanceof Set ? grants.deniedTools : new Set(grants?.deniedTools ?? []);
  async function approved(proposal) {
    const tool = proposal.tool;
    if (denies.has(tool)) throw new Error(`Tool ${tool} is denied by the current approval policy`);
    if (allowAll() || granted.has(tool)) return true;
    return (await approve(structuredClone(proposal))) === true;
  }
  // Take the snapshot before the FIRST approved mutation of a turn, not before
  // every write, so one /undo reverts the whole task rather than the last file.
  let turnSnapshot = null;
  async function checkpointOnce(label) {
    if (!checkpoint?.create || turnSnapshot) return;
    const snap = await checkpoint.create(label);
    if (snap?.ok) turnSnapshot = snap;
    else turnSnapshot = null;
  }
  async function checked(input = '.', allowMissing = false) {
    text(input, 'path');
    const full = resolve(root, input);
    const rel = relative(root, full);
    if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Path outside project');
    if (await realpath(root) !== root) throw new Error('Project path must be canonical');
    let current = root;
    for (const part of rel.split(sep).filter(Boolean)) {
      if (blocked(part)) throw new Error('Protected path');
      current = resolve(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlinks are not allowed'); }
      catch (error) { if (!(allowMissing && error.code === 'ENOENT')) throw error; }
    }
    return full;
  }
  async function read(full, { range = false } = {}) {
    const info = await lstat(full);
    if (!info.isFile()) throw new Error('Not a regular file');
    // Whole-file reads (edits, search) stay bounded; ranged reads may go larger.
    const cap = range ? READ_LIMIT : LIMIT;
    if (info.size > cap) throw new Error(range
      ? `File exceeds ${READ_LIMIT} bytes; narrow it with offset/limit`
      : 'File is not bounded text — read it with offset/limit, or use search_files');
    const content = await readFile(full, 'utf8');
    if (content.includes('\0')) throw new Error('Binary file refused');
    return content;
  }
  async function files(input = '.') {
    const start = await checked(input);
    let entries = [], visited = 0;
    async function walk(dir, depth) {
      if (depth > 8 || visited >= 2000 || entries.length >= 500) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (++visited > 2000 || entries.length >= 500) break;
        if (blocked(entry.name) || entry.isSymbolicLink()) continue;
        const full = await checked(resolve(dir, entry.name));
        if (entry.isDirectory()) await walk(full, depth + 1);
        else if (entry.isFile()) entries = [...entries, relative(root, full)];
      }
    }
    await walk(start, 0);
    return entries;
  }
  async function permit(proposal) {
    signal?.throwIfAborted();
    if (await approved(proposal) !== true) {
      // A deliberate "no" is not a failure. Say so explicitly, otherwise the model
      // reads it as a bug and retries the identical call.
      throw new Error('Action denied by user. NOT a tool or system failure — clarify with the user before retrying.');
    }
    signal?.throwIfAborted();
    // Snapshot only once the user has actually approved, so a denied turn does not
    // leave a checkpoint behind.
    if (MUTATING_TOOLS.has(proposal.tool)) await checkpointOnce(`${proposal.tool} turn`);
  }
  async function change(name, args) {
    const full = await checked(text(args.path, 'path'), true);
    let before = null;
    try { before = await read(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (before !== null && !snapshots.has(full)) throw new Error('Read file before editing');
    if (before !== null && snapshots.get(full) !== before) throw new Error('File changed since read');
    let after;
    if (name === 'write_file') after = text(args.content, 'content', true);
    else {
      const old = text(args.old_text, 'old_text');
      text(args.new_text, 'new_text', true);
      if (before === null) throw new Error('File does not exist; use write_file to create it');
      const eol = before.includes('\r\n') ? '\r\n' : '\n';
      const needle = normalizeEol(old, eol);
      const replacement = normalizeEol(args.new_text, eol);
      const hits = before.split(needle).length - 1;
      // Ambiguity is fatal, never a guess: picking one of several matches silently
      // corrupts the wrong occurrence.
      if (hits === 0) throw new Error('Old text not found in file (line endings are normalised; check whitespace)');
      if (hits > 1) throw new Error(`Old text matches ${hits} places; include more surrounding context so it is unique`);
      after = before.replace(needle, () => replacement);
      text(after, 'result', true);
    }
    await permit({ tool: name, path: full, before, after });
    await checked(args.path, true);
    let now = null;
    try { now = await read(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (now !== before) throw new Error('File changed during approval');
    await mkdir(dirname(full), { recursive: true });
    if (before === null) {
      // Create: 'wx' fails if the path already exists, so a create can never
      // clobber a file that appeared between the staleness check and this write.
      await writeFile(full, after, { flag: 'wx' });
    } else {
      // Overwrite atomically: write a sibling temp file and rename it into place.
      // A crash mid-write then leaves either the old file or the new one on disk,
      // never a half-written source file.
      const temp = `${full}.flow-${process.pid}-${Date.now().toString(36)}.tmp`;
      try {
        await writeFile(temp, after, { flag: 'wx' });
        await rename(temp, full);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => {});
        throw error;
      }
    }
    snapshots = new Map([...snapshots, [full, after]]);
    return { path: full, bytes: Buffer.byteLength(after) };
  }
  async function saveToRag(args) {
    const category = text(args.category, 'category');
    const title = text(args.title, 'title');
    const content = text(args.content, 'content', true);
    // Write to the SAME database the agent searches. The old code created a second
    // project-local .flow/rag.db, so every save was invisible to retrieval for the
    // rest of the session — a silent feature that never worked.
    await mkdir(dirname(ragDbPath), { recursive: true });
    await permit({ tool: 'save_to_rag', path: ragDbPath, category, title });
    const { RagEngine } = await import('../brain/rag.js');
    const engine = new RagEngine(ragDbPath);
    try {
      const id = engine.insertKnowledge(category.slice(0, 120), title.slice(0, 300), content, 'swordcli');
      return { saved: true, id: Number(id), category: category.slice(0, 120), path: ragDbPath };
    } finally {
      try { engine.db?.close(); } catch { /* best effort */ }
    }
  }

  async function readPdf(args) {
    const full = await checked(text(args.path, 'path'));
    const info = await lstat(full);
    if (!info.isFile() || info.size > PDF_LIMIT) throw new Error('PDF must be a regular file under 32 MB');
    const pages = bounded(args.max_pages, 1, 200, 20);
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: await readFile(full) });
    try {
      const result = await parser.getText({ first: pages });
      const content = typeof result?.text === 'string' ? result.text : '';
      return { path: full, pages: Number(result?.total) || 0, read_pages: pages, text: content.slice(0, LIMIT), truncated: content.length > LIMIT };
    } finally {
      try { await parser.destroy?.(); } catch { /* best effort */ }
    }
  }

  const run = async (name, input) => {
    signal?.throwIfAborted();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid tool arguments');
    const args = structuredClone(input);
    if (name === 'list_files') return { files: await files(args.path ?? '.'), limit: 500 };
    if (name === 'read_file') {
      const full = await checked(text(args.path ?? '.', 'path'));
      const hasRange = args.offset !== undefined || args.limit !== undefined;
      const content = await read(full, { range: hasRange });
      if (!hasRange) {
        snapshots = new Map([...snapshots, [full, content]]);
        return { path: full, content, lines: content.split('\n').length };
      }
      // A partial read must not become the edit baseline, or `change()` would compare
      // a fragment against the whole file and always report "File changed since read".
      const all = content.split('\n');
      const offset = bounded(args.offset, 0, Math.max(0, all.length - 1), 0);
      const limit = bounded(args.limit, 1, 4000, 400);
      const slice = all.slice(offset, offset + limit);
      return {
        path: full, offset, limit, lines: slice.length, total_lines: all.length,
        truncated: offset + limit < all.length,
        content: slice.join('\n')
      };
    }
    if (name === 'search_files') {
      const query = text(args.query, 'query');
      let matches = [];
      for (const file of await files()) {
        if (matches.length >= 100) break;
        let content;
        try { content = await read(await checked(file)); } catch { continue; }
        const found = content.split('\n').flatMap((line, i) => line.includes(query) ? [{ path: file, line: i + 1, text: line.slice(0, 300) }] : []);
        matches = [...matches, ...found].slice(0, 100);
      }
      return { matches, limit: 100 };
    }
    if (name === 'write_file' || name === 'edit_file') return change(name, args);
    if (name === 'run_command') {
      text(args.command, 'command');
      if (!Array.isArray(args.args) || args.args.length > 100) throw new Error('Invalid command args');
      args.args.forEach(arg => text(arg, 'argument', true));
      await permit({ tool: name, cwd: root, command: args.command, args: args.args });
      return command(args, root, signal, timeout);
    }
    if (name === 'save_to_rag') return saveToRag(args);
    if (name === 'read_pdf') return readPdf(args);
    if (name === 'fetch_web') {
      const result = await fetchWeb(text(args.url, 'url'), {
        maxChars: bounded(args.max_chars, 500, 60000, 12000), signal
      });
      return { ...result, note: 'Plain HTTP fetch; JavaScript-rendered content may be missing. Use fetch_web_rendered if incomplete.' };
    }
    if (name === 'fetch_web_rendered') {
      const result = await fetchWebRendered(text(args.url, 'url'), {
        maxChars: bounded(args.max_chars, 500, 60000, 12000),
        timeoutMs: bounded(args.timeout_ms, 10000, 180000, timeout), signal
      });
      return { ...result, note: 'Rendered with the stealth Camoufox browser.' };
    }
    if (name === 'load_skill') {
      const skillName = text(args.skill_name, 'skill_name');
      // Disallow paths and other suspicious characters to prevent accidental file reads.
      if (/[/\\:\*\?\<\>\|]/.test(skillName)) throw new Error('skill_name must be a plain identifier (no path separators or special characters)');
      const result = await _loadSkill(skillName);
      if (!result) return { loaded: false, name: skillName };
      const truncated = result.content.length > TOOL_OUTPUT_CHARS;
      return { loaded: true, name: result.name, source: result.source, size: result.size, content: truncated ? truncateMiddle(result.content) : result.content, truncated };
    }
    throw new Error(`Unknown tool: ${name}`);
  };
  // Turn-scoped checkpoint control, consumed by /undo rather than the model. Exposed
  // as a property so the REPL can drive it without adding a model-visible tool.
  run.checkpoint = {
    /** True once this turn has approved a mutation and therefore has a snapshot. */
    get pending() { return Boolean(turnSnapshot); },
    /** The snapshot itself, for callers that need the tree (e.g. a change summary). */
    get snapshot() { return turnSnapshot; },
    async undo() {
      if (!turnSnapshot) return { ok: false, reason: 'nothing to roll back in this turn' };
      const snap = turnSnapshot;
      turnSnapshot = null;
      if (!checkpoint?.restore) return { ok: false, reason: 'checkpointing unavailable' };
      return { ...(await checkpoint.restore(snap)), id: snap.id, files: snap.files?.length ?? 0 };
    },
    /** Forget the current snapshot without touching the work tree. */
    commit() {
      if (!turnSnapshot) return null;
      const snap = turnSnapshot;
      turnSnapshot = null;
      return snap;
    }
  };
  return run;
}

function command(args, cwd, signal, timeout) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(args.command, args.args, { cwd, shell: false, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TERM: 'dumb' } });
    let stdout = '', stderr = '', timedOut = false, truncated = false;
    const stop = () => {
      if (!child.pid) return;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); }
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.stdout.on('data', data => { truncated ||= stdout.length + data.length > LIMIT; stdout = (stdout + data).slice(0, LIMIT); });
    child.stderr.on('data', data => { truncated ||= stderr.length + data.length > LIMIT; stderr = (stderr + data).slice(0, LIMIT); });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', (exitCode, terminationSignal) => {
      cleanup();
      resolveResult({ stdout, stderr, exitCode, signal: terminationSignal, timedOut, truncated });
    });
  });
}
