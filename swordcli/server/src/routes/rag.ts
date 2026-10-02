// Knowledge-library ingestion over HTTP.
//
// Deliberately narrow: only PDF and Markdown. The RAG extractor can also read
// txt/html/json/docx, but every extra accepted type is another parser we are
// trusting with untrusted bytes, so the public surface is restricted to the two
// formats the dashboard actually offers. Callers that need the others should use
// the internal service or the MCP server, which can apply its own policy.
//
// Uploads arrive as base64 JSON rather than multipart: the dashboard already
// speaks JSON everywhere and has no multipart dependency, and base64 sidesteps
// the parser ambiguity that makes multipart request handling a common source of
// upload bugs.
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  indexDocument, deleteDocument, listDocuments, getDocument,
  hybridSearch, buildRagContext,
} from '../services/rag.js';

export const ragRouter = Router();

/** Only these two. Enforced again on the stored extension, not just the request. */
const ALLOWED = ['.pdf', '.md'] as const;
// Decoded size cap. PDFs dominate memory during extraction, so this stays well
// under the JSON body limit (10mb in app.ts) once base64 overhead is accounted for.
const MAX_BYTES = 8 * 1024 * 1024;

const ingestSchema = z.object({
  name: z.string().min(1).max(200),
  // base64, with or without a data: prefix
  content: z.string().min(1),
});

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function decodeBase64(value: string): Buffer {
  const raw = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
  // Buffer.from is lenient, so reject anything that is not actually base64 rather
  // than silently indexing a truncated file.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw.replace(/\s/g, ''))) throw new Error('content must be base64');
  return Buffer.from(raw, 'base64');
}

ragRouter.post('/documents', (req: Request, res: Response) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: 'Expected { name, content } with base64 content' } });
  }
  const name = parsed.data.name.trim();
  const ext = extensionOf(name);
  if (!(ALLOWED as readonly string[]).includes(ext)) {
    return res.status(415).json({
      error: { message: `Only ${ALLOWED.join(' and ')} files can be added to the knowledge library` },
    });
  }

  let buf: Buffer;
  try {
    buf = decodeBase64(parsed.data.content);
  } catch (error) {
    return res.status(400).json({ error: { message: (error as Error).message } });
  }
  if (!buf.length) return res.status(400).json({ error: { message: 'File is empty' } });
  if (buf.length > MAX_BYTES) {
    return res.status(413).json({ error: { message: `File exceeds the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit` } });
  }

  const doc = indexDocument(name, buf);
  // An empty extraction is not an error — a scanned PDF has no text layer — but it
  // must not masquerade as indexed knowledge, so it is reported and not stored.
  if (!doc.chunks.length) {
    deleteDocument(doc.id);
    return res.status(422).json({
      error: {
        message: ext === '.pdf'
          ? 'No text could be extracted from this PDF. It is probably a scan; it needs OCR before it can be searched.'
          : 'The file produced no indexable text.',
      },
    });
  }
  return res.status(201).json({ document: { ...doc, text: undefined } });
});

ragRouter.get('/documents', (_req: Request, res: Response) => {
  res.json({ documents: listDocuments() });
});

ragRouter.get('/documents/:id', (req: Request, res: Response) => {
  const doc = getDocument(String(req.params.id));
  if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });
  res.json({ document: doc });
});

ragRouter.delete('/documents/:id', (req: Request, res: Response) => {
  if (!deleteDocument(String(req.params.id))) {
    return res.status(404).json({ error: { message: 'Document not found' } });
  }
  res.json({ deleted: true });
});

const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  top_k: z.number().int().min(1).max(20).optional(),
});

ragRouter.post('/search', (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: 'Expected { query }' } });
  const topK = parsed.data.top_k ?? 6;
  res.json({
    hits: hybridSearch(parsed.data.query, topK),
    context: buildRagContext(parsed.data.query, topK),
  });
});