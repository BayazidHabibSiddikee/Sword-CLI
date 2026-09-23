import fs from 'fs/promises';
import type { Dirent } from 'node:fs';
import path from 'path';
import { rgPath, rgAvailable } from './rg.js';
import type { AgentTool } from '../types.js';

/** Resolve `p` (absolute or relative) against `workdir` and refuse anything
 *  that escapes the sandbox. Returns null when the escape is detected. */
export function containPath(workdir: string, p: string): string | null {
  const wd = path.resolve(workdir);
  const resolved = path.resolve(wd, p);
  if (resolved === wd) return resolved;
  if (resolved.startsWith(wd + path.sep)) return resolved;
  return null;
}

/** Workdir-relative display for logs/UI. */
export function relativeLabel(workdir: string, resolved: string): string {
  return path.relative(workdir, resolved) || '.';
}

const argText = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? (args[key] as string) : undefined;

export const fileTools: AgentTool[] = [
  {
    name: 'read_file',
    description:
      'Read a text file inside the session workdir. Paths are relative to the workdir (or absolute within it). For large files use offset/limit (line numbers start at 1).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (workdir-relative or absolute within workdir)' },
        offset: { type: 'number', description: 'First line to read (1-based). Default 1.' },
        limit: { type: 'number', description: 'Number of lines to read. Default: whole file.' },
      },
      required: ['path'],
    },
    source: 'builtin',
    async execute(args, ctx) {
      const p = argText(args, 'path');
      if (!p) return { ok: false, text: 'read_file: missing required argument "path"' };
      const resolved = containPath(ctx.workdir, p);
      if (!resolved) return { ok: false, text: `read_file: path escapes workdir: ${p}` };
      try {
        const raw = await fs.readFile(resolved, 'utf8');
        const lines = raw.split('\n');
        const start = Math.max(1, Number(args.offset ?? 1) || 1);
        const end = args.limit ? start + Number(args.limit) - 1 : lines.length;
        const slice = lines.slice(start - 1, end).join('\n');
        const numbered = slice
          .split('\n')
          .map((line, i) => `${start + i}: ${line}`)
          .join('\n');
        return { ok: true, text: numbered };
      } catch (err) {
        return { ok: false, text: `read_file failed: ${(err as Error).message}` };
      }
    },
  },
  {
    name: 'write_file',
    description:
      'Create or overwrite a file inside the session workdir. Parent directories are created automatically.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (workdir-relative or absolute within workdir)' },
        content: { type: 'string', description: 'Full new file content' },
      },
      required: ['path', 'content'],
    },
    source: 'builtin',
    async execute(args, ctx) {
      const p = argText(args, 'path');
      const content = argText(args, 'content');
      if (!p || content === undefined) {
        return { ok: false, text: 'write_file: "path" and "content" are required' };
      }
      const resolved = containPath(ctx.workdir, p);
      if (!resolved) return { ok: false, text: `write_file: path escapes workdir: ${p}` };
      try {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, 'utf8');
        return {
          ok: true,
          text: `Wrote ${content.length} chars to ${relativeLabel(ctx.workdir, resolved)}`,
        };
      } catch (err) {
        return { ok: false, text: `write_file failed: ${(err as Error).message}` };
      }
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace an exact string in a file inside the session workdir. old_string must match exactly (including whitespace) and occur exactly once; otherwise the edit fails. Read the file first if unsure of its exact contents.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: 'Exact text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    source: 'builtin',
    async execute(args, ctx) {
      const p = argText(args, 'path');
      const oldStr = argText(args, 'old_string');
      const newStr = argText(args, 'new_string');
      if (!p || oldStr === undefined || newStr === undefined) {
        return { ok: false, text: 'edit_file: "path", "old_string" and "new_string" are required' };
      }
      if (oldStr === newStr) return { ok: false, text: 'edit_file: old_string and new_string are identical' };
      const resolved = containPath(ctx.workdir, p);
      if (!resolved) return { ok: false, text: `edit_file: path escapes workdir: ${p}` };
      try {
        const raw = await fs.readFile(resolved, 'utf8');
        const count = raw.split(oldStr).length - 1;
        if (count === 0) {
          return {
            ok: false,
            text: `edit_file: old_string not found in ${relativeLabel(ctx.workdir, resolved)}. Read the file and copy the exact text (whitespace matters).`,
          };
        }
        if (count > 1) {
          return {
            ok: false,
            text: `edit_file: old_string occurs ${count} times — include more surrounding context to make it unique.`,
          };
        }
        await fs.writeFile(resolved, raw.replace(oldStr, newStr), 'utf8');
        return { ok: true, text: `Edited ${relativeLabel(ctx.workdir, resolved)} (1 replacement)` };
      } catch (err) {
        return { ok: false, text: `edit_file failed: ${(err as Error).message}` };
      }
    },
  },
  {
    name: 'list_dir',
    description:
      'List files and directories inside the session workdir (recursive; node_modules and .git are skipped).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workdir-relative directory. Default: workdir root.' },
        maxResults: { type: 'number', description: 'Default 200.' },
      },
    },
    source: 'builtin',
    async execute(args, ctx) {
      const p = argText(args, 'path') || '.';
      const max = Math.max(1, Number(args.maxResults ?? 200));
      const start = containPath(ctx.workdir, p);
      if (!start) return { ok: false, text: `list_dir: path escapes workdir: ${p}` };
      const lines: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        if (lines.length >= max) return;
        let entries: Dirent<string>[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (lines.length >= max) return;
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          const full = path.join(dir, entry.name);
          lines.push(`${entry.isDirectory() ? 'd' : '-'} ${relativeLabel(ctx.workdir, full)}`);
          if (entry.isDirectory()) await walk(full);
        }
      };
      await walk(start);
      if (lines.length === 0) return { ok: true, text: `(empty directory: ${relativeLabel(ctx.workdir, start)})` };
      const more = lines.length >= max ? `\n… (truncated at ${max} entries)` : '';
      return { ok: true, text: lines.join('\n') + more };
    },
  },
  {
    name: 'search_file',
    description:
      'Regex-search file contents inside the session workdir (skips node_modules/.git). Uses ripgrep when available, otherwise a built-in Node walker. Returns "file:line: text" lines.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for' },
        path: { type: 'string', description: 'Workdir-relative dir/file to search in. Default: whole workdir.' },
        filePattern: { type: 'string', description: 'Substring filter on file paths, e.g. "src/" or ".ts"' },
        maxResults: { type: 'number', description: 'Default 100.' },
      },
      required: ['pattern'],
    },
    source: 'builtin',
    async execute(args, ctx) {
      const pattern = argText(args, 'pattern');
      if (!pattern) return { ok: false, text: 'search_file: missing required argument "pattern"' };
      const scope = containPath(ctx.workdir, argText(args, 'path') || '.');
      if (!scope) return { ok: false, text: `search_file: path escapes workdir` };
      const max = Math.max(1, Number(args.maxResults ?? 100));
      const fileFilter = argText(args, 'filePattern');
      try {
        const out = await searchContents(scope, pattern, fileFilter, max, ctx.signal);
        if (out.length === 0) return { ok: true, text: '(no matches)' };
        const shown = out.slice(0, max);
        const more = out.length > max ? `\n… (${out.length - max} more not shown)` : '';
        return { ok: true, text: shown.join('\n') + more };
      } catch (err) {
        return { ok: false, text: `search_file failed: ${(err as Error).message}` };
      }
    },
  },
];

/** Contents search: ripgrep when on PATH, else a Node walker. */
async function searchContents(
  scope: string,
  pattern: string,
  fileFilter: string | undefined,
  max: number,
  signal: AbortSignal,
): Promise<string[]> {
  if (await rgAvailable()) {
    const { execFile } = await import('node:child_process');
    const args = ['--line-number', '--max-count', String(max), '-e', pattern, scope];
    if (fileFilter) args.push('--glob', fileFilter);
    return await new Promise((resolve) => {
      execFile(
        rgPath(),
        args,
        { timeout: 30_000, maxBuffer: 1024 * 1024, signal },
        (err, stdout) => {
          if (err) {
            // ripgrep exits 1 on "no matches" — not a real failure.
            resolve(stdout ? stdout.trimEnd().split('\n') : []);
            return;
          }
          resolve(stdout ? stdout.trimEnd().split('\n') : []);
        },
      );
    });
  }

  // Fallback walker.
  const re = new RegExp(pattern);
  const results: string[] = [];
  const cap = max * 3;
  const walk = async (dir: string): Promise<void> => {
    if (results.length >= cap) return;
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= cap) return;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(scope, full).split(path.sep).join('/');
        if (fileFilter && !rel.includes(fileFilter)) continue;
        let raw: string;
        try {
          raw = await fs.readFile(full, 'utf8');
        } catch {
          continue;
        }
        if (raw.includes('\u0000')) continue; // binary
        const lines = raw.split('\n');
        for (let i = 0; i < lines.length && results.length < cap; i++) {
          re.lastIndex = 0;
          if (re.test(lines[i])) {
            results.push(`${full}:${i + 1}: ${lines[i].slice(0, 300)}`);
          }
        }
      }
    }
  };
  await walk(scope);
  return results.slice(0, max);
}
