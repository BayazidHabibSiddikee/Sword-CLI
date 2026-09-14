#!/usr/bin/env node
/**
 * doc_tools.js — Document conversion skills (PDF, DOCX, XLSX, PPTX).
 * Uses mammoth for DOCX→HTML and pdf-parse for PDF extraction.
 */

import fs from 'fs';
import path from 'path';

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'docx_to_text',
      description: 'Extract text from a .docx file. Returns plain text content.',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to .docx file' },
        },
        required: ['filepath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pdf_to_text',
      description: 'Extract text from a .pdf file using pdf-parse.',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to .pdf file' },
          max_pages: { type: 'integer', description: 'Max pages to extract (default 10)', default: 10 },
        },
        required: ['filepath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_documents',
      description: 'List all document files (.pdf, .docx, .xlsx, .pptx) in a directory.',
      parameters: {
        type: 'object',
        properties: {
          dirpath: { type: 'string', description: 'Directory to scan' },
          extensions: { type: 'array', items: { type: 'string' }, description: 'File extensions to look for', default: ['.pdf', '.docx', '.xlsx', '.pptx'] },
        },
        required: ['dirpath'],
      },
    },
  },
];

const BASE = process.env.CHARACTER_WORKSPACE || '/home/sword/Documents/Characters/character-flow';

export async function execute(toolName, args) {
  if (toolName === 'docx_to_text') {
    const resolved = path.resolve(BASE, args.filepath);
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: resolved });
      return JSON.stringify({ success: true, text: result.value.slice(0, 5000), warnings: result.messages });
    } catch (e) {
      // Fallback: try reading as zip
      return JSON.stringify({ error: `DOCX parse failed: ${e.message}. Try using run_python with python-docx.` });
    }
  }
  else if (toolName === 'pdf_to_text') {
    const resolved = path.resolve(BASE, args.filepath);
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = fs.readFileSync(resolved);
      const data = await pdfParse(buffer);
      const pages = data.text.split('\n\n').slice(0, args.max_pages).join('\n\n');
      return JSON.stringify({ success: true, pages: data.numpages, extracted: pages.length, text: pages.slice(0, 5000) });
    } catch (e) {
      return JSON.stringify({ error: `PDF parse failed: ${e.message}` });
    }
  }
  else if (toolName === 'list_documents') {
    const resolved = path.resolve(BASE, args.dirpath);
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `Directory not found: ${resolved}` });
    const exts = args.extensions || ['.pdf', '.docx', '.xlsx', '.pptx'];
    const results = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (exts.some(e => entry.name.toLowerCase().endsWith(e))) {
          const stat = fs.statSync(full);
          results.push({ name: entry.name, path: full, size: stat.size, modified: stat.mtime.toISOString() });
        }
      }
    }
    walk(resolved);
    return JSON.stringify({ count: results.length, documents: results.slice(0, 50) });
  }
  return JSON.stringify({ error: 'Unknown tool' });
}
