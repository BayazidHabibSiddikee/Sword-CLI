import { lstat, readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, sep, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fetchWeb, fetchWebRendered } from './webFetch.js';

const LIMIT = 64000;
const PDF_LIMIT = 32 * 1024 * 1024;
const blocked = name => name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(name) || /\.(pem|key|db)$/i.test(name);
const string = { type: 'string' };
const definition = (name, description, properties, required = []) => ({ type: 'function', function: {
  name, description, parameters: { type: 'object', properties, required, additionalProperties: false }
} });
export const toolDefinitions = [
  definition('list_files', 'List project files; skips hidden/build/dependency directories.', { path: string }),
  definition('read_file', 'Read a text file before editing.', { path: string }, ['path']),
  definition('search_files', 'Search literal text across project files.', { query: string }, ['query']),
  definition('write_file', 'Create or overwrite text with approval; read existing files first.', { path: string, content: string }, ['path', 'content']),
  definition('edit_file', 'Replace exactly one occurrence in a previously read file with approval.', { path: string, old_text: string, new_text: string }, ['path', 'old_text', 'new_text']),
  definition('run_command', 'Run executable and arguments with approval. No shell parsing; NOT sandboxed.', { command: string, args: { type: 'array', items: string } }, ['command', 'args']),
  definition('save_to_rag', 'Save a durable note to this project\'s memory (.flow/rag.db) for later sessions. Requires approval.', { category: string, title: string, content: string }, ['category', 'title', 'content']),
  definition('read_pdf', 'Extract bounded text from a PDF inside the project before summarizing it.', { path: string, max_pages: { type: 'integer' } }, ['path']),
  definition('fetch_web', 'Fetch a public web page over HTTP and return readable Markdown. Fast; cannot execute JavaScript.', { url: string, max_chars: { type: 'integer' } }, ['url']),
  definition('fetch_web_rendered', 'Render a JavaScript-heavy or bot-protected public page with a stealth browser (slower) and return Markdown.', { url: string, max_chars: { type: 'integer' }, timeout_ms: { type: 'integer' } }, ['url'])
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

export function createTools({ cwd, approve = async () => false, signal, timeout = 30000 }) {
  const root = resolve(cwd);
  let snapshots = new Map();
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
  async function read(full) {
    const info = await lstat(full);
    if (!info.isFile() || info.size > LIMIT) throw new Error('File is not bounded text');
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
    if (await approve(structuredClone(proposal)) !== true) throw new Error('Action denied by user');
    signal?.throwIfAborted();
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
      if (before === null || before.split(old).length !== 2) throw new Error('Old text must match exactly once');
      after = before.replace(old, () => args.new_text);
      text(after, 'result', true);
    }
    await permit({ tool: name, path: full, before, after });
    await checked(args.path, true);
    let now = null;
    try { now = await read(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (now !== before) throw new Error('File changed during approval');
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, after, { flag: before === null ? 'wx' : 'w' });
    snapshots = new Map([...snapshots, [full, after]]);
    return { path: full, bytes: Buffer.byteLength(after) };
  }
  async function saveToRag(args) {
    const category = text(args.category, 'category');
    const title = text(args.title, 'title');
    const content = text(args.content, 'content', true);
    await mkdir(join(root, '.flow'), { recursive: true, mode: 0o700 });
    await permit({ tool: 'save_to_rag', path: join('.flow', 'rag.db'), category, title });
    const { RagEngine } = await import('../brain/rag.js');
    const engine = new RagEngine(join(root, '.flow', 'rag.db'));
    try {
      const id = engine.insertKnowledge(category.slice(0, 120), title.slice(0, 300), content, 'swordcli');
      return { saved: true, id: Number(id), category: category.slice(0, 120), path: join('.flow', 'rag.db') };
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

  return async (name, input) => {
    signal?.throwIfAborted();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid tool arguments');
    const args = structuredClone(input);
    if (name === 'list_files') return { files: await files(args.path ?? '.'), limit: 500 };
    if (name === 'read_file') {
      const full = await checked(text(args.path ?? '.', 'path'));
      const content = await read(full);
      snapshots = new Map([...snapshots, [full, content]]);
      return { path: full, content };
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
    throw new Error(`Unknown tool: ${name}`);
  };
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
