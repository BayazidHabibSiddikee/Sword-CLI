// Hybrid RAG knowledge library for the Business module.
//
// Retrieval combines two signals and fuses them with Reciprocal Rank Fusion:
//   1. BM25 (classic lexical/term relevance) over chunked document text.
//   2. Dense semantic embeddings (local, deterministic feature-hash vectors —
//      no external API needed). Cosine similarity over chunk vectors.
//
// The embedding layer is intentionally swappable: if a real embedding family is
// configured later, replace `embed()` with a provider call and keep the RRF
// fusion unchanged.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../../../data');
export const LIBRARY_DIR = path.join(DATA_DIR, 'library');
export const FILES_DIR = path.join(LIBRARY_DIR, 'files');
export const INDEX_DIR = path.join(LIBRARY_DIR, 'index');
export const VECTORS_DIR = path.join(LIBRARY_DIR, 'vectors');

for (const d of [LIBRARY_DIR, FILES_DIR, INDEX_DIR, VECTORS_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

// ---------------------------------------------------------------------------
// Text extraction (md/txt/html/json directly, docx via minimal ZIP, pdf via
// stream heuristics). Returns an empty string when nothing could be pulled.
// ---------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, (m) => {
    if (m.startsWith('&#')) {
      const code = m.startsWith('&#x') || m.startsWith('&#X')
        ? parseInt(m.slice(3, -1), 16)
        : parseInt(m.slice(2, -1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
    }
    return XML_ENTITIES[m.toLowerCase()] ?? ' ';
  });
}

/** Extremely small EOCD + central-directory ZIP reader (deflate only). */
function unzipEntry(buf: Buffer, entryPath: string): Buffer | null {
  let i = buf.length - 22;
  let eocd = -1;
  while (i > 0) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    i -= 1;
  }
  if (eocd === -1) return null;
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let p = cdOffset;
  for (let n = 0; n < totalEntries; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf-8');
    if (name === entryPath) {
      const lh = localOffset;
      const lhNameLen = buf.readUInt16LE(lh + 26);
      const lhExtraLen = buf.readUInt16LE(lh + 28);
      const data = buf.subarray(lh + 30 + lhNameLen + lhExtraLen, lh + 30 + lhNameLen + lhExtraLen + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) {
        try { return zlib.inflateRawSync(data); } catch { return null; }
      }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function docxToText(buf: Buffer): string {
  const xml = unzipEntry(buf, 'word/document.xml');
  if (!xml) return '';
  const raw = xml.toString('utf-8');
  const body = raw
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tab>/g, '\t')
    .replace(/<w:br[^>]*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#160;/gi, ' ');
  return decodeXmlEntities(body).replace(/\n{3,}/g, '\n\n').trim();
}

/** Best-effort PDF text extraction from uncompressed OR FlateDecode streams. */
function pdfToText(buf: Buffer): string {
  const out: string[] = [];
  const streamRe = /<<([\s\S]*?)(?:\/FlateDecode|\/Fl)\s*>>[^\n]*stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  const latin = buf.toString('latin1');
  while ((m = streamRe.exec(latin)) !== null) {
    if (!m[2]) continue;
    let data: Buffer;
    try { data = zlib.inflateSync(Buffer.from(m[2].replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, ''), 'latin1')); }
    catch { continue; }
    out.push(extractPdfTextOperands(data));
  }
  if (out.every(t => !t.trim())) out.push(extractPdfTextOperands(buf));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractPdfTextOperands(buf: Buffer): string {
  const s = buf.toString('latin1');
  const lines: string[] = [];
  const tokenRe = /\(((?:\\.|[^()\\])*)\)\s*(?:Tj|TJ)|(-?\d+(?:\.\d+)?)\s+(Td|TD|Tm|T\*)/g;
  let line: string[] = [];
  let m: RegExpExecArray | null;
  let lastWasMove = false;
  while ((m = tokenRe.exec(s)) !== null) {
    if (m[1] !== undefined) {
      const txt = m[1].replace(/\\([nrt\\()])/g, (_a, c: string) => c === 'n' ? '\n' : c === 'r' ? '' : c === 't' ? '  ' : c);
      if (lastWasMove) { lines.push(line.join('')); line = []; lastWasMove = false; }
      line.push(txt);
    } else {
      lines.push(line.join(''));
      line = [];
      lastWasMove = true;
    }
  }
  lines.push(line.join(''));
  return lines.filter(l => l && l.trim()).join('\n');
}
/** Extract plain text from a parsed document buffer based on extension. */
export function extractText(fileName: string, buf: Buffer): { text: string; note?: string } {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.md':
    case '.txt':
    case '.html':
    case '.json':
      return { text: buf.toString('utf-8').replace(/\u0000/g, '') };
    case '.docx': {
      const t = docxToText(buf);
      return { text: t, ...(t ? {} : { note: 'Could not read DOCX content.' }) };
    }
    case '.pdf': {
      const t = pdfToText(buf);
      return { text: t, ...(t ? {} : { note: 'No extractable text found in PDF.' }) };
    }
    default:
      return { text: buf.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' '), note: 'No parser; raw bytes read as text.' };
  }
}

// ---------------------------------------------------------------------------
// Tokenization + BM25
// ---------------------------------------------------------------------------

const STOPWORDS = new Set('a,an,and,are,as,at,be,by,for,from,has,he,in,is,it,its,of,on,that,the,this,to,was,were,will,with,his,her,she,they,we,you,or,but,not,no,so,if,than,too,very'.split(','));

export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/** BM25 over a fixed corpus of chunks. Returns scored chunk refs (descending). */
export function bm25(chunks: { id: string; text: string }[], query: string, k1 = 1.2, b = 0.75): { id: string; score: number }[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const n = chunks.length;
  const avgdl = chunks.reduce((a, c) => a + c.text.length, 0) / Math.max(1, n);
  const df = new Map<string, number>();
  const tfs = chunks.map((c) => {
    const freq = new Map<string, number>();
    for (const t of tokenize(c.text)) freq.set(t, (freq.get(t) ?? 0) + 1);
    for (const t of freq.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return freq;
  });
  const idf = (dfCount: number) => Math.log(1 + (n - dfCount + 0.5) / (dfCount + 0.5));
  const results: { id: string; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    const tf = tfs[i];
    const len = chunks[i].text.length;
    let score = 0;
    for (const t of terms) {
      const f = tf.get(t) ?? 0;
      if (f === 0) continue;
      const num = f * (k1 + 1);
      const den = f + k1 * (1 - b + b * (len / Math.max(1, avgdl)));
      score += idf(df.get(t) ?? 0) * (num / den);
    }
    results.push({ id: chunks[i].id, score });
  }
  return results.filter(r => r.score > 0).sort((a, b) => b.score - a.score);
}
// ---------------------------------------------------------------------------
// Local semantic embeddings (deterministic feature-hash dense vectors)
// ---------------------------------------------------------------------------

export const EMBED_DIM = 256;

function hashFeature(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic L2-normalised embedding of a single text chunk. */
export function embed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  for (const t of tokenize(text)) {
    const h1 = hashFeature(t) % EMBED_DIM;
    const h2 = hashFeature(t + '#2') % EMBED_DIM;
    const sign = (hashFeature(t + '#s') & 1) === 0 ? 1 : -1;
    vec[h1] += sign;
    vec[h2] += sign;
  }
  const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/** Semantic retrieval over chunk vectors using cosine similarity.
 * Returns the global index into the flat corpus + score (ids resolved later). */
export function semanticRerank(vectors: number[][], queryVec: number[], topK = 20): { index: number; score: number }[] {
  return vectors
    .map((v, i) => ({ index: i, score: cosine(queryVec, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
// ---------------------------------------------------------------------------
// Document storage / indexing
// ---------------------------------------------------------------------------

export interface RagChunk { id: string; text: string; }
export interface RagDocument {
  id: string;
  name: string;
  ext: string;
  size: number;
  uploadedAt: string;
  note?: string;
  text: string;
  chunks: RagChunk[];
}

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;

function chunkText(text: string): RagChunk[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out: RagChunk[] = [];
  const words = clean.split(' ');
  let start = 0;
  let idx = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    const slice = words.slice(start, end).join(' ');
    if (slice) out.push({ id: `chunk_${idx++}`, text: slice });
    if (end >= words.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return out;
}

export function generateId(): string {
  return `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\.{2,}/g, '.');
}

/** Save an uploaded file, extract text, chunk + embed it, and persist the index. */
export function indexDocument(fileName: string, buf: Buffer): RagDocument {
  const id = generateId();
  const ext = path.extname(fileName) || '.txt';
  const { text, note } = extractText(fileName, buf);

  fs.writeFileSync(path.join(FILES_DIR, `${id}${ext}`), buf);

  const doc: RagDocument = {
    id,
    name: safeName(fileName),
    ext,
    size: buf.length,
    uploadedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    text,
    chunks: chunkText(text),
  };
  fs.writeFileSync(path.join(INDEX_DIR, `${id}.json`), JSON.stringify(doc, null, 2));

  const vectors = doc.chunks.length ? doc.chunks.map((c) => embed(c.text)) : [];
  fs.writeFileSync(path.join(VECTORS_DIR, `${id}.json`), JSON.stringify(vectors));

  return doc;
}

export interface DocMeta {
  id: string; name: string; ext: string; size: number; uploadedAt: string; chunks: number; note?: string;
}

function isDocMeta(x: DocMeta | null): x is DocMeta { return x !== null; }

export function listDocuments(): DocMeta[] {
  return fs.readdirSync(INDEX_DIR)
    .filter(f => f.endsWith('.json'))
    .map((f) => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, f), 'utf-8')) as RagDocument;
        return {
          id: d.id, name: d.name, ext: d.ext, size: d.size,
          uploadedAt: d.uploadedAt, chunks: d.chunks.length,
          ...(d.note ? { note: d.note } : {}),
        };
      } catch { return null; }
    })
    .filter(isDocMeta);
}

export function getDocument(id: string): RagDocument | null {
  const p = path.join(INDEX_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as RagDocument; } catch { return null; }
}

export function deleteDocument(id: string): boolean {
  const doc = getDocument(id);
  if (!doc) return false;
  const file = path.join(FILES_DIR, `${id}${doc.ext}`);
  for (const p of [path.join(INDEX_DIR, `${id}.json`), path.join(VECTORS_DIR, `${id}.json`), file]) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
  return true;
}
// ---------------------------------------------------------------------------
// Hybrid retrieval (BM25 + embeddings via Reciprocal Rank Fusion)
// ---------------------------------------------------------------------------

export interface SearchHit {
  docId: string;
  docName: string;
  chunkId: string;
  text: string;
  bm25Score: number;
  embeddingScore: number;
  finalScore: number;
}

const RRF_K = 60;

// ── Corpus cache ─────────────────────────────────────────────────────────────
// Building the fused corpus (chunk texts + vectors for EVERY document) costs a
// full read of the library per query. The library changes rarely relative to
// how often it is searched, so we cache the built corpus keyed by a cheap
// signature of the document listing; any upload/delete/rewrite changes the
// signature and invalidates it.
interface Corpus {
  key: string;
  chunks: RagChunk[];
  vectors: number[][];
  docOf: Map<string, { id: string; name: string }>;
}

let corpusCache: Corpus | null = null;

function corpusKey(docs: DocMeta[]): string {
  return docs.map((d) => `${d.id}:${d.size}:${d.uploadedAt}`).join("|");
}

function buildCorpus(docs: DocMeta[]): Corpus {
  const chunks: RagChunk[] = [];
  const vectors: number[][] = [];
  const docOf = new Map<string, { id: string; name: string }>();
  for (const meta of docs) {
    const d = getDocument(meta.id);
    if (!d) continue;
    let v: number[][] = [];
    try {
      v = JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, `${meta.id}.json`), 'utf-8'));
    } catch { v = d.chunks.map(c => embed(c.text)); }
    for (let i = 0; i < d.chunks.length; i++) {
      const c = d.chunks[i];
      const uid = `${d.id}::${c.id}`;
      docOf.set(uid, { id: d.id, name: d.name });
      chunks.push({ id: uid, text: c.text });
      vectors.push(v[i] ?? embed(c.text));
    }
  }
  return { key: '', chunks, vectors, docOf };
}

/** Run BM25 + semantic retrieval over the whole library and fuse with RRF. */
export function hybridSearch(query: string, topK = 6): SearchHit[] {
  const docs = listDocuments();
  if (docs.length === 0) return [];

  // GLOBALLY unique chunk ids (each document reuses local ids like chunk_0,
  // so they are prefixed with the document id).
  const key = corpusKey(docs);
  if (!corpusCache || corpusCache.key !== key) {
    const built = buildCorpus(docs);
    built.key = key;
    corpusCache = built;
  }
  const { chunks, vectors, docOf } = corpusCache;
  if (chunks.length === 0) return [];

  const queryVec = embed(query);
  const bm = bm25(chunks, query);
  const sem = semanticRerank(vectors, queryVec, chunks.length);

  // Map the semantic global index back to the unique chunk id.
  const semWithId = sem.map((r) => ({ id: chunks[r.index].id, score: r.score }));

  const scoreOf = (list: { id: string; score: number }[]) => {
    const m = new Map<string, number>();
    list.forEach(r => m.set(r.id, r.score));
    return m;
  };
  const bmScoreMap = scoreOf(bm);
  const semScoreMap = scoreOf(semWithId);

  // RRF: score = Σ 1/(K + rank).
  const rrf = new Map<string, number>();
  const pushRank = (list: { id: string }[]) => list.forEach((r, rank) => {
    rrf.set(r.id, (rrf.get(r.id) ?? 0) + 1 / (RRF_K + (rank + 1)));
  });
  pushRank(bm);
  pushRank(semWithId);

  const sorted = [...rrf.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);
  return sorted.map(([cid, score]) => {
    const chunk = chunks.find(c => c.id === cid)!;
    const doc = docOf.get(cid)!;
    return {
      docId: doc.id,
      docName: doc.name,
      chunkId: cid,
      text: chunk.text,
      bm25Score: bmScoreMap.get(cid) ?? 0,
      embeddingScore: semScoreMap.get(cid) ?? 0,
      finalScore: score,
    };
  });
}

/** Build a compact RAG context string for prompt injection. */
export function buildRagContext(query: string, topK = 4): string {
  const hits = hybridSearch(query, topK);
  if (hits.length === 0) return '';
  const body = hits.map((h, i) =>
    `[${i + 1}] (${h.docName})\n${h.text.slice(0, 700)}`,
  ).join('\n\n');
  return `\nRelevant knowledge base excerpts:\n${body}\n`;
}