// Minimal tool catalog: files + shell, sandboxed to session workdir.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAX_OUT = 20000;

export function containPath(workdir, p) {
  const wd = path.resolve(workdir);
  const resolved = path.resolve(wd, p);
  if (resolved === wd || resolved.startsWith(wd + path.sep)) return resolved;
  return null;
}

export const toolDefs = [
  { type: 'function', function: { name: 'read_file', description: 'Read a text file inside the workdir.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } },
  { type: 'function', function: { name: 'list_dir', description: 'List a directory inside the workdir.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a file inside the workdir.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } } },
  { type: 'function', function: { name: 'edit_file', description: 'Replace one exact string in a file.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'], additionalProperties: false } } },
  { type: 'function', function: { name: 'search', description: 'Literal text search across workdir files (bounded).',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'run_shell', description: 'Run a shell command in the workdir (120s cap).',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'], additionalProperties: false } } },
];

export async function execTool(name, args, workdir, signal) {
  try {
    if (name === 'read_file') {
      const r = containPath(workdir, String(args.path || ''));
      if (!r) return { ok: false, text: 'path escapes workdir' };
      const raw = await fs.readFile(r, 'utf8');
      return { ok: true, text: raw.slice(0, MAX_OUT) };
    }
    if (name === 'list_dir') {
      const r = containPath(workdir, String(args.path || '.'));
      if (!r) return { ok: false, text: 'path escapes workdir' };
      const entries = await fs.readdir(r, { withFileTypes: true });
      return { ok: true, text: entries.slice(0, 500).map(e => (e.isDirectory() ? e.name + '/' : e.name)).join('\n') };
    }
    if (name === 'write_file') {
      const r = containPath(workdir, String(args.path || ''));
      if (!r) return { ok: false, text: 'path escapes workdir' };
      await fs.mkdir(path.dirname(r), { recursive: true });
      await fs.writeFile(r, String(args.content ?? ''), 'utf8');
      return { ok: true, text: `wrote ${String(args.content ?? '').length} chars` };
    }
    if (name === 'edit_file') {
      const r = containPath(workdir, String(args.path || ''));
      if (!r) return { ok: false, text: 'path escapes workdir' };
      const raw = await fs.readFile(r, 'utf8');
      const idx = raw.indexOf(String(args.old_string ?? ''));
      if (idx < 0 || raw.indexOf(String(args.old_string ?? ''), idx + 1) >= 0)
        return { ok: false, text: 'old_string must occur exactly once' };
      await fs.writeFile(r, raw.replace(String(args.old_string), String(args.new_string ?? '')), 'utf8');
      return { ok: true, text: 'edited' };
    }
    if (name === 'search') {
      const q = String(args.query || '');
      const hits = [];
      async function walk(dir, depth) {
        if (hits.length >= 50 || depth > 6) return;
        let entries = [];
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (hits.length >= 50) break;
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) await walk(full, depth + 1);
          else { try {
            const c = await fs.readFile(full, 'utf8');
            c.split('\n').forEach((line, i) => { if (line.includes(q) && hits.length < 50) hits.push(`${path.relative(workdir, full)}:${i + 1}: ${line.slice(0, 200)}`); });
          } catch {} }
        }
      }
      await walk(path.resolve(workdir), 0);
      return { ok: true, text: hits.join('\n') || '(no matches)' };
    }
    if (name === 'run_shell') {
      return await runShell(String(args.command || ''), workdir, signal);
    }
    return { ok: false, text: `unknown tool: ${name}` };
  } catch (e) { return { ok: false, text: String(e?.message ?? e).slice(0, 2000) }; }
}

function runShell(command, cwd, signal) {
  return new Promise((resolve) => {
    if (!command.trim()) { resolve({ ok: false, text: 'empty command' }); return; }
    const child = spawn('/bin/sh', ['-c', command], { cwd, detached: process.platform !== 'win32' });
    let out = '';
    child.stdout?.on('data', d => { out = (out + d).slice(-MAX_OUT); });
    child.stderr?.on('data', d => { out = (out + d).slice(-MAX_OUT); });
    const kill = () => { try { process.platform !== 'win32' && child.pid ? process.kill(-child.pid, 'SIGKILL') : child.kill('SIGKILL'); } catch {} };
    const timer = setTimeout(() => { out += '\n[timeout 120s]'; kill(); }, 120000);
    signal?.addEventListener('abort', kill, { once: true });
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, text: e.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, text: `[exit ${code}]\n${out.slice(-MAX_OUT)}` }); });
  });
}
