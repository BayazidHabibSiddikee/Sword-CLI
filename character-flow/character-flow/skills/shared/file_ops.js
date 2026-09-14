#!/usr/bin/env node
/**
 * file_ops.js — Shared file operations skill for all characters.
 * Read, write, edit, list, search files on the filesystem.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE = process.env.CHARACTER_WORKSPACE || '/home/sword/Documents/Characters/character-flow';

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Returns the full text.',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Absolute or relative path to the file' },
        },
        required: ['filepath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with given content. Use for scripts, config, docs.',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path where to write the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['filepath', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace text within a file. Provide oldText and newText (both must appear exactly).',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to the file' },
          oldText: { type: 'string', description: 'Exact text to replace' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['filepath', 'oldText', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories at a path. Supports recursive listing.',
      parameters: {
        type: 'object',
        properties: {
          dirpath: { type: 'string', description: 'Directory to list' },
          recursive: { type: 'boolean', description: 'List recursively', default: false },
          pattern: { type: 'string', description: 'Glob pattern filter (e.g. "*.js")' },
        },
        required: ['dirpath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files matching a glob pattern under a directory.',
      parameters: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Root directory to search in' },
          pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.py")' },
        },
        required: ['root', 'pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_content',
      description: 'Search for text content inside files (like grep). Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Root directory to search in' },
          pattern: { type: 'string', description: 'Regex or literal pattern to find' },
          extension: { type: 'string', description: 'File extension filter (e.g. ".js")' },
          max_results: { type: 'integer', description: 'Max matches to return', default: 20 },
        },
        required: ['root', 'pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_info',
      description: 'Get metadata about a file: size, modification time, permissions.',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to the file' },
        },
        required: ['filepath'],
      },
    },
  },
];

// ── Implementations ───────────────────────────────────────────────────────────

export function read_file(filepath) {
  const resolved = path.resolve(BASE, filepath);
  if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
  return fs.readFileSync(resolved, 'utf-8');
}

export function write_file(filepath, content) {
  const resolved = path.resolve(BASE, filepath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return JSON.stringify({ status: 'wrote', path: resolved, bytes: Buffer.byteLength(content) });
}

export function edit_file(filepath, oldText, newText) {
  const resolved = path.resolve(BASE, filepath);
  if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
  let content = fs.readFileSync(resolved, 'utf-8');
  if (!content.includes(oldText)) return JSON.stringify({ error: `Text not found in file. Old text was: "${oldText.slice(0, 80)}"` });
  const updated = content.replace(oldText, newText);
  fs.writeFileSync(resolved, updated, 'utf-8');
  return JSON.stringify({ status: 'edited', path: resolved, replacements: 1 });
}

export function list_dir(dirpath, recursive = false, pattern = null) {
  const resolved = path.resolve(BASE, dirpath);
  if (!fs.existsSync(resolved)) return JSON.stringify({ error: `Directory not found: ${resolved}` });
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else {
        if (pattern && !entry.name.match(new RegExp(pattern.replace('*', '.*')))) continue;
        results.push({ type: 'file', name: entry.name, path: full, size: entry.size });
      }
    }
  }
  walk(resolved);
  return JSON.stringify({ count: results.length, files: results.slice(0, 100) });
}

export function search_files(root, pattern) {
  const resolved = path.resolve(BASE, root);
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.match(new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.')))) {
        results.push(full);
      }
    }
  }
  walk(resolved);
  return JSON.stringify({ count: results.length, files: results.slice(0, 50) });
}

export function search_content(root, pattern, extension = null, max_results = 20) {
  const resolved = path.resolve(BASE, root);
  const regex = new RegExp(pattern, 'i');
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (extension && !entry.name.endsWith(extension)) continue;
      try {
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({ file: full, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (results.length >= max_results) return;
          }
        }
      } catch (_) { /* binary file, skip */ }
    }
  }
  walk(resolved);
  return JSON.stringify({ count: results.length, matches: results });
}

export function get_file_info(filepath) {
  const resolved = path.resolve(BASE, filepath);
  if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
  const stat = fs.statSync(resolved);
  return JSON.stringify({
    path: resolved,
    size: stat.size,
    modified: stat.mtime.toISOString(),
    created: stat.ctime.toISOString(),
    isFile: stat.isFile(),
    isDir: stat.isDirectory(),
  });
}

export async function execute(args) {
  const { filepath, ...params } = args;
  if (filepath === 'read_file') return read_file(params.filepath);
  if (filepath === 'write_file') return write_file(params.filepath, params.content);
  if (filepath === 'edit_file') return edit_file(params.filepath, params.oldText, params.newText);
  if (filepath === 'list_dir') return list_dir(params.dirpath, params.recursive, params.pattern);
  if (filepath === 'search_files') return search_files(params.root, params.pattern);
  if (filepath === 'search_content') return search_content(params.root, params.pattern, params.extension, params.max_results);
  if (filepath === 'get_file_info') return get_file_info(params.filepath);
  return JSON.stringify({ error: 'Unknown operation' });
}
