import { apiFetch } from './api'

// ---- Knowledge library (PDF + Markdown) ------------------------------------
// The dashboard offers only these two formats and the server enforces the same
// allowlist, so a file picker accepting e.g. .exe would just be a lie the server
// then rejects. Keep both sides in step.

export interface KnowledgeDoc {
  id: string
  name: string
  ext: string
  size: number
  uploadedAt: string
  chunks: number
  note?: string
}

export interface KnowledgeHit {
  docId: string
  docName: string
  chunkId: string
  text: string
  bm25Score: number
  embeddingScore: number
  finalScore: number
}

export const ACCEPTED_DOC_TYPES = '.pdf,.md'

/** Decoded-size cap, mirroring the server's 8 MB limit. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export function listKnowledgeDocs(): Promise<{ documents: KnowledgeDoc[] }> {
  return apiFetch('/api/rag/documents')
}

export function deleteKnowledgeDoc(id: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/rag/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function searchKnowledge(query: string, topK = 6): Promise<{ hits: KnowledgeHit[]; context: string }> {
  return apiFetch('/api/rag/search', { method: 'POST', body: JSON.stringify({ query, top_k: topK }) })
}

export function isAcceptedDoc(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.pdf') || lower.endsWith('.md')
}

/** Upload one PDF or Markdown file as base64 JSON. */
export async function addKnowledgeDoc(file: File): Promise<{ document: KnowledgeDoc }> {
  if (!isAcceptedDoc(file.name)) {
    throw new Error(`${file.name} was skipped: only .pdf and .md can be added`)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  // Chunked: String.fromCharCode(...bytes) overflows the stack on large PDFs.
  let binary = ''
  const STEP = 0x8000
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP))
  }
  return apiFetch('/api/rag/documents', {
    method: 'POST',
    body: JSON.stringify({ name: file.name, content: btoa(binary) }),
  })
}
