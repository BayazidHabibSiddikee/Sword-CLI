import { describe, it, expect } from 'vitest';
import {
  tokenize, bm25, embed, cosine, extractText, indexDocument, deleteDocument, hybridSearch,
} from '../../services/rag.js';

describe('RAG tokenization', () => {
  it('lowercases, splits words and drops stopwords + single chars', () => {
    const terms = tokenize('The CTO approved the BM25 Embedding architecture!');
    expect(terms).toContain('cto');
    expect(terms).toContain('bm25');
    expect(terms).toContain('embedding');
    expect(terms).not.toContain('the');
    expect(terms.every((t) => t.length > 1)).toBe(true);
  });
});

describe('RAG BM25', () => {
  it('ranks chunks that match more query terms ahead of non-matching ones', () => {
    const chunks = [
      { id: 'a', text: 'The hybrid RAG system uses BM25 and embedding retrieval.' },
      { id: 'b', text: 'Financial reports for the marketing team.' },
    ];
    const results = bm25(chunks, 'BM25 embedding retrieval hybrid RAG');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('a');
  });
});

describe('RAG embeddings + cosine', () => {
  it('returns a unit-normed L2 vector', () => {
    const v = embed('hybrid retrieval with BM25 and embeddings');
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('finds semantically close text more similar than unrelated text', () => {
    const a = embed('We build scalable AI retrieval pipelines for ranking.');
    const b = embed('ranking and retrieval for large scale AI search systems');
    const c = embed('cooking recipes with tomatoes and basil');
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
});

describe('RAG text extraction', () => {
  it('reads markdown and txt as-is', () => {
    const md = extractText('notes.md', Buffer.from('# Plan\nBM25 + embeddings.'));
    expect(md.text).toContain('BM25');
    expect(md.note).toBeUndefined();

    const txt = extractText('data.txt', Buffer.from('plain text payload'));
    expect(txt.text).toContain('plain text payload');
  });
});

describe('RAG hybrid retrieval (BM25 + embeddings, RRF)', () => {
  it('retrieves indexed docs by hybrid scores', () => {
    const docs = indexDocument('hybrid.md', Buffer.from(['# Company knowledge', 'We use BM25 for exact keyword matching and embeddings for semantic similarity.', 'The CTO approves the retrieval architecture that fuses both rankings.'].join('\n')));
    const hits = hybridSearch('BM25 embedding CTO retrieval', 3);
    const mine = hits.find(h => h.docName === 'hybrid.md');
    expect(mine).toBeTruthy();
    expect(mine!.bm25Score).toBeGreaterThan(0);
    deleteDocument(docs.id);
  });
});