/**
 * file_edit.js — Advanced file editing skill for character-flow agents.
 * Provides search-replace, create-dir, append-file, and structured edits
 * that go beyond simple read/write — matching opencode's editing workflow.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DOCS_ROOT = '/home/sword/Documents';

function resolvePath(rel) {
  if (rel.startsWith('/')) return rel;
  const tries = [
    `${DOCS_ROOT}/${rel}`,
    `./${rel}`,
    path.join(process.cwd(), rel),
  ];
  for (const p of tries) {
    if (fs.existsSync(p)) return p;
  }
  return tries[0];
}

function ensureDir(fileOrDir) {
  const dir = fs.statSync(fileOrDir).isDirectory() ? fileOrDir : path.dirname(fileOrDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Tool definitions ────────────────────────────────────────────────────────────
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_replace',
      description: 'Search and replace text in a file. Replaces ALL occurrences of the exact string. For targeted edits use multiple calls. Returns diff-style before/after for the replaced sections.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (resolved relative to /home/sword/Documents/)' },
          old_string: { type: 'string', description: 'Exact text to find (case-sensitive, includes whitespace)' },
          new_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_after',
      description: 'Insert text after a matching line in a file. Useful for adding imports, appending to sections, or inserting between blocks.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          anchor: { type: 'string', description: 'Line content to match (insert AFTER this line)' },
          new_content: { type: 'string', description: 'Text to insert' },
        },
        required: ['path', 'anchor', 'new_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_before',
      description: 'Insert text before a matching line in a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          anchor: { type: 'string', description: 'Line content to match (insert BEFORE this line)' },
          new_content: { type: 'string' },
        },
        required: ['path', 'anchor', 'new_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_file',
      description: 'Append content to the end of a file. Creates the file if it does not exist.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_block',
      description: 'Replace a block of text between two markers (start_line and end_line are 1-indexed). For structured multi-line edits.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          start_line: { type: 'integer', description: '1-indexed start line (inclusive)' },
          end_line: { type: 'integer', description: '1-indexed end line (inclusive)' },
          new_content: { type: 'string', description: 'Replacement content' },
        },
        required: ['path', 'start_line', 'end_line', 'new_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_dir',
      description: 'Create a directory (and parent dirs). Safe — no-op if exists.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file. irreversible — verify path before deleting.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Fast grep-like search across files. Returns file paths, line numbers, and matching lines. Supports regex patterns and extension filters.',
      parameters: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Directory to search in' },
          pattern: { type: 'string', description: 'Regex or plain text pattern' },
          extension: { type: 'string', description: 'Filter by extension, e.g. ".js"' },
          max_results: { type: 'integer', default: 50 },
          context_lines: { type: 'integer', default: 2, description: 'Lines before/after match' },
        },
        required: ['root', 'pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_lines',
      description: 'Count lines, words, and characters in one or more files. Fast overview of codebase size.',
      parameters: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Files or directories to analyze' },
        },
        required: ['paths'],
      },
    },
  },
];

// ── Executor ────────────────────────────────────────────────────────────────────
export async function execute(toolName, args) {
  try {
    if (toolName === 'search_replace') {
      const p = resolvePath(args.path);
      if (!fs.existsSync(p)) return JSON.stringify({ error: `File not found: ${p}` });
      const content = fs.readFileSync(p, 'utf-8');
      if (!content.includes(args.old_string)) {
        return JSON.stringify({ error: `Old string not found in file`, hint: 'Use grep_search to find the text first' });
      }
      const count = (content.match(new RegExp(args.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      const newContent = content.split(args.old_string).join(args.new_string);
      fs.writeFileSync(p, newContent, 'utf-8');
      const before = args.old_string.split('\n').length;
      const after = args.new_string.split('\n').length;
      return JSON.stringify({
        success: true, path: p, replacements: count,
        summary: `Replaced ${count} occurrence(s) of ${before} line(s) with ${after} line(s)`,
      });
    }

    if (toolName === 'insert_after') {
      const p = resolvePath(args.path);
      if (!fs.existsSync(p)) return JSON.stringify({ error: `File not found: ${p}` });
      const lines = fs.readFileSync(p, 'utf-8').split('\n');
      let inserted = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(args.anchor)) {
          lines.splice(i + 1, 0, args.new_content);
          inserted = true;
          break;
        }
      }
      if (!inserted) return JSON.stringify({ error: `Anchor line not found: "${args.anchor}"` });
      fs.writeFileSync(p, lines.join('\n'), 'utf-8');
      return JSON.stringify({ success: true, path: p, inserted_at_line: lines.indexOf(args.new_content.split('\n')[0]) + 1 });
    }

    if (toolName === 'insert_before') {
      const p = resolvePath(args.path);
      if (!fs.existsSync(p)) return JSON.stringify({ error: `File not found: ${p}` });
      const lines = fs.readFileSync(p, 'utf-8').split('\n');
      let inserted = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(args.anchor)) {
          lines.splice(i, 0, args.new_content);
          inserted = true;
          break;
        }
      }
      if (!inserted) return JSON.stringify({ error: `Anchor line not found: "${args.anchor}"` });
      fs.writeFileSync(p, lines.join('\n'), 'utf-8');
      return JSON.stringify({ success: true, path: p, inserted_at_line: lines.indexOf(args.new_content.split('\n')[0]) + 1 });
    }

    if (toolName === 'append_file') {
      const p = resolvePath(args.path);
      ensureDir(p);
      fs.appendFileSync(p, args.content, 'utf-8');
      const totalLines = fs.readFileSync(p, 'utf-8').split('\n').length;
      return JSON.stringify({ success: true, path: p, appended_bytes: Buffer.byteLength(args.content), total_lines: totalLines });
    }

    if (toolName === 'replace_block') {
      const p = resolvePath(args.path);
      if (!fs.existsSync(p)) return JSON.stringify({ error: `File not found: ${p}` });
      const lines = fs.readFileSync(p, 'utf-8').split('\n');
      const start = Math.max(0, (args.start_line || 1) - 1);
      const end = Math.min(lines.length, args.end_line || lines.length);
      const replaced = lines.slice(start, end);
      lines.splice(start, end - start, ...args.new_content.split('\n'));
      fs.writeFileSync(p, lines.join('\n'), 'utf-8');
      return JSON.stringify({
        success: true, path: p,
        replaced_lines: replaced.length, new_lines: args.new_content.split('\n').length,
        old_block: replaced.map(l => '  ' + l).join('\n'),
        new_block: args.new_content.split('\n').map(l => '  ' + l).join('\n'),
      });
    }

    if (toolName === 'create_dir') {
      const p = resolvePath(args.path);
      fs.mkdirSync(p, { recursive: true });
      return JSON.stringify({ success: true, path: p, created: !fs.existsSync(p + '/.keep') });
    }

    if (toolName === 'delete_file') {
      const p = resolvePath(args.path);
      if (!fs.existsSync(p)) return JSON.stringify({ error: `File not found: ${p}` });
      fs.unlinkSync(p);
      return JSON.stringify({ success: true, deleted: p });
    }

    if (toolName === 'grep_search') {
      const root = resolvePath(args.root);
      if (!fs.existsSync(root)) return JSON.stringify({ error: `Directory not found: ${root}` });
      const ext = args.extension || null;
      const maxResults = args.max_results || 50;
      const ctxLines = args.context_lines || 2;
      let regex;
      try { regex = new RegExp(args.pattern, 'i'); } catch (e) { regex = new RegExp(args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
      const results = [];
      function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (results.length >= maxResults) return;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(full); continue; }
          if (ext && !entry.name.endsWith(ext)) continue;
          try {
            const lines = fs.readFileSync(full, 'utf-8').split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                const ctx = [];
                for (let j = Math.max(0, i - ctxLines); j <= Math.min(lines.length - 1, i + ctxLines); j++) {
                  const prefix = j === i ? '>>> ' : '    ';
                  ctx.push(`${prefix}${j + 1}: ${lines[j]}`);
                }
                results.push({ file: full, line: i + 1, context: ctx.join('\n') });
                if (results.length >= maxResults) return;
              }
            }
          } catch (_) {}
        }
      }
      walk(root);
      return JSON.stringify({ root, pattern: args.pattern, count: results.length, matches: results });
    }

    if (toolName === 'count_lines') {
      const stats = [];
      for (const p of (args.paths || [])) {
        const fullPath = resolvePath(p);
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            let totalLines = 0, totalWords = 0, totalChars = 0;
            function walkDir(dir) {
              for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const f = path.join(dir, e.name);
                if (e.isDirectory()) { walkDir(f); continue; }
                try {
                  const c = fs.readFileSync(f, 'utf-8');
                  totalLines += c.split('\n').length;
                  totalWords += c.split(/\s+/).filter(Boolean).length;
                  totalChars += c.length;
                } catch (_) {}
              }
            }
            walkDir(fullPath);
            stats.push({ path: fullPath, type: 'dir', lines: totalLines, words: totalWords, chars: totalChars });
          } else {
            const c = fs.readFileSync(fullPath, 'utf-8');
            stats.push({
              path: fullPath, type: 'file',
              lines: c.split('\n').length,
              words: c.split(/\s+/).filter(Boolean).length,
              chars: c.length,
            });
          }
        } catch (e) {
          stats.push({ path: fullPath, error: e.message });
        }
      }
      return JSON.stringify({ stats });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
