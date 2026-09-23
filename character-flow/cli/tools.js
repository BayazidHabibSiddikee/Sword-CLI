import { lstat, readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, sep, dirname } from 'node:path';
import { spawn } from 'node:child_process';

const LIMIT = 64000;
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
  definition('run_command', 'Run executable and arguments with approval. No shell parsing; NOT sandboxed.', { command: string, args: { type: 'array', items: string } }, ['command', 'args'])
];
function text(value, label, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > LIMIT || value.includes('\0')) throw new Error(`Invalid ${label}`);
  return value;
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
