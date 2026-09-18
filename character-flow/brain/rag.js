#!/usr/bin/env node
/**
 * rag.js — Shared Hybrid RAG Engine (BM25 + SQLite FTS5 + TF-IDF Cosine)
 *
 * Three-tier retrieval merged and ranked:
 *   1. BM25     — Okapi keyword relevance (pure JS)
 *   2. FTS5     — SQLite full-text search (fast, built-in)
 *   3. TF-IDF   — cosine similarity over term frequency vectors
 *
 * Both Izuku and Mahina instantiate their own RagEngine with separate DB paths.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Tokenizer ─────────────────────────────────────────────────────────────────

export function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9_]+/g) || [];
}

// ── BM25 (Okapi) ──────────────────────────────────────────────────────────────

export class BM25Index {
  constructor(documents) {
    // documents: [{id, title, content}]
    this.docs = documents;
    this.k1 = 1.5;
    this.b = 0.75;
    this._build();
  }

  _build() {
    this.n = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) =>
      s + tokenize(d.content + ' ' + d.title).length, 0) / Math.max(this.n, 1);
    this.df = {};
    this.tf = new Array(this.n).fill(null);
    for (let i = 0; i < this.n; i++) {
      const tokens = tokenize(this.docs[i].content + ' ' + this.docs[i].title);
      const counts = {};
      const unique = new Set();
      for (const t of tokens) { counts[t] = (counts[t] || 0) + 1; unique.add(t); }
      this.tf[i] = counts;
      for (const t of unique) this.df[t] = (this.df[t] || 0) + 1;
    }
    this.idf = {};
    for (const [t, df] of Object.entries(this.df)) {
      this.idf[t] = Math.log(1 + (this.n - df + 0.5) / (df + 0.5));
    }
  }

  score(query, idx) {
    const qt = tokenize(query);
    const dt = tokenize(this.docs[idx].content + ' ' + this.docs[idx].title);
    let score = 0;
    for (const q of qt) {
      if (!(q in this.df)) continue;
      const tf = (this.tf[idx][q] || 0);
      score += this.idf[q] * (tf * (this.k1 + 1)) /
        (tf + this.k1 * (1 - this.b + this.b * dt.length / this.avgdl));
    }
    return score;
  }
}

// ── TF-IDF Cosine Similarity ───────────────────────────────────────────────────

export class TfidfVectorizer {
  constructor(documents) {
    this.docs = documents;
    this._build();
  }

  _build() {
    this.docFreq = {};
    for (let i = 0; i < this.docs.length; i++) {
      const terms = new Set(tokenize(this.docs[i].content + ' ' + this.docs[i].title));
      for (const t of terms) this.docFreq[t] = (this.docFreq[t] || 0) + 1;
    }
    this.n = this.docs.length;
    this.vectors = this.docs.map(d => {
      const tokens = tokenize(d.content + ' ' + d.title);
      const tf = {};
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
      const vec = {};
      for (const [t, count] of Object.entries(tf)) {
        vec[t] = count * Math.log(1 + (this.n - (this.docFreq[t] || 0) + 0.5) / ((this.docFreq[t] || 0) + 0.5));
      }
      let norm = 0;
      for (const v of Object.values(vec)) norm += v * v;
      norm = Math.sqrt(norm) || 1;
      for (const k of Object.keys(vec)) vec[k] /= norm;
      return vec;
    });
  }

  queryVector(query) {
    const tokens = tokenize(query);
    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    const vec = {};
    for (const [t, count] of Object.entries(tf)) {
      vec[t] = count * Math.log(1 + (this.n - (this.docFreq[t] || 0) + 0.5) / ((this.docFreq[t] || 0) + 0.5));
    }
    let norm = 0;
    for (const v of Object.values(vec)) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (const k of Object.keys(vec)) vec[k] /= norm;
    return vec;
  }

  cosine(queryVec) {
    const scores = [];
    for (let i = 0; i < this.vectors.length; i++) {
      let dot = 0;
      for (const [t, v] of Object.entries(queryVec)) {
        if (this.vectors[i][t]) dot += v * this.vectors[i][t];
      }
      if (dot > 0) scores.push({ idx: i, score: dot });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
  }
}

// ── RAG Engine (persistent connection, no close between ops) ─────────────────

export class RagEngine {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.bm25 = null;
    this.tfidf = null;
    this._loaded = false;
  }

  _ensureDb() {
    if (this.db) return this.db;
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    try { this.db.pragma('enable_extension = fts5'); } catch (_) {}
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        category   TEXT NOT NULL DEFAULT 'general',
        title      TEXT NOT NULL,
        content    TEXT NOT NULL,
        source     TEXT DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_cat ON knowledge(category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_title ON knowledge(title);

      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        title, content, content=knowledge, content_rowid=id
      );

      CREATE TABLE IF NOT EXISTS wisdom_quotes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        text        TEXT NOT NULL,
        author      TEXT DEFAULT 'Character',
        theme       TEXT DEFAULT 'universal',
        source_law  TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_quotes_theme ON wisdom_quotes(theme);

      CREATE TABLE IF NOT EXISTS business_ideas (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT NOT NULL,
        description  TEXT NOT NULL,
        law_applied  TEXT,
        feasibility  TEXT DEFAULT 'medium',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return this.db;
  }

  /** Load in-memory indexes from DB (BM25 + TF-IDF) */
  load() {
    if (this._loaded) return;
    const db = this._ensureDb();
    const rows = db.prepare('SELECT id, category, title, content FROM knowledge').all();
    const quoteRows = db.prepare('SELECT id, text, theme FROM wisdom_quotes').all();

    const documents = [
      ...rows.map(r => ({ id: r.id, title: r.title, content: r.content, category: r.category })),
      ...quoteRows.map(r => ({ id: r.id, title: 'Quote', content: r.text, category: 'quote' })),
    ];

    this.bm25 = new BM25Index(documents);
    this.tfidf = new TfidfVectorizer(documents);
    this._loaded = true;
  }

  /** Hybrid search: BM25 + FTS5 + TF-IDF cosine → merge & rank */
  search(query, topK = 10) {
    if (!this._loaded) this.load();

    const scores = {};
    const docs = this.bm25.docs;

    // 1. BM25 scores
    for (let i = 0; i < docs.length; i++) {
      const s = this.bm25.score(query, i);
      if (s > 0) scores[docs[i].id] = { bm25: s };
    }

    // 2. TF-IDF cosine scores
    for (const c of this.tfidf.cosine(this.tfidf.queryVector(query)).slice(0, topK * 2)) {
      const doc = docs[c.idx];
      if (doc && !scores[doc.id]) scores[doc.id] = {};
      if (doc) scores[doc.id].tfidf = c.score;
    }

    // 3. FTS5 full-text search
    try {
      const db = this._ensureDb();
      const ftsQuery = query.split(/\s+/).map(w => `${w}*`).join(' OR ');
      const ftsRows = db.prepare(
        `SELECT k.id, k.title, k.content, k.category, k.source, k.created_at, rank FROM knowledge_fts WHERE knowledge_fts MATCH ? ORDER BY rank LIMIT ?`
      ).all(ftsQuery, topK * 2);
      for (const row of ftsRows) {
        if (!scores[row.id]) scores[row.id] = {};
        scores[row.id].fts = 1.0 / (1 + row.rank);
      }
    } catch (_) { /* FTS5 not available, skip */ }

    // Normalize and combine
    const ids = Object.keys(scores);
    const maxB = Math.max(...ids.map(id => scores[id].bm25 || 0), 0.001);
    const maxT = Math.max(...ids.map(id => scores[id].tfidf || 0), 0.001);
    const maxF = Math.max(...ids.map(id => scores[id].fts || 0), 0.001);

    for (const id of ids) {
      scores[id].combined =
        (scores[id].bm25 || 0) / maxB * 0.4 +
        (scores[id].tfidf || 0) / maxT * 0.35 +
        (scores[id].fts || 0) / maxF * 0.25;
    }
    ids.sort((a, b) => scores[b].combined - scores[a].combined);

    // Fetch full details
    const db = this._ensureDb();
    const placeholders = ids.slice(0, topK).map(() => '?').join(',');
    const rows = placeholders
      ? db.prepare(`SELECT id, category, title, content, source, created_at FROM knowledge WHERE id IN (${placeholders})`).all(...ids.slice(0, topK))
      : [];

    const seen = new Set();
    const results = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      results.push({
        id: row.id,
        category: row.category,
        title: row.title,
        content: row.content.substring(0, 400),
        score: Math.round((scores[row.id]?.combined || 0) * 100) / 100,
      });
    }

    // Add matching quotes to fill slots
    for (const id of ids) {
      if (results.length >= topK) break;
      const doc = docs.find(d => d.id == id);
      if (!doc || seen.has(id)) continue;
      const qr = db.prepare('SELECT text, theme, source_law FROM wisdom_quotes WHERE id = ?').get(id);
      if (qr) {
        seen.add(id);
        results.push({
          id: qr.id || id,
          category: 'quote',
          title: qr.theme || 'Quote',
          content: qr.text,
          score: Math.round((scores[id]?.combined || 0.8) * 100) / 100,
          quote: true,
        });
      }
    }

    return results.slice(0, topK);
  }

  getStats() {
    const db = this._ensureDb();
    return db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM knowledge) as k,
        (SELECT COUNT(*) FROM wisdom_quotes) as q,
        (SELECT COUNT(*) FROM business_ideas) as i
    `).get();
  }

  insertKnowledge(category, title, content, source = 'manual') {
    const db = this._ensureDb();
    const info = db.prepare('INSERT INTO knowledge (category, title, content, source) VALUES (?, ?, ?, ?)').run(category, title, content, source);
    this._loaded = false;
    return info.lastInsertRowid;
  }

  insertQuote(text, theme = 'universal', sourceLaw = null, author = 'Character') {
    const db = this._ensureDb();
    db.prepare('INSERT INTO wisdom_quotes (text, theme, source_law, author) VALUES (?, ?, ?, ?)').run(text, theme, sourceLaw, author);
    this._loaded = false;
  }

  insertIdea(title, description, lawApplied = null, feasibility = 'medium') {
    const db = this._ensureDb();
    db.prepare('INSERT INTO business_ideas (title, description, law_applied, feasibility) VALUES (?, ?, ?, ?)').run(title, description, lawApplied, feasibility);
  }

  getQuotes(theme = null, limit = 20) {
    const db = this._ensureDb();
    let sql = 'SELECT * FROM wisdom_quotes';
    const params = [];
    if (theme) { sql += ' WHERE theme = ?'; params.push(theme); }
    sql += ' ORDER BY RANDOM() LIMIT ?';
    params.push(limit);
    return db.prepare(sql).all(...params);
  }
}
