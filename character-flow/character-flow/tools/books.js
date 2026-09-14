#!/usr/bin/env node
/**
 * tools/books.js — Book/document downloading and indexing
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const _ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOC_DIR = join(_ROOT, 'data', 'documents');
mkdirSync(DOC_DIR, { recursive: true });

const BOOK_SOURCES = {
  // Free classic books
  gutenberg: {
    name: 'Project Gutenberg',
    fetch: async (query) => {
      try {
        const res = await fetch(`https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(8000)
        });
        const html = await res.text();
        const books = [];
        const re = /<li class="bookid"[^>]*>.*?<a href="(\/ebooks\/\d+)"[^>]*>([^<]+)<\/a>/gs;
        let m;
        while ((m = re.exec(html)) && books.length < 10) {
          books.push({ id: m[2]?.trim(), url: `https://www.gutenberg.org${m[1]}`, title: m[2]?.trim() });
        }
        return books;
      } catch { return []; }
    }
  },
  // Internet Archive
  archive: {
    name: 'Internet Archive',
    fetch: async (query) => {
      try {
        const res = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:texts&fl[]=identifier,title&rows=10&output=json`);
        const data = await res.json();
        return (data.response?.docs || []).map(d => ({
          title: d.title, identifier: d.identifier,
          url: `https://archive.org/details/${d.identifier}`
        }));
      } catch { return []; }
    }
  }
};

/** Search for books across sources */
export async function searchBooks(query, limit = 10) {
  const results = [];
  const promises = Object.entries(BOOK_SOURCES).map(async ([key, source]) => {
    try {
      const books = await source.fetch(query);
      for (const b of books) results.push({ ...b, source: source.name });
    } catch (_) {}
  });
  await Promise.allSettled(promises);
  return results.slice(0, limit);
}

/** Download a book from URL (simplified: saves page as text) */
export async function downloadBook(url, filename) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    // Extract main content
    const content = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .substring(0, 50000);

    const safeName = (filename || 'book').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dest = join(DOC_DIR, `${safeName}.txt`);
    writeFileSync(dest, content, 'utf-8');
    return { success: true, filename: `${safeName}.txt`, size: content.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** List all downloaded books */
export function listBooks() {
  if (!existsSync(DOC_DIR)) return [];
  return require('fs').readdirSync(DOC_DIR)
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const stat = require('fs').statSync(join(DOC_DIR, f));
      return { filename: f, size: stat.size, modified: stat.mtime.toISOString() };
    });
}
