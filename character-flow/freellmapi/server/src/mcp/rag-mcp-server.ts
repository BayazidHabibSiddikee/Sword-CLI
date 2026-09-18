// MCP (Model Context Protocol) server exposing the Business RAG library as
// typed tools for AI agents.
//
// Transport: newline-delimited JSON-RPC 2.0 over stdio (the standard MCP stdio
// shape). Zero external dependencies — launch with `npx tsx
// server/src/mcp/rag-mcp-server.ts` from the repo root (see
// mcp-configs/freellmapi-rag.json).
//
// Granularity policy (docs/agent-harness.md):
//   - read-only tools are safe defaults for any agent loop;
//   - destructive tools (rag_delete_document) require `confirm: true` in the
//     input so a stray call cannot silently remove indexed knowledge.
import readline from 'readline';
import {
  hybridSearch, buildRagContext, listDocuments, getDocument, deleteDocument,
  type SearchHit,
} from '../services/rag.js';

// --- tool registry -----------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  destructive?: boolean;
  run: (args: any) => unknown;
}

function textResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

const TOOLS: ToolDef[] = [
  {
    name: 'rag_search',
    description:
      'Hybrid retrieval over the Business knowledge library: BM25 lexical ranking fused with dense-embedding cosine similarity via Reciprocal Rank Fusion. Returns ranked chunks with both sub-scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language search query', minLength: 1 },
        top_k: { type: 'integer', description: 'Max hits to return (1-20)', minimum: 1, maximum: 20, default: 6 },
      },
      required: ['query'],
    },
    run: (args) => {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('query must be a non-empty string');
      const topK = Math.min(20, Math.max(1, Number(args.top_k) || 6));
      const hits: SearchHit[] = hybridSearch(query, topK);
      return { count: hits.length, results: hits };
    },
  },
  {
    name: 'rag_build_context',
    description:
      'Build a compact prompt-injection context string from the top hybrid-retrieval chunks. Use this to ground an LLM prompt in the knowledge library.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        top_k: { type: 'integer', minimum: 1, maximum: 20, default: 4 },
      },
      required: ['query'],
    },
    run: (args) => {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('query must be a non-empty string');
      const context = buildRagContext(query, Math.min(20, Math.max(1, Number(args.top_k) || 4)));
      return { applied: context.length > 0, context };
    },
  },
  {
    name: 'rag_list_documents',
    description: 'List every document indexed in the knowledge library (metadata only).',
    inputSchema: { type: 'object', properties: {} },
    run: () => ({ total: listDocuments().length, documents: listDocuments() }),
  },
  {
    name: 'rag_get_document',
    description: 'Fetch one indexed document by id (metadata + extracted full text).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Document id from rag_list_documents' } },
      required: ['id'],
    },
    run: (args) => {
      const doc = getDocument(String(args.id));
      if (!doc) throw new Error(`Document not found: ${args.id} — call rag_list_documents for valid ids`);
      return doc;
    },
  },
  {
    name: 'rag_delete_document',
    description: 'Delete an indexed document and its index/vectors/original file. Destructive.',
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        confirm: { type: 'boolean', description: 'Must be true — safety gate for this destructive tool' },
      },
      required: ['id', 'confirm'],
    },
    run: (args) => {
      if (args.confirm !== true) {
        throw new Error('This tool is destructive: re-invoke with confirm=true to proceed');
      }
      const ok = deleteDocument(String(args.id));
      if (!ok) throw new Error(`Document not found: ${args.id}`);
      return { deleted: true, id: args.id };
    },
  },
];
// --- JSON-RPC / MCP plumbing --------------------------------------------------

type Incoming = { jsonrpc?: string; id?: number | string | null; method?: string; params?: any };

function handle(msg: Incoming): unknown | null {
  const { id, method, params } = msg;
  if (!method) return null;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'freellmapi-rag', version: '0.1.0' },
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0', id,
        result: {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description + (t.destructive ? ' [DESTRUCTIVE]' : ''),
            inputSchema: t.inputSchema,
            ...(t.destructive ? { annotations: { destructiveHint: true } } : {}),
          })),
        },
      };
    case 'tools/call': {
      try {
        const tool = TOOLS.find((t) => t.name === params?.name);
        if (!tool) throw new Error(`Unknown tool: ${params?.name}`);
        const out = tool.run(params?.arguments ?? {});
        return { jsonrpc: '2.0', id, result: { ...textResult({ success: true, data: out }), isError: false } };
      } catch (e: any) {
        // Error-recovery contract: message carries the root-cause hint.
        return {
          jsonrpc: '2.0', id,
          result: {
            ...textResult({ success: false, error: String(e?.message || e), retryable: false }),
            isError: true,
          },
        };
      }
    }
    default:
      if (id !== undefined && id !== null) {
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
      return null;
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: Incoming;
  try { msg = JSON.parse(trimmed); } catch { return; } // ignore non-JSON noise
  const reply = handle(msg);
  if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
});

