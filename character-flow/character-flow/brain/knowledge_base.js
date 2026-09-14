#!/usr/bin/env node
/**
 * knowledge_base.js — File upload, parsing, chunking, indexing for RAG.
 *
 * Supported formats: PDF, DOCX, TXT, MD
 * Storage: data/documents/ (files) + rag.js DB (chunks)
 *
 * Usage:
 *   import { KnowledgeBase } from './knowledge_base.js';
 *   const kb = new KnowledgeBase(ragEngine);
 *   await kb.upload(filePath, category, title);
 */

import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import mammothModule from 'mammoth';

const _ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOC_DIR = join(_ROOT, 'data', 'documents');

// ── Chunk splitter ────────────────────────────────────────────────────────────

function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = start + chunkSize;
    let actualEnd = end;
    // Break at sentence boundary if within last 20% of chunk
    const searchStart = Math.max(start, end - chunkSize * 0.2);
    const breakAt = text.lastIndexOf('.', end - 1);
    if (breakAt > searchStart) actualEnd = breakAt + 1;
    chunks.push(text.slice(start, actualEnd).trim());
    start = Math.max(0, actualEnd - overlap);
  }
  return chunks.filter(c => c.length > 20);
}

// ── File parsers ───────────────────────────────────────────────────────────────

async function parsePDF(buffer) {
  const parser = new PDFParse({ verbosity: 0 });
  const data = await parser.parse(buffer);
  return data.text || '';
}

async function parseDOCX(buffer) {
  const result = await mammothModule.extractRawText({ buffer });
  return result.value || '';
}

function parseTXT(buffer) {
  return buffer.toString('utf-8');
}

function parseMD(buffer) {
  return buffer.toString('utf-8');
}

const PARSERS = {
  '.pdf': parsePDF,
  '.docx': parseDOCX,
  '.txt': parseTXT,
  '.md': parseMD,
  '.markdown': parseMD,
};

// ── Knowledge Base class ───────────────────────────────────────────────────────

export class KnowledgeBase {
  constructor(ragEngine) {
    this.rag = ragEngine;
    this.docDir = DOC_DIR;
    mkdirSync(this.docDir, { recursive: true });
  }

  /** List all uploaded documents with metadata */
  list() {
    const db = this.rag._ensureDb();
    const rows = db.prepare(`
      SELECT id, filename, category, title, content_hash, created_at, size_bytes
      FROM knowledge ORDER BY created_at DESC
    `).all();
    db.close();
    return rows;
  }

  /** Get raw file content by filename */
  getContent(filename) {
    const filePath = join(this.docDir, filename);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  }

  /** Upload a file: save to disk, parse, chunk, insert into DB */
  async upload(filePath, category = 'document', title = null) {
    const filename = filePath.split('/').pop();
    const ext = extname(filename).toLowerCase();

    if (!PARSERS[ext]) {
      throw new Error(`Unsupported file type: ${ext}. Supported: ${Object.keys(PARSERS).join(', ')}`);
    }

    const fullPath = join(this.docDir, filename);
    mkdirSync(dirname(fullPath), { recursive: true });

    const buffer = readFileSync(fullPath);
    let text = await PARSERS[ext](buffer);
    if (!text || text.trim().length === 0) {
      throw new Error(`Could not extract text from ${filename}`);
    }
    if (text.length > 500000) text = text.substring(0, 500000);

    // SHA-256 hash
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);

    // Insert chunks
    const chunks = chunkText(text);
    const db = this.rag._ensureDb();
    const insertStmt = db.prepare(
      `INSERT INTO knowledge (category, title, content, source, content_hash, size_bytes) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const chunk of chunks) {
      insertStmt.run(category, title || filename, chunk, `file:${filename}`, hash, buffer.length);
    }
    db.close();
    this.rag._loaded = false;

    return { filename, category, title: title || filename, chunkCount: chunks.length, sizeBytes: buffer.length };
  }

  /** Upload from buffer (for API endpoints) */
  async uploadBuffer(buffer, originalName, category = 'document', title = null) {
    const filename = originalName.replace(/[^\w.\-]/g, '_');
    const ext = extname(filename).toLowerCase();
    if (!PARSERS[ext]) throw new Error(`Unsupported file type: ${ext}`);
    const fullPath = join(this.docDir, filename);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, buffer);
    return this.upload(fullPath, category, title);
  }

  /** Delete a document: remove file + DB entries + refresh indexes */
  remove(filename) {
    const filePath = join(this.docDir, filename);
    if (existsSync(filePath)) rmSync(filePath);
    const db = this.rag._ensureDb();
    db.prepare('DELETE FROM knowledge WHERE source = ?').run(`file:${filename}`);
    // Rebuild FTS5
    try {
      db.prepare('DELETE FROM knowledge_fts').run();
      const rows = db.prepare('SELECT id, title, content FROM knowledge').all();
      for (const r of rows) {
        db.prepare('INSERT INTO knowledge_fts (id, title, content) VALUES (?, ?, ?)').run(r.id, r.title, r.content);
      }
    } catch (_) {}
    db.close();
    this.rag._loaded = false;
    return true;
  }

  /** Search document metadata only (fast) */
  searchDocs(query, topK = 10) {
    const db = this.rag._ensureDb();
    const rows = db.prepare(`
      SELECT DISTINCT source as filename, category, title, COUNT(*) as chunk_count
      FROM knowledge WHERE (title || ' ' || content) LIKE ?
      GROUP BY source ORDER BY chunk_count DESC LIMIT ?
    `).all(`%${query}%`, topK);
    db.close();
    return rows.map(r => ({ ...r, filename: r.filename.replace('file:', '') }));
  }

  /** Stats: total docs, files on disk, total chunks */
  stats() {
    const db = this.rag._ensureDb();
    const s = db.prepare(`
      SELECT
        COUNT(DISTINCT source) as doc_count,
        COUNT(*) as chunk_count,
        SUM(LENGTH(content)) as total_chars
      FROM knowledge WHERE source LIKE 'file:%'
    `).get();
    const files = existsSync(this.docDir)
      ? readdirSync(this.docDir).filter(f => !f.startsWith('.'))
      : [];
    db.close();
    return { ...s, fileCount: files.length, files };
  }

  /** Add a free-text entry to the knowledge base (no file) */
  addEntry(category, title, content) {
    const db = this.rag._ensureDb();
    db.prepare('INSERT INTO knowledge (category, title, content, source) VALUES (?, ?, ?, ?)').run(category, title, content, 'manual');
    db.close();
    this.rag._loaded = false;
  }
}
