import type { AgentTool } from '../types.js';
import { hybridSearch, buildRagContext, listDocuments } from '../../services/rag.js';

const argText = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? (args[key] as string) : undefined;

export const ragTools: AgentTool[] = [
  {
    name: 'rag_search',
    description:
      'Hybrid (BM25 + embedding) search over the RAG knowledge base (documents uploaded via the dashboard). Returns ranked snippets. Use to ground answers in the user\'s documents.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language query' },
        topK: { type: 'number', description: 'Number of hits. Default 6.' },
      },
      required: ['query'],
    },
    source: 'builtin',
    async execute(args) {
      const query = argText(args, 'query');
      if (!query) return { ok: false, text: 'rag_search: missing required argument "query"' };
      const topK = Math.max(1, Math.min(20, Number(args.topK ?? 6)));
      const hits = hybridSearch(query, topK);
      if (hits.length === 0) {
        const docs = listDocuments();
        return {
          ok: true,
          text: docs.length === 0
            ? 'No documents in the knowledge base yet (library is empty). Nothing to search.'
            : 'No matching snippets for that query.',
        };
      }
      return {
        ok: true,
        text: hits
          .map((h, i) => `[${i + 1}] (${h.docName}, score ${h.finalScore.toFixed(3)})\n${h.text}`)
          .join('\n\n---\n\n'),
      };
    },
  },
  {
    name: 'rag_build_context',
    description:
      'Build a prompt-ready context block from the knowledge base for a query (top snippets joined).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number', description: 'Default 4.' },
      },
      required: ['query'],
    },
    source: 'builtin',
    async execute(args) {
      const query = argText(args, 'query');
      if (!query) return { ok: false, text: 'rag_build_context: missing required argument "query"' };
      const topK = Math.max(1, Math.min(12, Number(args.topK ?? 4)));
      return { ok: true, text: buildRagContext(query, topK) };
    },
  },
];
