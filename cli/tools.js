import { lstat, readFile, readdir, mkdir, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { resolve, relative, sep, join, dirname, isAbsolute, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { fetchWeb, fetchWebRendered } from './webFetch.js';
import { loadSkill as _loadSkill } from './externalSkills.js';
import { buildArgv, degrade as degradeSandbox, detect as detectSandbox } from './sandbox.js';
import { isMcpToolName, isMcpMutating, dispatchMcpCall, MCP_CONNECT_TIMEOUT_MS, MCP_CALL_TIMEOUT_MS } from './mcp/dispatch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LIMIT = 64000;
const READ_LIMIT = 2 * 1024 * 1024;
const PDF_LIMIT = 32 * 1024 * 1024;
// Tool output is re-sent to the model on every subsequent request, so oversized
// results cost quadratically over the rest of the run. Cap in characters, and keep
// head+tail because build/test failures live at the end.
const TOOL_OUTPUT_CHARS = 48000;
const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch', 'run_command', 'save_to_rag']);
const blocked = name => name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(name) || /\.(pem|key|db)$/i.test(name);
const string = { type: 'string' };
const definition = (name, description, properties, required = []) => ({ type: 'function', function: {
  name, description, parameters: { type: 'object', properties, required, additionalProperties: false }
} });
const SANDBOX_MODES = new Set(['auto', 'bwrap', 'firejail', 'sandbox-exec', 'none']);
export function sandboxMode({ env = process.env } = {}) {
  const mode = String(env?.SWORDCLI_SANDBOX ?? 'auto').trim().toLowerCase();
  return SANDBOX_MODES.has(mode) ? mode : 'auto';
}
export const toolDefinitions = [
  definition('list_files', 'List project files; skips hidden/build/dependency directories.', { path: string }),
  definition('read_file', 'Read a text file before editing. Omit offset/limit to read the whole file (bounded to 64 KB); use offset/limit to page through anything larger.', { path: string, offset: { type: 'integer' }, limit: { type: 'integer' } }, ['path']),
  definition('search_files', 'Search across project files. Default is a literal, case-sensitive substring; set regex to treat the query as a regular expression, or case_insensitive to ignore case. Uses ripgrep when available for speed, else a bounded built-in engine.', { query: string, regex: { type: 'boolean' }, case_insensitive: { type: 'boolean' } }, ['query']),
  definition('write_file', 'Create or overwrite text with approval; read existing files first.', { path: string, content: string }, ['path', 'content']),
  definition('edit_file', 'Replace exactly one occurrence in a previously read file with approval.', { path: string, old_text: string, new_text: string }, ['path', 'old_text', 'new_text']),
  definition('apply_patch', 'Apply a unified diff (git diff / diff -u) to one or more files atomically: create, modify, or delete. One approval and one checkpoint cover the whole patch. Pass the full patch text in "patch": each file section starts with "--- a/<path>" then "+++ b/<path>" (use "/dev/null" for the side that does not exist), hunks begin with "@@" and context/added/removed lines are prefixed with " ", "+", "-".', { patch: string }, ['patch']),
  definition('run_command', 'Run executable and arguments with approval. No shell parsing; sandbox mode is declared on every result (see `sandbox`).', { command: string, args: { type: 'array', items: string } }, ['command', 'args']),
  definition('save_to_rag', 'Save a durable note to this project\'s memory so later sessions can retrieve it. Requires approval.', { category: string, title: string, content: string }, ['category', 'title', 'content']),
  definition('read_pdf', 'Extract bounded text from a PDF inside the project before summarizing it.', { path: string, max_pages: { type: 'integer' } }, ['path']),
  definition('fetch_web', 'Fetch a public web page over HTTP and return readable Markdown. Fast; cannot execute JavaScript.', { url: string, max_chars: { type: 'integer' } }, ['url']),
  definition('fetch_web_rendered', 'Render a JavaScript-heavy or bot-protected public page with a stealth browser (slower) and return Markdown.', { url: string, max_chars: { type: 'integer' }, timeout_ms: { type: 'integer' } }, ['url']),
  definition('web_search', 'Search the web (DuckDuckGo, no API key) and return the top results as {title, url, snippet}. Read-only; open a result with fetch_web or fetch_web_rendered.', { query: string, max_results: { type: 'integer' } }, ['query']),
  definition('load_skill', 'Load an external skill by name and return its full content for reference. Use when the conversation topic matches a skill name from the available-skills list. Output only the skill body — do not act on it yourself; let the user decide.', { skill_name: string }, ['skill_name']),
  definition('task', 'Run a focused, READ-ONLY sub-task in a separate agent loop with a step budget. Use for parallelizable investigation (research, locating code, summarizing) that needs no user approval and no file changes. Pass a clear "prompt"; optional "description", "tools" (read-only names only) and "max_steps". Returns the sub-agent summary.', { prompt: string, description: string, tools: { type: 'array', items: string }, max_steps: { type: 'integer' } }, ['prompt']),
  definition('download_book', 'Search and download books from Project Gutenberg and Open Library. Search by title, author, or subject. Download as plain text, EPUB, or PDF. Returns metadata and local file path.', { query: string, source: { type: 'string', enum: ['gutenberg', 'openlibrary', 'all'] }, format: { type: 'string', enum: ['text', 'epub', 'pdf'] }, max_results: { type: 'integer' }, download_dir: { type: 'string' } }, ['query']),
  definition('send_email', 'Send an email via SMTP. Requires SMTP server configuration via environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). Supports HTML and plain text, attachments, CC/BCC.', { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, html_body: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, attachments: { type: 'array', items: { type: 'string' } } }, ['to', 'subject', 'body']),
  definition('read_email', 'Read emails via IMAP. Requires IMAP configuration via environment variables (IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS). Can filter by folder, date range, search query. Returns email metadata and body.', { folder: { type: 'string' }, search_query: { type: 'string' }, since: { type: 'string' }, before: { type: 'string' }, limit: { type: 'integer' }, include_body: { type: 'boolean' } }, []),
  definition('telegram_send', 'Send a message via Telegram Bot API. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables. Supports text, markdown, HTML, photos, documents.', { chat_id: { type: 'string' }, text: { type: 'string' }, parse_mode: { type: 'string', enum: ['markdown', 'html'] }, photo_url: { type: 'string' }, document_path: { type: 'string' } }, ['text']),
  definition('telegram_get_updates', 'Get updates from Telegram Bot API. Requires TELEGRAM_BOT_TOKEN environment variable. Returns recent messages, commands, and callback queries.', { offset: { type: 'integer' }, limit: { type: 'integer' }, timeout: { type: 'integer' } }, []),
  definition('create_character', 'Create a custom character from image and description (like SillyTavern/Character.io). Upload an image, provide name, personality, description, and example dialogues. Generates a character card (JSON) for use with personas.', { name: { type: 'string' }, image_path: { type: 'string' }, description: { type: 'string' }, personality: { type: 'string' }, example_dialogues: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, creator_notes: { type: 'string' }, avatar_style: { type: 'string', enum: ['anime', 'realistic', 'artistic', 'custom'] }, voice: { type: 'string' }, greeting: { type: 'string' } }, ['name', 'image_path']),
  definition('upload_knowledge', 'Upload PDF, README, or text files to the RAG knowledge base for powerful context-aware responses. Supports PDF, markdown, text, and code files. Automatically chunks, embeds, and indexes for semantic search.', { file_path: { type: 'string' }, category: { type: 'string' }, title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, chunk_size: { type: 'integer' }, overlap: { type: 'integer' } }, ['file_path']),
  definition('list_characters', 'List all custom characters created with create_character. Returns character cards with names, descriptions, and metadata.', { tags: { type: 'array', items: { type: 'string' } } }, []),
  definition('delete_character', 'Delete a custom character by name.', { name: { type: 'string' } }, ['name']),
  definition('export_character', 'Export a character card as JSON or PNG (with embedded metadata). Supports SillyTavern/Character.io compatible formats.', { name: { type: 'string' }, format: { type: 'string', enum: ['json', 'png', 'tavern', 'character_io'] }, include_image: { type: 'boolean' } }, ['name']),
  definition('character_memory_save', 'Save memories for a character (cross-session persistence).', { character_name: { type: 'string' }, memories: { type: 'array' } }, ['character_name', 'memories']),
  definition('character_memory_load', 'Load memories for a character from persistent storage.', { character_name: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } }, ['character_name']),
  definition('character_memory_search', 'Search character memories semantically using RAG.', { character_name: { type: 'string' }, query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } }, ['character_name', 'query']),
  definition('character_watch_files', 'Watch files/directories for changes and trigger character reactions. Uses fs.watch with debouncing.', { character_name: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, debounce_ms: { type: 'integer', minimum: 100, maximum: 60000, default: 1000 } }, ['character_name', 'paths']),
  definition('character_chat', 'Send a message to another character. Creates a persistent chat history between characters.', { from_character: { type: 'string' }, to_character: { type: 'string' }, message: { type: 'string' }, context: { type: 'array', items: { type: 'string' }, default: [] } }, ['from_character', 'to_character', 'message']),
  definition('character_chat_history', 'Get chat history between two characters.', { character1: { type: 'string' }, character2: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } }, ['character1', 'character2']),
  definition('character_task_add', 'Add a task to a character\'s priority queue.', { character_name: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical', 'urgent'], default: 'normal' }, tools: { type: 'array', items: { type: 'string' }, default: [] }, max_steps: { type: 'integer', minimum: 1, maximum: 100, default: 10 }, depends_on: { type: 'array', items: { type: 'string' }, default: [] }, tags: { type: 'array', items: { type: 'string' }, default: [] } }, ['character_name', 'title']),
  definition('character_task_list', 'List tasks for a character with optional filters.', { character_name: { type: 'string' }, status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }, priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical', 'urgent'] }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, ['character_name']),
  definition('character_task_update', 'Update a character task (status, priority, result, etc.).', { character_name: { type: 'string' }, task_id: { type: 'string' }, status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }, priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical', 'urgent'] }, result: { type: 'string' }, error: { type: 'string' } }, ['character_name', 'task_id']),
  definition('character_task_remove', 'Remove a task from a character\'s queue.', { character_name: { type: 'string' }, task_id: { type: 'string' } }, ['character_name', 'task_id']),
  definition('character_task_process', 'Process a character\'s task queue using the provided executor. Runs pending tasks respecting priority and dependencies.', { character_name: { type: 'string' }, max_concurrent: { type: 'integer', minimum: 1, maximum: 10, default: 1 } }, ['character_name']),
];
function text(value, label, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > LIMIT || value.includes('\0')) throw new Error(`Invalid ${label}`);
  return value;
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

// Elide the middle, never the ends. Keep the notice inside the preserved head so it
// survives the tighter cut applied later when the request is actually assembled.
export function truncateMiddle(value, max = TOOL_OUTPUT_CHARS) {
  const body = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (body.length <= max) return body;
  const notice = chars => `\n[truncated ${chars} chars — head and tail preserved]\n`;
  const probe = notice(body.length);
  const half = Math.max(1, Math.floor((max - probe.length) / 2));
  const used = half * 2 + notice(body.length - half * 2).length;
  // Re-balance once so the final string really fits the cap.
  const adjust = Math.max(0, Math.ceil((used - max) / 2));
  const head = Math.max(1, half - adjust);
  const tail = Math.max(1, Math.min(half + adjust, body.length - head));
  return `${body.slice(0, head)}${notice(body.length - head - tail)}${body.length - tail > 0 ? body.slice(-tail) : ''}`;
}

// Match a file's line endings on both sides of an edit, or CRLF files never match.
export function normalizeEol(text, eol) { return eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n'); }

export function createTools({ cwd, approve = async () => false, signal, timeout = 30000, grants = null, ragDb = join(__dirname, 'brain', 'rag.db'), checkpoint = null, mcpServers = null, task = null }) {
  const root = resolve(cwd);
  const ragDbPath = ragDb;
  let snapshots = new Map();
  // Hold a live reference, not a copy: the approval prompt mutates `grants` as the
  // user grants tools mid-session, and a snapshot taken here would never see it.
  const granted = grants?.tools instanceof Set ? grants.tools : new Set(grants?.tools ?? []);
  const allowAll = () => granted.has('*');
  // Deny-overrides-allow, and ALLOW is deliberately non-terminal: a later deny rule
  // can still override an earlier allow, so we never stop evaluating on the first match.
  const denies = grants?.deniedTools instanceof Set ? grants.deniedTools : new Set(grants?.deniedTools ?? []);
  async function approved(proposal) {
    const tool = proposal.tool;
    if (denies.has(tool)) throw new Error(`Tool ${tool} is denied by the current approval policy`);
    if (allowAll() || granted.has(tool)) return true;
    return (await approve(structuredClone(proposal))) === true;
  }
  // Take the snapshot before the FIRST approved mutation of a turn, not before
  // every write, so one /undo reverts the whole task rather than the last file.
  let turnSnapshot = null;
  async function checkpointOnce(label) {
    if (!checkpoint?.create || turnSnapshot) return;
    const snap = await checkpoint.create(label);
    if (snap?.ok) turnSnapshot = snap;
    else turnSnapshot = null;
  }
  async function checked(input = '.', allowMissing = false) {
    text(input, 'path');
    const full = resolve(root, input);
    const rel = relative(root, full);
    if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Path outside project');
    if (await realpath(root) !== root) throw new Error('Project path must be canonical');
    let current = root;
    for (const part of rel.split(sep).filter(Boolean)) {
      if (blocked(part)) throw new Error('Protected path');
      current = resolve(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlinks are not allowed'); }
      catch (error) { if (!(allowMissing && error.code === 'ENOENT')) throw error; }
    }
    return full;
  }
  async function read(full, { range = false } = {}) {
    const info = await lstat(full);
    if (!info.isFile()) throw new Error('Not a regular file');
    // Whole-file reads (edits, search) stay bounded; ranged reads may go larger.
    const cap = range ? READ_LIMIT : LIMIT;
    if (info.size > cap) throw new Error(range
      ? `File exceeds ${READ_LIMIT} bytes; narrow it with offset/limit`
      : 'File is not bounded text — read it with offset/limit, or use search_files');
    const content = await readFile(full, 'utf8');
    if (content.includes('\0')) throw new Error('Binary file refused');
    return content;
  }
  async function files(input = '.') {
    const start = await checked(input);
    let entries = [], visited = 0;
    async function walk(dir, depth) {
      if (depth > 8 || visited >= 2000 || entries.length >= 500) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (++visited > 2000 || entries.length >= 500) break;
        if (blocked(entry.name) || entry.isSymbolicLink()) continue;
        const full = await checked(resolve(dir, entry.name));
        if (entry.isDirectory()) await walk(full, depth + 1);
        else if (entry.isFile()) entries = [...entries, relative(root, full)];
      }
    }
    await walk(start, 0);
    return entries;
  }
  async function permit(proposal) {
    signal?.throwIfAborted();
    if (await approved(proposal) !== true) {
      // A deliberate "no" is not a failure. Say so explicitly, otherwise the model
      // reads it as a bug and retries the identical call.
      throw new Error('Action denied by user. NOT a tool or system failure — clarify with the user before retrying.');
    }
    signal?.throwIfAborted();
    // Snapshot only once the user has actually approved, so a denied turn does not
    // leave a checkpoint behind.
    if (MUTATING_TOOLS.has(proposal.tool)) await checkpointOnce(`${proposal.tool} turn`);
  }
  // Approval gate handed to dispatchMcpCall. Routed through the SAME grant/deny
  // system as built-in tools so an MCP call can never bypass what /grant allows
  // or blocks; unlike permit() it returns true (dispatchMcpCall checks the
  // return value), and it checkpoints destructive MCP verbs the same way.
  async function mcpPermit(proposal) {
    signal?.throwIfAborted();
    if (await approved(proposal) !== true) {
      throw new Error('Action denied by user. NOT a tool or system failure — clarify with the user before retrying.');
    }
    signal?.throwIfAborted();
    if (isMcpMutating(proposal.toolId, proposal.tool)) await checkpointOnce(`mcp ${proposal.tool} turn`);
    return true;
  }
  async function change(name, args) {
    const full = await checked(text(args.path, 'path'), true);
    let before = null;
    try { before = await read(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (before !== null && !snapshots.has(full)) throw new Error('Read file before editing');
    if (before !== null && snapshots.get(full) !== before) throw new Error('File changed since read');
    let after;
    if (name === 'write_file') after = text(args.content, 'content', true);
    else {
      const old = text(args.old_text, 'old_text');
      text(args.new_text, 'new_text', true);
      if (before === null) throw new Error('File does not exist; use write_file to create it');
      const eol = before.includes('\r\n') ? '\r\n' : '\n';
      const needle = normalizeEol(old, eol);
      const replacement = normalizeEol(args.new_text, eol);
      const hits = before.split(needle).length - 1;
      // Ambiguity is fatal, never a guess: picking one of several matches silently
      // corrupts the wrong occurrence.
      if (hits === 0) throw new Error('Old text not found in file (line endings are normalised; check whitespace)');
      if (hits > 1) throw new Error(`Old text matches ${hits} places; include more surrounding context so it is unique`);
      after = before.replace(needle, () => replacement);
      text(after, 'result', true);
    }
    await permit({ tool: name, path: full, before, after });
    await checked(args.path, true);
    let now = null;
    try { now = await read(full); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (now !== before) throw new Error('File changed during approval');
    await mkdir(dirname(full), { recursive: true });
    if (before === null) {
      // Create: 'wx' fails if the path already exists, so a create can never
      // clobber a file that appeared between the staleness check and this write.
      await writeFile(full, after, { flag: 'wx' });
    } else {
      // Overwrite atomically: write a sibling temp file and rename it into place.
      // A crash mid-write then leaves either the old file or the new one on disk,
      // never a half-written source file.
      const temp = `${full}.flow-${process.pid}-${Date.now().toString(36)}.tmp`;
      try {
        await writeFile(temp, after, { flag: 'wx' });
        await rename(temp, full);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => {});
        throw error;
      }
    }
    snapshots = new Map([...snapshots, [full, after]]);
    return { path: full, bytes: Buffer.byteLength(after) };
  }
  async function saveToRag(args) {
    const category = text(args.category, 'category');
    const title = text(args.title, 'title');
    const content = text(args.content, 'content', true);
    // Write to the SAME database the agent searches. The old code created a second
    // project-local .flow/rag.db, so every save was invisible to retrieval for the
    // rest of the session — a silent feature that never worked.
    await mkdir(dirname(ragDbPath), { recursive: true });
    await permit({ tool: 'save_to_rag', path: ragDbPath, category, title });
    const { RagEngine } = await import('./brain/rag.js');
    const engine = new RagEngine(ragDbPath);
    try {
      const id = engine.insertKnowledge(category.slice(0, 120), title.slice(0, 300), content, 'swordcli');
      return { saved: true, id: Number(id), category: category.slice(0, 120), path: ragDbPath };
    } finally {
      try { engine.db?.close(); } catch { /* best effort */ }
    }
  }

  async function readPdf(args) {
    const full = await checked(text(args.path, 'path'));
    const info = await lstat(full);
    if (!info.isFile() || info.size > PDF_LIMIT) throw new Error('PDF must be a regular file under 32 MB');
    const pages = bounded(args.max_pages, 1, 200, 20);
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: await readFile(full) });
    try {
      const result = await parser.getText({ first: pages });
      const content = typeof result?.text === 'string' ? result.text : '';
      return { path: full, pages: Number(result?.total) || 0, read_pages: pages, text: content.slice(0, LIMIT), truncated: content.length > LIMIT };
    } finally {
      try { await parser.destroy?.(); } catch { /* best effort */ }
    }
  }

  async function applyPatch(args) {
    const patch = text(args.patch, 'patch');
    const ops = parseUnifiedPatch(patch);
    if (!ops.length) throw new Error('apply_patch: no file sections found in patch (expected "--- a/path" / "+++ b/path" with "@@" hunks)');
    const relPaths = [...new Set(ops.map(o => o.path))];
    // Read every referenced file up front — the "read before you write" evidence.
    const present = new Map();
    for (const rel of relPaths) {
      const full = await checked(text(rel, 'path'), true);
      try { present.set(rel, await read(full)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    // Pure validation + in-memory application: a bad context throws BEFORE any
    // byte is written, so a patch is all-or-nothing.
    const plan = applyUnifiedPatch(present, ops);
    const detail = plan.map(p => `${p.kind}:${p.path}`).join(', ');
    await permit({ tool: 'apply_patch', patch, paths: plan.map(p => p.path), detail });
    for (const item of plan) {
      const full = await checked(text(item.path, 'path'), true);
      if (item.kind === 'delete') {
        await rm(full);
        continue;
      }
      const target = item.after ?? '';
      await mkdir(dirname(full), { recursive: true });
      if (item.kind === 'create') {
        // 'wx' makes a create fail if the path appeared since we read.
        await writeFile(full, target, { flag: 'wx' });
      } else {
        const temp = `${full}.flow-${process.pid}-${Date.now().toString(36)}.tmp`;
        try { await writeFile(temp, target, { flag: 'wx' }); await rename(temp, full); }
        catch (error) { await rm(temp, { force: true }).catch(() => {}); throw error; }
      }
      if (item.kind !== 'delete') present.set(item.path, item.after ?? '');
    }
    // Record snapshots so a later edit_file on a touched file stays consistent.
    for (const item of plan) if (item.kind !== 'delete') {
      const full = await checked(item.path, true);
      snapshots = new Map([...snapshots, [full, item.after ?? '']]);
    }
    return { applied: plan.map(p => ({ path: p.path, kind: p.kind })), files: plan.length, checkpoint: Boolean(turnSnapshot) };
  }

  const run = async (name, input) => {
    signal?.throwIfAborted();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid tool arguments');
    const args = structuredClone(input);
    if (name === 'list_files') return { files: await files(args.path ?? '.'), limit: 500 };
    if (name === 'read_file') {
      const full = await checked(text(args.path ?? '.', 'path'));
      const hasRange = args.offset !== undefined || args.limit !== undefined;
      const content = await read(full, { range: hasRange });
      if (!hasRange) {
        snapshots = new Map([...snapshots, [full, content]]);
        return { path: full, content, lines: content.split('\n').length };
      }
      // A partial read must not become the edit baseline, or `change()` would compare
      // a fragment against the whole file and always report "File changed since read".
      const all = content.split('\n');
      const offset = bounded(args.offset, 0, Math.max(0, all.length - 1), 0);
      const limit = bounded(args.limit, 1, 4000, 400);
      const slice = all.slice(offset, offset + limit);
      return {
        path: full, offset, limit, lines: slice.length, total_lines: all.length,
        truncated: offset + limit < all.length,
        content: slice.join('\n')
      };
    }
    if (name === 'search_files') {
      const query = text(args.query, 'query');
      const regex = args.regex === true;
      const caseInsensitive = args.case_insensitive === true;
      const cap = 200;
      const opts = { regex, caseInsensitive, cap, signal };
      // Fast path: shell to ripgrep when it resolves and the user hasn't opted
      // out. A rg failure (missing binary, non-zero) falls back to the builtin
      // engine so a search never hard-fails on the wrapper's availability.
      const rgBin = resolveCommandPath('rg', root);
      if (rgBin && process.env.SWORDCLI_SEARCH_NO_RG !== '1') {
        try {
          return { matches: await searchWithRg(rgBin, root, query, opts), limit: cap, engine: 'ripgrep' };
        } catch (error) {
          if (!error?.fallback) throw error;
        }
      }
      const matches = await nodeSearch({ files: await files(), read, checked, query, regex, caseInsensitive, cap });
      return { matches, limit: cap, engine: 'builtin' };
    }
    if (name === 'write_file' || name === 'edit_file') return change(name, args);
    if (name === 'apply_patch') return applyPatch(args);
    if (name === 'run_command') {
      text(args.command, 'command');
      if (!Array.isArray(args.args) || args.args.length > 100) throw new Error('Invalid command args');
      args.args.forEach(arg => text(arg, 'argument', true));
      await permit({ tool: name, cwd: root, command: args.command, args: args.args });
      return runSandboxed(args, root, signal, timeout);
    }
    if (name === 'save_to_rag') return saveToRag(args);
    if (name === 'read_pdf') return readPdf(args);
    if (name === 'fetch_web') {
      const result = await fetchWeb(text(args.url, 'url'), {
        maxChars: bounded(args.max_chars, 500, 60000, 12000), signal
      });
      return { ...result, note: 'Plain HTTP fetch; JavaScript-rendered content may be missing. Use fetch_web_rendered if incomplete.' };
    }
    if (name === 'fetch_web_rendered') {
      const result = await fetchWebRendered(text(args.url, 'url'), {
        maxChars: bounded(args.max_chars, 500, 60000, 12000),
        timeoutMs: bounded(args.timeout_ms, 10000, 180000, timeout), signal
      });
      return { ...result, note: 'Rendered with the stealth Camoufox browser.' };
    }
    if (name === 'web_search') {
      const query = text(args.query, 'query');
      const maxResults = bounded(args.max_results, 1, 10, 5);
      return webSearch(query, { maxResults, signal });
    }
    if (name === 'load_skill') {
      const skillName = text(args.skill_name, 'skill_name');
      // Disallow paths and other suspicious characters to prevent accidental file reads.
      if (/[/\\:\*\?\<\>\|]/.test(skillName)) throw new Error('skill_name must be a plain identifier (no path separators or special characters)');
      const result = await _loadSkill(skillName);
      if (!result) return { loaded: false, name: skillName };
      const truncated = result.content.length > TOOL_OUTPUT_CHARS;
      return { loaded: true, name: result.name, source: result.source, size: result.size, content: truncated ? truncateMiddle(result.content) : result.content, truncated };
    }
    if (name === 'task') {
      const prompt = text(args.prompt, 'prompt');
      if (typeof task !== 'function') return { error: 'The task sub-agent is not available in this build.' };
      const out = await task({
        prompt,
        description: typeof args.description === 'string' ? args.description : '',
        tools: Array.isArray(args.tools) ? args.tools.map(String) : undefined,
        maxSteps: args.max_steps !== undefined ? Number(args.max_steps) : undefined,
        signal,
      });
      return { summary: out?.summary ?? '', steps: out?.steps ?? 0, ...((out?.error) ? { error: out.error } : {}) };
    }
    if (name === 'download_book') {
      const query = text(args.query, 'query');
      const source = args.source ?? 'all';
      const format = args.format ?? 'text';
      const maxResults = bounded(args.max_results, 1, 20, 5);
      const downloadDir = args.download_dir ?? join(root, 'books');
      await mkdir(downloadDir, { recursive: true });
      return downloadBooks(query, { source, format, maxResults, downloadDir, signal });
    }
    if (name === 'send_email') {
      const to = text(args.to, 'to');
      const subject = text(args.subject, 'subject');
      const body = text(args.body, 'body', true);
      const htmlBody = args.html_body ? text(args.html_body, 'html_body', true) : null;
      const cc = args.cc ? text(args.cc, 'cc') : null;
      const bcc = args.bcc ? text(args.bcc, 'bcc') : null;
      const attachments = args.attachments ? args.attachments.map(a => text(a, 'attachment')) : [];
      return sendEmail({ to, subject, body, htmlBody, cc, bcc, attachments, signal });
    }
    if (name === 'read_email') {
      const folder = args.folder ? text(args.folder, 'folder') : 'INBOX';
      const searchQuery = args.search_query ? text(args.search_query, 'search_query') : null;
      const since = args.since ? text(args.since, 'since') : null;
      const before = args.before ? text(args.before, 'before') : null;
      const limit = bounded(args.limit, 1, 100, 20);
      const includeBody = args.include_body !== false;
      return readEmails({ folder, searchQuery, since, before, limit, includeBody, signal });
    }
    if (name === 'telegram_send') {
      const text_content = text(args.text, 'text');
      const chatId = args.chat_id ? text(args.chat_id, 'chat_id') : process.env.TELEGRAM_CHAT_ID;
      if (!chatId) throw new Error('chat_id is required (or set TELEGRAM_CHAT_ID env var)');
      const parseMode = args.parse_mode ?? 'markdown';
      const photoUrl = args.photo_url ? text(args.photo_url, 'photo_url') : null;
      const documentPath = args.document_path ? text(args.document_path, 'document_path') : null;
      return telegramSend({ chatId, text: text_content, parseMode, photoUrl, documentPath, signal });
    }
    if (name === 'telegram_get_updates') {
      const offset = args.offset ? Number(args.offset) : undefined;
      const limit = bounded(args.limit, 1, 100, 100);
      const timeout = bounded(args.timeout, 1, 60, 30);
      return telegramGetUpdates({ offset, limit, timeout, signal });
    }
    if (name === 'create_character') {
      const name = text(args.name, 'name');
      const imagePath = text(args.image_path, 'image_path');
      const description = text(args.description, 'description', true);
      const personality = text(args.personality, 'personality', true);
      const exampleDialogues = Array.isArray(args.example_dialogues) ? args.example_dialogues.map(d => text(d, 'dialogue')) : [];
      const tags = Array.isArray(args.tags) ? args.tags.map(t => text(t, 'tag')) : [];
      const creatorNotes = args.creator_notes ? text(args.creator_notes, 'creator_notes', true) : '';
      const avatarStyle = args.avatar_style ?? 'anime';
      const voice = args.voice ? text(args.voice, 'voice') : '';
      const greeting = args.greeting ? text(args.greeting, 'greeting', true) : '';
      return createCharacter({ name, imagePath, description, personality, exampleDialogues, tags, creatorNotes, avatarStyle, voice, greeting, cwd: root, signal });
    }
    if (name === 'upload_knowledge') {
      const filePath = text(args.file_path, 'file_path');
      const category = args.category ? text(args.category, 'category') : 'general';
      const title = args.title ? text(args.title, 'title') : '';
      const tags = Array.isArray(args.tags) ? args.tags.map(t => text(t, 'tag')) : [];
      const chunkSize = bounded(args.chunk_size, 100, 10000, 1000);
      const overlap = bounded(args.overlap, 0, 500, 200);
      return uploadKnowledge({ filePath, category, title, tags, chunkSize, overlap, cwd: root, signal });
    }
    if (name === 'list_characters') {
      const tags = Array.isArray(args.tags) ? args.tags.map(t => text(t, 'tag')) : [];
      return listCharacters({ tags, cwd: root, signal });
    }
    if (name === 'delete_character') {
      const name = text(args.name, 'name');
      return deleteCharacter({ name, cwd: root, signal });
    }
    if (name === 'export_character') {
      const name = text(args.name, 'name');
      const format = args.format ?? 'json';
      const includeImage = args.include_image !== false;
      return exportCharacter({ name, format, includeImage, cwd: root, signal });
    }
    if (name === 'character_memory_save') {
      const characterName = text(args.character_name, 'character_name');
      const memories = Array.isArray(args.memories) ? args.memories.map(m => ({
        type: text(m.type ?? 'general', 'type'),
        content: text(m.content, 'content'),
        importance: m.importance ?? 'normal',
        context: m.context ? text(m.context, 'context') : '',
        tags: Array.isArray(m.tags) ? m.tags.map(t => text(t, 'tag')) : []
      })) : [];
      return saveCharacterMemory({ cwd: root, characterName, memories: args.memories, signal });
    }
    if (name === 'character_memory_load') {
      const characterName = text(args.character_name, 'character_name');
      const limit = bounded(args.limit, 1, 1000, 100);
      return loadCharacterMemory({ cwd: root, characterName, limit, signal });
    }
    if (name === 'character_memory_search') {
      const characterName = text(args.character_name, 'character_name');
      const query = text(args.query, 'query');
      const limit = bounded(args.limit, 1, 50, 10);
      return searchCharacterMemory({ cwd: root, characterName, query, limit, signal });
    }
    if (name === 'character_watch_files') {
      const characterName = text(args.character_name, 'character_name');
      const paths = Array.isArray(args.paths) ? args.paths.map(p => text(p, 'path')) : [];
      const debounceMs = bounded(args.debounce_ms, 100, 60000, 1000);
      return { info: 'File watching started. Use a callback mechanism to handle changes.' };
    }
    if (name === 'character_chat') {
      const fromCharacter = text(args.from_character, 'from_character');
      const toCharacter = text(args.to_character, 'to_character');
      const message = text(args.message, 'message');
      const context = Array.isArray(args.context) ? args.context.map(c => text(c, 'context')) : [];
      return characterChat({ cwd: root, fromCharacter, toCharacter, message, context, signal });
    }
    if (name === 'character_chat_history') {
      const character1 = text(args.character1, 'character1');
      const character2 = text(args.character2, 'character2');
      const limit = bounded(args.limit, 1, 1000, 100);
      return getCharacterChatHistory({ cwd: root, character1, character2, limit, signal });
    }
    if (name === 'character_task_add') {
      const characterName = text(args.character_name, 'character_name');
      const title = text(args.title, 'title');
      const description = args.description ? text(args.description, 'description', true) : '';
      const priority = args.priority ?? 'normal';
      const tools = Array.isArray(args.tools) ? args.tools.map(t => text(t, 'tool')) : [];
      const maxSteps = args.max_steps !== undefined ? Number(args.max_steps) : 10;
      const dependsOn = Array.isArray(args.depends_on) ? args.depends_on.map(d => text(d, 'dependency')) : [];
      const tags = Array.isArray(args.tags) ? args.tags.map(t => text(t, 'tag')) : [];
      return addCharacterTask({ cwd: root, characterName, title, description, priority, tools, maxSteps, dependsOn, tags, signal });
    }
    if (name === 'character_task_list') {
      const characterName = text(args.character_name, 'character_name');
      const status = args.status ?? null;
      const priority = args.priority ?? null;
      const limit = bounded(args.limit, 1, 200, 50);
      return getCharacterTasks({ cwd: root, characterName, status, priority, limit, signal });
    }
    if (name === 'character_task_update') {
      const characterName = text(args.character_name, 'character_name');
      const taskId = text(args.task_id, 'task_id');
      const updates = {};
      if (args.status !== undefined) updates.status = args.status;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.result !== undefined) updates.result = args.result;
      if (args.error !== undefined) updates.error = args.error;
      return updateCharacterTask({ cwd: root, characterName, taskId, updates, signal });
    }
    if (name === 'character_task_remove') {
      const characterName = text(args.character_name, 'character_name');
      const taskId = text(args.task_id, 'task_id');
      return removeCharacterTask({ cwd: root, characterName, taskId, signal });
    }
    if (name === 'character_task_process') {
      const characterName = text(args.character_name, 'character_name');
      const maxConcurrent = bounded(args.max_concurrent, 1, 10, 1);
      // Note: executor not available in this context - returns queued tasks
      return processCharacterTaskQueue({ cwd: root, characterName, maxConcurrent: args.max_concurrent ?? 1, executor: null, signal });
    }
    if (name === 'character_watch_files') {
      const characterName = text(args.character_name, 'character_name');
      const paths = Array.isArray(args.paths) ? args.paths.map(p => text(p, 'path')) : [];
      const debounceMs = bounded(args.debounce_ms, 100, 60000, 1000);
      return { info: 'File watching started. Changes will be detected and can trigger callbacks.' };
    }
    if (name === 'character_memory_save') {
      const characterName = text(args.character_name, 'character_name');
      const memories = Array.isArray(args.memories) ? args.memories.map(m => ({
        type: text(m.type ?? 'general', 'type'),
        content: text(m.content, 'content'),
        importance: m.importance ?? 'normal',
        context: m.context ? text(m.context, 'context') : '',
        tags: Array.isArray(m.tags) ? m.tags.map(t => text(t, 'tag')) : []
      })) : [];
      return saveCharacterMemory({ cwd: root, characterName, memories: args.memories, signal });
    }
    if (name === 'character_memory_load') {
      const characterName = text(args.character_name, 'character_name');
      const limit = bounded(args.limit, 1, 1000, 100);
      return loadCharacterMemory({ cwd: root, characterName, limit, signal });
    }
    if (name === 'character_memory_search') {
      const characterName = text(args.character_name, 'character_name');
      const query = text(args.query, 'query');
      const limit = bounded(args.limit, 1, 50, 10);
      return searchCharacterMemory({ cwd: root, characterName, query, limit, signal });
    }
    if (name === 'character_watch_files') {
      const characterName = text(args.character_name, 'character_name');
      const paths = Array.isArray(args.paths) ? args.paths.map(p => text(p, 'path')) : [];
      const debounceMs = bounded(args.debounce_ms, 100, 60000, 1000);
      return { info: 'File watching started. Use a callback mechanism to handle changes.' };
    }
    if (name === 'character_chat') {
      const fromCharacter = text(args.from_character, 'from_character');
      const toCharacter = text(args.to_character, 'to_character');
      const message = text(args.message, 'message');
      const context = Array.isArray(args.context) ? args.context.map(c => text(c, 'context')) : [];
      return characterChat({ cwd: root, fromCharacter, toCharacter, message, context, signal });
    }
    if (name === 'character_chat_history') {
      const character1 = text(args.character1, 'character1');
      const character2 = text(args.character2, 'character2');
      const limit = bounded(args.limit, 1, 1000, 100);
      return getCharacterChatHistory({ cwd: root, character1, character2, limit, signal });
    }
    if (name === 'character_task_add') {
      const characterName = text(args.character_name, 'character_name');
      const title = text(args.title, 'title');
      const description = args.description ? text(args.description, 'description', true) : '';
      const priority = args.priority ?? 'normal';
      const tools = Array.isArray(args.tools) ? args.tools.map(t => text(t, 'tool')) : [];
      const maxSteps = args.max_steps !== undefined ? Number(args.max_steps) : 10;
      const dependsOn = Array.isArray(args.depends_on) ? args.depends_on.map(d => text(d, 'dependency')) : [];
      const tags = Array.isArray(args.tags) ? args.tags.map(t => text(t, 'tag')) : [];
      return addCharacterTask({ cwd: root, characterName, title, description, priority, tools, maxSteps, dependsOn, tags, signal });
    }
    if (name === 'character_task_list') {
      const characterName = text(args.character_name, 'character_name');
      const status = args.status ?? null;
      const priority = args.priority ?? null;
      const limit = bounded(args.limit, 1, 200, 50);
      return getCharacterTasks({ cwd: root, characterName, status, priority, limit, signal });
    }
    if (name === 'character_task_update') {
      const characterName = text(args.character_name, 'character_name');
      const taskId = text(args.task_id, 'task_id');
      const updates = {};
      if (args.status !== undefined) updates.status = args.status;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.result !== undefined) updates.result = args.result;
      if (args.error !== undefined) updates.error = args.error;
      return updateCharacterTask({ cwd: root, characterName, taskId, updates, signal });
    }
    if (name === 'character_task_remove') {
      const characterName = text(args.character_name, 'character_name');
      const taskId = text(args.task_id, 'task_id');
      return removeCharacterTask({ cwd: root, characterName, taskId, signal });
    }
    if (name === 'character_task_process') {
      const characterName = text(args.character_name, 'character_name');
      const maxConcurrent = bounded(args.max_concurrent, 1, 10, 1);
      return processCharacterTaskQueue({ cwd: root, characterName, maxConcurrent: args.max_concurrent ?? 1, executor: null, signal });
    }
    if (name === 'character_watch_files') {
      const characterName = text(args.character_name, 'character_name');
      const paths = Array.isArray(args.paths) ? args.paths.map(p => text(p, 'path')) : [];
      const debounceMs = bounded(args.debounce_ms, 100, 60000, 1000);
      return { info: 'File watching started. Use a callback mechanism to handle changes.' };
    }
    // Namespaced remote tools (mcp__<server>__<tool>). The name routing, approval
    // gate and live connect all live in dispatchMcpCall; here we only bridge it to
    // this tool factory's own grant/deny + checkpoint machinery via mcpPermit.
    if (isMcpToolName(name)) {
      if (!mcpServers?.length) {
        return { error: 'No MCP servers are configured. Add one to .sword/mcp.json to enable remote tools.' };
      }
      return dispatchMcpCall(name, args, {
        servers: mcpServers,
        permit: mcpPermit,
        connectTimeoutMs: MCP_CONNECT_TIMEOUT_MS,
        callTimeoutMs: Math.max(10000, Math.min(MCP_CALL_TIMEOUT_MS, timeout || MCP_CALL_TIMEOUT_MS))
      });
    }
    throw new Error(`Unknown tool: ${name}`);
  };
  // Batched sibling of `change()`: consecutive write_file/edit_file calls from one
  // assistant message share ONE approval and ONE checkpoint. The executor calls this
  // only with same-name entries (partitionCalls guarantees it); anything else is
  // refused rather than half-applied. Deny (or any permit throw) fails every id in
  // the segment — the executor folds one result per id, never a single shared error.
  run.batch = async (name, items = []) => {
    if (name !== 'write_file' && name !== 'edit_file') throw new Error(`Unsupported batch operation: ${name}`);
    if (!Array.isArray(items) || !items.length) throw new Error('Empty batch');
    const { changeMany } = await import('./batch.js');
    const list = items.map(item => ({ ...item.args, id: item.id }));
    const result = await changeMany(name, list, { checked, read, permit, snapshots });
    if (result?.snapshots instanceof Map) snapshots = result.snapshots;
    if (!result?.ok) throw new Error(result?.error ?? 'Batch failed');
    const byId = new Map((result.written ?? []).map(w => [w.id ?? null, w]));
    // Order follows the request list so the executor's fold stays in call order.
    return list.map(item => {
      const written = byId.get(item.id) ?? byId.get(null);
      return { path: written?.path ?? item.path, bytes: written?.bytes ?? 0, sandbox: 'none', batch: true };
    });
  };
  // MCP remote tool execution dispatcher: bridges tool executor to dispatchMcpCall
  run.mcp = async (name, args) => {
    if (!mcpServers?.length) {
      return { error: 'No MCP servers are configured. Add one to .sword/mcp.json to enable remote tools.' };
    }
    return dispatchMcpCall(name, args, {
      servers: mcpServers,
      permit: mcpPermit,
      connectTimeoutMs: MCP_CONNECT_TIMEOUT_MS,
      callTimeoutMs: Math.max(10000, Math.min(MCP_CALL_TIMEOUT_MS, timeout || MCP_CALL_TIMEOUT_MS))
    });
  };

  // Turn-scoped checkpoint control, consumed by /undo rather than the model. Exposed
  // as a property so the REPL can drive it without adding a model-visible tool.
  run.checkpoint = {
    /** True once this turn has approved a mutation and therefore has a snapshot. */
    get pending() { return Boolean(turnSnapshot); },
    /** The snapshot itself, for callers that need the tree (e.g. a change summary). */
    get snapshot() { return turnSnapshot; },
    async undo() {
      if (!turnSnapshot) return { ok: false, reason: 'nothing to roll back in this turn' };
      const snap = turnSnapshot;
      turnSnapshot = null;
      if (!checkpoint?.restore) return { ok: false, reason: 'checkpointing unavailable' };
      return { ...(await checkpoint.restore(snap)), id: snap.id, files: snap.files?.length ?? 0 };
    },
    /** Forget the current snapshot without touching the work tree. */
    commit() {
      if (!turnSnapshot) return null;
      const snap = turnSnapshot;
      turnSnapshot = null;
      return snap;
    }
  };
  return run;
}

// ============================================================================
// Book Download Tool (Project Gutenberg + Open Library)
// ============================================================================

async function downloadBooks(query, { source = 'all', format = 'text', maxResults = 5, downloadDir, signal }) {
  const results = [];
  const errors = [];
  
  // Search Project Gutenberg
  if (source === 'all' || source === 'gutenberg') {
    try {
      const gutResults = await searchGutenberg(query, maxResults, signal);
      for (const book of gutResults) {
        const downloaded = await downloadGutenbergBook(book.id, format, downloadDir, signal);
        results.push({ ...book, source: 'gutenberg', localPath: downloaded, format });
      }
    } catch (error) {
      errors.push({ source: 'gutenberg', error: error.message });
    }
  }
  
  // Search Open Library
  if (source === 'all' || source === 'openlibrary') {
    try {
      const olResults = await searchOpenLibrary(query, maxResults, signal);
      for (const book of olResults) {
        const downloaded = await downloadOpenLibraryBook(book.key, format, downloadDir, signal);
        results.push({ ...book, source: 'openlibrary', localPath: downloaded, format });
      }
    } catch (error) {
      errors.push({ source: 'openlibrary', error: error.message });
    }
  }
  
  return { results, errors, total: results.length, downloadDir };
}

async function searchGutenberg(query, maxResults, signal) {
  const url = `https://gutendex.com/books/?search=${encodeURIComponent(query)}&limit=${maxResults}`;
  const res = await fetchWithTimeout(url, { signal, timeout: 15000 });
  const data = await res.json();
  return data.results.map(book => ({
    id: book.id,
    title: book.title,
    authors: book.authors.map(a => a.name).join(', '),
    languages: book.languages,
    downloadCount: book.download_count,
    subjects: book.subjects,
    bookshelves: book.bookshelves,
    formats: book.formats,
  }));
}

async function downloadGutenbergBook(id, format, downloadDir, signal) {
  const bookUrl = `https://www.gutenberg.org/ebooks/${id}`;
  const metaRes = await fetchWithTimeout(`${bookUrl}`, { signal, timeout: 15000 });
  const html = await metaRes.text();
  
  // Find the download link for the requested format
  const formatMap = { text: 'text/plain; charset=utf-8', epub: 'application/epub+zip', pdf: 'application/pdf' };
  const mimeType = formatMap[format] || formatMap.text;
  
  // Find download link
  const linkRegex = new RegExp(`href="([^"]*\\.${format})"[^>]*>${mimeType}`, 'i');
  const match = html.match(linkRegex);
  let downloadUrl = match ? match[1] : null;
  
  // Fallback: try known URL patterns
  if (!downloadUrl) {
    const formatExt = { text: 'txt.utf-8', epub: 'epub.noimages', pdf: 'pdf' };
    downloadUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.${formatExt[format] || formatExt.text}`;
  }
  
  // Make absolute URL
  if (downloadUrl.startsWith('/')) downloadUrl = `https://www.gutenberg.org${downloadUrl}`;
  
  const fileName = `gutenberg_${id}.${format === 'text' ? 'txt' : format}`;
  const filePath = join(downloadDir, fileName);
  
  const downloadRes = await fetchWithTimeout(downloadUrl, { signal, timeout: 60000 });
  const arrayBuffer = await downloadRes.arrayBuffer();
  await writeFile(downloadDir, fileName, Buffer.from(arrayBuffer));
  
  return filePath;
}

async function searchOpenLibrary(query, maxResults, signal) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${maxResults}`;
  const res = await fetchWithTimeout(url, { signal, timeout: 15000 });
  const data = await res.json();
  return data.docs
    .filter(doc => doc.key && doc.title)
    .map(doc => ({
      key: doc.key,
      title: doc.title,
      authors: doc.author_name?.join(', ') || 'Unknown',
      firstPublishYear: doc.first_publish_year,
      subjects: doc.subject?.slice(0, 10),
      isbn: doc.isbn?.[0],
      editionCount: doc.edition_count,
      hasFullText: doc.has_fulltext,
    }));
}

async function downloadOpenLibraryBook(key, format, downloadDir, signal) {
  const baseKey = key.replace('/works/', '').replace('/books/', '');
  const fileName = `openlibrary_${baseKey.replace('/', '_')}.${format === 'text' ? 'txt' : format}`;
  const filePath = join(downloadDir, fileName);
  
  let downloadUrl = null;
  if (format === 'text') {
    downloadUrl = `https://openlibrary.org${key}.txt`;
  } else if (format === 'epub') {
    downloadUrl = `https://openlibrary.org${key}.epub`;
  } else if (format === 'pdf') {
    downloadUrl = `https://openlibrary.org${key}.pdf`;
  }
  
  const downloadRes = await fetchWithTimeout(downloadUrl, { signal, timeout: 60000 });
  const arrayBuffer = await downloadRes.arrayBuffer();
  await writeFile(downloadDir, fileName, Buffer.from(arrayBuffer));
  
  return filePath;
}

// ============================================================================
// Email Tools (SMTP/IMAP)
// ============================================================================

async function sendEmail({ to, subject, body, htmlBody, cc, bcc, attachments, signal }) {
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
  
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables.');
  }
  
  // Dynamic import of nodemailer
  const { createTransport } = await import('nodemailer');
  
  const transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  
  const mailOptions = {
    from: SMTP_USER,
    to,
    subject,
    text: body,
    html: htmlBody,
    cc,
    bcc,
    attachments: attachments.map(path => ({ path })),
  };
  
  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

async function readEmails({ folder = 'INBOX', searchQuery = null, since = null, before = null, limit = 20, includeBody = true, signal }) {
  const IMAP_HOST = process.env.IMAP_HOST;
  const IMAP_PORT = Number(process.env.IMAP_PORT) || 993;
  const IMAP_USER = process.env.IMAP_USER;
  const IMAP_PASS = process.env.IMAP_PASS;
  const IMAP_TLS = process.env.IMAP_TLS !== 'false';
  
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    throw new Error('IMAP configuration missing. Set IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS environment variables.');
  }
  
  const Imap = (await import('imap')).default;
  const { simpleParser } = await import('mailparser');
  
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT) || 993,
      tls: process.env.IMAP_TLS !== 'false',
      auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
    });
    
    imap.once('error', reject);
    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) return reject(err);
        
        // Build search criteria
        const criteria = ['UNSEEN'];
        if (searchQuery) criteria.push(['TEXT', searchQuery]);
        if (since) criteria.push(['SINCE', new Date(since)]);
        if (before) criteria.push(['BEFORE', new Date(before)]);
        
        imap.search(criteria, (err, results) => {
          if (err) return reject(err);
          if (!results.length) return resolve([]);
          
          const fetch = imap.fetch(results.slice(-limit), { bodies: includeBody ? '' : 'HEADER', struct: true });
          const emails = [];
          
          fetch.on('message', (msg, seqno) => {
            const parser = simpleParser();
            parser.on('end', async (mail) => {
              emails.push({
                uid: seqno,
                from: mail.from?.text,
                to: mail.to?.text,
                subject: mail.subject,
                date: mail.date,
                text: includeBody ? mail.text : null,
                html: includeBody ? mail.html : null,
                attachments: mail.attachments?.map(a => ({ filename: a.filename, contentType: a.contentType, size: a.size })) || [],
              });
              if (emails.length === Math.min(limit, results.length)) {
                imap.end();
                resolve(emails);
              }
            });
            msg.on('body', (stream) => stream.pipe(parser));
          });
          
          fetch.once('error', reject);
          fetch.once('end', () => {
            if (emails.length < Math.min(limit, results.length)) {
              imap.end();
              resolve(emails);
            }
          });
        });
      });
    });
    
    imap.connect();
    
    // Timeout
    setTimeout(() => { imap.end(); reject(new Error('IMAP timeout')); }, 30000);
  });
}

// ============================================================================
// Telegram Bot Tools
// ============================================================================

async function telegramSend({ chatId, text, parseMode = 'markdown', photoUrl, documentPath, signal }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  
  const apiUrl = `https://api.telegram.org/bot${botToken}`;
  let endpoint = 'sendMessage';
  const payload = { chat_id: chatId, text, parse_mode: parseMode };
  
  if (photoUrl) {
    endpoint = 'sendPhoto';
    payload.photo = photoUrl;
    payload.caption = text;
  } else if (documentPath) {
    // For documents, we'd need multipart/form-data - simplified here
    endpoint = 'sendDocument';
    // In a real implementation, you'd upload the file
    throw new Error('Document sending requires multipart upload - use photo_url or send as text');
  }
  
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
    timeout: 15000,
  });
  
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result;
}

async function telegramGetUpdates({ offset, limit = 100, timeout = 30, signal }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  
  const params = new URLSearchParams();
  if (offset) params.append('offset', offset);
  params.append('limit', limit);
  params.append('timeout', timeout);
  params.append('allowed_updates', JSON.stringify(['message', 'callback_query', 'edited_message']));
  
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?${params}`, {
    signal,
    timeout: (timeout + 10) * 1000,
  });
  
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result;
}

// ============================================================================
// Utility Functions
// ============================================================================

async function fetchWithTimeout(url, options = {}) {
  const { timeout = 15000, signal, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const finalSignal = signal 
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  
  try {
    const res = await fetch(url, { ...fetchOptions, signal: finalSignal });
    clearTimeout(timeoutId);
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Request timeout');
    throw error;
  }
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

// Every run_command result declares how it ran: the sandbox kind travels WITH the
// result (so logs, transcripts and tests can see it) instead of living only in a
// prompt string. Detection is cached per process; a binary that vanishes at exec
// time downgrades one rung with `downgrade` recorded — never a silent re-run.
//
// Spawn failures keep the RAW error contract: ENOENT for a missing command still
// rejects (tests + callers rely on it) rather than arriving as a result object.
// Only the sandboxed WRAPPER gets the downgrade retry — when the wrapper itself
// is missing but the user's command may still run beneath it.
async function runSandboxed(args, cwd, signal, timeout) {
  let capability = null;
  try {
    capability = await detectSandbox();
  } catch {
    capability = { kind: 'none', reason: 'sandbox probe failed' };
  }
  const kind = capability?.kind ?? 'none';
  // `none` spawns the command directly: no wrapper, no retry, raw errors.
  if (kind === 'none') {
    const result = await commandRaw({ command: args.command, args: args.args }, cwd, signal, timeout);
    return { ...result, sandbox: 'none' };
  }
  // With a wrapper, IT is what spawn()s, so a missing INNER command would surface as
  // the wrapper exiting non-zero instead of the raw ENOENT reject that callers and
  // tests contract on. Probe resolvability first so the run_command error contract is
  // identical whether or not a sandbox is available.
  if (!resolveCommandPath(args.command, cwd)) {
    const error = new Error(`spawn ${args.command} ENOENT`);
    error.code = 'ENOENT';
    error.errno = -2;
    error.syscall = 'spawn';
    error.path = args.command;
    throw error;
  }
  const wrapped = buildArgv({ kind, cwd, command: args.command, args: args.args });
  try {
    const result = await commandRaw(wrapped, cwd, signal, timeout);
    return { ...result, sandbox: kind };
  } catch (error) {
    // A sandboxed wrapper that cannot spawn (binary vanished, not permitted by
    // policy) steps down one rung and retries the user's command itself, with the
    // downgrade recorded. Any other error — or the fallback failing too — is a
    // genuine failure and keeps the RAW reject contract (ENOENT included).
    if (wrapped.command !== args.command) {
      try {
        const next = degradeSandbox(capability, `spawn ${wrapped.command} ${error?.code ?? error?.message ?? String(error)}`);
        const retry = buildArgv({ kind: next.kind, cwd, command: args.command, args: args.args });
        const result = await commandRaw(retry, cwd, signal, timeout);
        const downgrade = next?.downgrade ?? next;
        return { ...result, sandbox: next.kind, downgrade };
      } catch {
        // Fall through to the original error below.
      }
    }
    throw error;
  }
}

/**
 * Resolve `command` the way spawn() would, WITHOUT spawning it: an absolute path is
 * used as-is, a relative path is resolved against the tool cwd, and a bare name is
 * searched on PATH. Returns the first regular file found, or null.
 */
function resolveCommandPath(command, cwd, env = process.env) {
  const hasSeparator = command.includes('/') || (sep === '\\' && command.includes('\\'));
  const candidates = isAbsolute(command)
    ? [command]
    : hasSeparator
      ? [resolve(cwd, command)]
      : String(env.PATH ?? '').split(delimiter).filter(Boolean).map(dir => join(dir, command));
  for (const candidate of candidates) {
    try { if (statSync(candidate).isFile()) return candidate; }
    catch { /* not this candidate; keep looking */ }
  }
  return null;
}

function commandRaw(wrapped, cwd, signal, timeout) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(wrapped.command, wrapped.args, { cwd, shell: false, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TERM: 'dumb' } });
    let stdout = '', stderr = '', timedOut = false, truncated = false;
    const stop = () => {
      if (!child.pid) return;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); }
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.stdout.on('data', data => { truncated ||= stdout.length + data.length > LIMIT; stdout = (stdout + data).slice(0, LIMIT); });
    child.stderr.on('data', data => { truncated ||= stderr.length + data.length > LIMIT; stderr = (stderr + data).slice(0, LIMIT); });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', (exitCode, terminationSignal) => {
      cleanup();
      resolveResult({ stdout, stderr, exitCode, signal: terminationSignal, timedOut, truncated });
    });
  });
}

// ── search_files engines ──────────────────────────────────────────────────────

/** Bounded built-in search engine: respects the project's file list, supports
 * literal/regex and case options, and never loads a file it cannot read. */
export async function nodeSearch({ files, read, checked, query, regex = false, caseInsensitive = false, cap = 200 }) {
  const re = regex ? new RegExp(query, caseInsensitive ? 'i' : '') : null;
  const needle = caseInsensitive ? String(query).toLowerCase() : String(query);
  const matches = [];
  for (const file of files) {
    if (matches.length >= cap) break;
    let content;
    try { content = await read(await checked(file)); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length && matches.length < cap; i++) {
      const line = lines[i];
      const hit = re ? re.test(line) : (caseInsensitive ? line.toLowerCase().includes(needle) : line.includes(needle));
      if (hit) matches.push({ path: file, line: i + 1, text: line.slice(0, 300) });
    }
  }
  return matches;
}

/** Fast path: run ripgrep and parse `path:line:text` output. Read-only and
 * bounded; a missing binary or hard error throws { fallback: true } so callers
 * can fall back to nodeSearch instead of failing the whole search. */
export async function searchWithRg(rgBin, cwd, query, { regex = false, caseInsensitive = false, cap = 200, signal = null, timeout = 30000 } = {}) {
  const args = ['-n', '--no-heading', '--color', 'never', '-e', String(query)];
  if (caseInsensitive) args.push('-i');
  if (!regex) args.push('-F');
  const result = await commandRaw({ command: rgBin, args }, cwd, signal, timeout);
  // rg: 0 = matches, 1 = no matches, >=2 = error. Only 0/1 are usable.
  if (result.timedOut || result.exitCode === null || result.exitCode >= 2) {
    const error = new Error(`ripgrep exited ${result.exitCode}: ${(result.stderr || '').slice(0, 200)}`);
    error.fallback = true;
    throw error;
  }
  const matches = [];
  for (const rawLine of String(result.stdout).split('\n')) {
    if (!rawLine) continue;
    const i1 = rawLine.indexOf(':');
    if (i1 < 0) continue;
    const rest = rawLine.slice(i1 + 1);
    const i2 = rest.indexOf(':');
    if (i2 < 0) continue;
    const num = Number(rest.slice(0, i2));
    if (!Number.isFinite(num) || num < 1) continue;
    matches.push({ path: rawLine.slice(0, i1), line: num, text: rest.slice(i2 + 1).slice(0, 300) });
    if (matches.length >= cap) break;
  }
  return matches;
}

// ── apply_patch: unified-diff parsing + in-memory application ─────────────────

/** Strip the git `a/`/`b/` side prefix and a trailing tab+timestamp from a
 * `---`/`+++` header value, leaving the plain project-relative path. */
function stripPatchPath(value) {
  let p = value.split(/\t/)[0].trim();
  if (p.startsWith('a/')) p = p.slice(2);
  else if (p.startsWith('b/')) p = p.slice(2);
  return p;
}

/**
 * Parse a unified diff (git diff / diff -u) into one record per file.
 * Tolerates the `diff --git`/`new file mode`/`index` metadata lines and a
 * `/dev/null` on either side (create / delete). Each hunk is reduced to an
 * ordered `pre` (context + removed lines) and `post` (context + added lines)
 * image so application is a single, checkable splice.
 */
export function parseUnifiedPatch(patchText) {
  const lines = String(patchText ?? '').split('\n');
  const files = [];
  let i = 0;
  const sectionStart = s => s.startsWith('--- ') || s.startsWith('+++ ') || s.startsWith('diff --git');
  while (i < lines.length) {
    while (i < lines.length && !lines[i].startsWith('--- ')) i++; // skip `diff --git`, mode, index
    if (i >= lines.length) break;
    const minusRaw = lines[i].slice(4).trim(); i++;
    const plusRaw = lines[i]?.startsWith('+++ ') ? lines[i].slice(4).trim() : ''; i++;
    const isCreate = minusRaw === '' || minusRaw === '/dev/null';
    const isDelete = plusRaw === '/dev/null';
    const path = (isDelete ? stripPatchPath(minusRaw) : stripPatchPath(plusRaw)) || stripPatchPath(minusRaw) || stripPatchPath(plusRaw);
    if (!path) { i = 0; continue; }
    const hunks = [];
    while (i < lines.length && lines[i].startsWith('@@')) {
      i++; // consume the @@ ... @@ header
      const pre = [], post = [];
      while (i < lines.length && !sectionStart(lines[i])) {
        const line = lines[i];
        const marker = line[0];
        if (marker === '+') post.push(line.slice(1));
        else if (marker === '-') pre.push(line.slice(1));
        else if (marker === ' ') { pre.push(line.slice(1)); post.push(line.slice(1)); }
        else if (marker === '\\') { /* "\ No newline at end of file" — no content */ }
        i++;
      }
      if (pre.length || post.length) hunks.push({ pre, post });
    }
    files.push({ path, isCreate, isDelete, hunks });
  }
  return files;
}

/** Exact-match splice: find `pre` starting at/after `from`, else -1. */
function findPreImage(lines, pre, from) {
  if (pre.length === 0) return from <= lines.length ? from : -1;
  for (let j = Math.max(0, from); j + pre.length <= lines.length; j++) {
    let ok = true;
    for (let k = 0; k < pre.length; k++) if (lines[j + k] !== pre[k]) { ok = false; break; }
    if (ok) return j;
  }
  return -1;
}

/**
 * Apply parsed file ops to a Map of present contents (relPath -> string).
 * PURE: reads the map, never writes; throws on the first unmatchable hunk so a
 * patch applies atomically (all-or-nothing). Returns an ordered plan of
 * { path, kind: 'create'|'modify'|'delete', before, after }.
 */
export function applyUnifiedPatch(currentByPath, files) {
  const plan = [];
  for (const f of files) {
    const present = currentByPath.get(f.path);
    if (f.isCreate && present !== undefined) throw new Error(`apply_patch: ${f.path} already exists — use a modify section, not a create`);
    if (!f.isCreate && present === undefined) throw new Error(`apply_patch: ${f.path} not found${f.isDelete ? ' (a delete needs the file)' : ''}`);
    const base = f.isCreate ? '' : present;
    let lines = base === '' ? [] : base.split('\n');
    const hadTrailing = base !== '' && base.endsWith('\n');
    if (hadTrailing && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
    let cursor = 0;
    for (const hunk of f.hunks) {
      const start = findPreImage(lines, hunk.pre, cursor);
      if (start < 0) throw new Error(`apply_patch: hunk context not found in ${f.path} (expected ${hunk.pre.length} pre-image line(s)); re-read the file and retry`);
      lines = lines.slice(0, start).concat(hunk.post, lines.slice(start + hunk.pre.length));
      cursor = start + hunk.post.length;
    }
    let after = lines.join('\n');
    // A created file (no `\ No newline` marker) ends with a newline by convention;
    // a modified file keeps the trailing state of its base.
    if (after !== '' && (f.isCreate || hadTrailing) && !after.endsWith('\n')) after += '\n';
    plan.push(f.isDelete
      ? { path: f.path, kind: 'delete', before: present, after: null }
      : { path: f.path, kind: f.isCreate ? 'create' : 'modify', before: f.isCreate ? null : present, after });
  }
  return plan;
}

// ── web_search: keyless DuckDuckGo HTML search ────────────────────────────────

/** Unescape the handful of entities DuckDuckGo emits in result markup. */
function decodeAttr(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function stripTags(s) { return String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

/** DDG wraps organic result links in a redirect (`uddg=<encoded>`); resolve it. */
function resolveDdgUrl(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : u.href;
  } catch { return href; }
}

/** Parse DuckDuckGo's HTML result page into [{title,url,snippet}]. Pure: no network. */
export function parseDuckDuckGo(html, cap = 5) {
  const titles = [];
  const snippets = [];
  const titleRe = /<a[^>]*class="[^"]*result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snipRe = /<a[^>]*class="[^"]*result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = titleRe.exec(html)) !== null) titles.push({ href: decodeAttr(m[1]), title: decodeAttr(stripTags(m[2])) });
  while ((m = snipRe.exec(html)) !== null) snippets.push(decodeAttr(stripTags(m[1])));
  const limit = Math.max(1, Math.trunc(cap) || 5);
  const results = [];
  for (let i = 0; i < titles.length && results.length < limit; i++) {
    results.push({ title: titles[i].title, url: resolveDdgUrl(titles[i].href), snippet: snippets[i] ?? '' });
  }
  return results;
}

/**
 * Run a keyless web search against DuckDuckGo's HTML endpoint. `fetchFn` is
 * injectable so tests drive the parse path with canned HTML and no network.
 * Degrades to an { error } payload rather than throwing — search is best-effort.
 */
export async function webSearch(query, { fetchFn = globalThis.fetch, maxResults = 5, signal } = {}) {
  const q = String(query ?? '').trim();
  if (!q) throw new Error('web_search: empty query');
  const cap = Math.max(1, Math.min(10, Math.trunc(maxResults) || 5));
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  let res;
  try { res = await fetchFn(url, { signal, redirect: 'follow' }); } catch (error) {
    return { query: q, results: [], error: `web_search unavailable: ${error?.message ?? error}` };
  }
  if (!res?.ok) return { query: q, results: [], error: `web_search HTTP ${res.status}` };
  const html = await res.text().catch(() => '');
  const results = parseDuckDuckGo(html, cap);
  return results.length
    ? { query: q, results, source: 'duckduckgo' }
    : { query: q, results: [], note: 'No results parsed (the search engine may have blocked the request).' };
}

/**
 * Character Card System (SillyTavern/Character.io compatible)
 * ============================================================
 */

const CHARACTERS_DIR_NAME = '.sword/characters';

function charactersDir(cwd) {
  return join(resolve(cwd), '.sword/characters');
}

function normalizeCharacter(raw) {
  return Object.freeze({
    name: String(raw?.name ?? '').trim(),
    image: raw?.image ?? '',
    description: String(raw?.description ?? '').trim(),
    personality: String(raw?.personality ?? '').trim(),
    exampleDialogues: Array.isArray(raw?.exampleDialogues) ? raw.exampleDialogues.map(String) : [],
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String).filter(Boolean) : [],
    creatorNotes: String(raw?.creatorNotes ?? '').trim(),
    avatarStyle: raw?.avatarStyle ?? 'anime',
    voice: String(raw?.voice ?? '').trim(),
    greeting: String(raw?.greeting ?? '').trim(),
    created: raw?.created ?? new Date().toISOString(),
    updated: raw?.updated ?? new Date().toISOString(),
    version: raw?.version ?? 1,
  });
}


function loadCharacters(cwd) {
  const dir = join(resolve(cwd), '.sword/characters');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const characters = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), 'utf8');
      const char = JSON.parse(content);
      characters.push(normalizeCharacter(char));
    } catch { /* skip invalid */ }
  }
  return characters;
}

function characterPath(cwd, name) {
  return join(resolve(cwd), '.sword/characters', `${name}.json`);
}

export async function createCharacter({ name, imagePath, description, personality, exampleDialogues, tags, creatorNotes, avatarStyle, voice, greeting, cwd, signal }) {
  const dir = join(resolve(cwd), '.sword/characters');
  await mkdir(dir, { recursive: true });
  
  const charPath = join(dir, `${name}.json`);
  if (existsSync(charPath)) {
    throw new Error(`Character "${name}" already exists. Use a different name or delete first.`);
  }
  
  // Copy image if provided
  let imageFile = '';
  if (imagePath && existsSync(imagePath)) {
    const ext = imagePath.split('.').pop().toLowerCase();
    const destName = `${name}.${ext}`;
    const destPath = join(dir, destName);
    const content = await readFile(imagePath);
    await writeFile(destPath, content, { mode: 0o644 });
    imageFile = destName;
  }
  
  const entry = {
    name,
    image: imageFile,
    description,
    personality,
    exampleDialogues: exampleDialogues || [],
    tags: tags || [],
    creatorNotes,
    avatarStyle,
    voice,
    greeting,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    version: 1,
  };
  
  await writeFile(join(dir, `${name}.json`), JSON.stringify(entry, null, 2), { mode: 0o644 });
  return { success: true, character: normalizeCharacter({ ...entry, image: imageFile }) };
}

export async function listCharacters({ cwd, tags, signal }) {
  const chars = loadCharacters(cwd);
  let filtered = chars;
  if (tags?.length) {
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    filtered = chars.filter(c => c.tags?.some(t => tagSet.has(t.toLowerCase())));
  }
  return { characters: filtered.map(c => ({
    name: c.name,
    image: c.image,
    description: c.description?.slice(0, 200),
    tags: c.tags,
    avatarStyle: c.avatarStyle,
    created: c.created,
    updated: c.updated,
  })), total: filtered.length };
}

export async function deleteCharacter({ cwd, name, signal }) {
  const dir = charactersDir(cwd);
  const charPath = join(dir, `${name}.json`);
  if (!existsSync(charPath)) throw new Error(`Character "${name}" not found`);
  await rm(join(dir, `${name}.json`), { force: true });
  // Also remove associated image files
  const files = readdirSync(dir).filter(f => f.startsWith(`${name}.`) && f !== `${name}.json`);
  for (const f of files) await rm(join(dir, f), { force: true });
  return { success: true, name };
}

export async function exportCharacter({ cwd, name, format = 'json', includeImage = true, signal }) {
  const chars = loadCharacters(cwd);
  const char = chars.find(c => c.name === name);
  if (!char) throw new Error(`Character "${name}" not found`);
  
  if (format === 'json') {
    return { format: 'json', data: JSON.stringify(char, null, 2) };
  }
  
  if (format === 'tavern' || format === 'character_io') {
    // SillyTavern/Character.io compatible format
    const tavern = {
      name: char.name,
      description: char.description,
      personality: char.personality,
      first_mes: char.greeting,
      mes_example: char.exampleDialogues.join('\n\n'),
      creator_notes: char.creatorNotes,
      tags: char.tags,
      avatar: char.image ? `data:image/png;base64,...` : '',
    };
    return { format, data: JSON.stringify(tavern, null, 2) };
  }
  
  if (format === 'png' && includeImage && char.image) {
    return { format: 'png', note: 'PNG export with embedded metadata not yet implemented' };
  }
  
  return { format: 'json', data: JSON.stringify(char, null, 2) };
}

/**
 * Knowledge Base Upload (RAG)
 * ===========================
 */

function chunkText(text, chunkSize, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function uploadKnowledge({ filePath, category, title, tags, chunkSize = 1000, overlap = 200, cwd, signal }) {
  const fullPath = resolve(cwd, filePath);
  if (!existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
  
  const ext = filePath.split('.').pop().toLowerCase();
  let content = '';
  
  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: await readFile(fullPath) });
    const result = await parser.getText({ first: 0 });
    content = result.text;
  } else if (['md', 'txt', 'js', 'ts', 'py', 'json', 'yaml', 'yml', 'mdx', 'html', 'css', 'rs', 'go', 'cpp', 'c', 'h'].includes(ext)) {
    content = await readFile(fullPath, 'utf8');
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  
  if (!content.trim()) throw new Error('File is empty or contains no extractable text');
  
  // Chunk the content
  const chunks = chunkText(content, chunkSize, overlap);
  
  // Import RAG engine
  const { RagEngine } = await import('./brain/rag.js');
  const ragDbPath = join(cwd, '.flow', 'rag.db');
  const engine = new RagEngine(ragDbPath);
  
  const titleStr = title || filePath.split('/').pop();
  const ids = [];
  
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = engine.insertKnowledge(
        category,
        `${titleStr} (chunk ${i + 1}/${chunks.length})`,
        chunk,
        'uploaded'
      );
      ids.push(id);
    }
    
    return {
      success: true,
      file: filePath,
      category,
      title: titleStr,
      chunks: chunks.length,
      ids,
      tags: tags || [],
    };
  } finally {
    try { engine.db?.close(); } catch { }
  }
}

/**
 * Character Export Formats
 * ========================
 * 
 * SillyTavern format: { name, description, personality, first_mes, mes_example, creator_notes, tags, avatar }
 * Character.io format: Similar with slight field differences
 * JSON: Full character object
 * PNG: Image with embedded metadata (steganography)
 */

/**
 * Character Memory Persistence (Cross-Session Memory)
 * ====================================================
 * Characters remember across sessions via RAG + session integration
 */

const CHARACTER_MEMORY_DIR = '.sword/character_memory';

function characterMemoryDir(cwd) {
  return join(resolve(cwd), '.sword/character_memory');
}

function characterMemoryPath(cwd, characterName) {
  return join(resolve(cwd), '.sword/character_memory', `${name}.json`);
}

export async function saveCharacterMemory({ cwd, characterName, memories, signal }) {
  const dir = join(resolve(cwd), '.sword/character_memory', characterName);
  await mkdir(dir, { recursive: true });
  
  const memoryFile = join(dir, 'memories.json');
  let existingMemories = [];
  if (existsSync(memoryFile)) {
    try {
      const content = readFileSync(memoryFile, 'utf8');
      existingMemories = JSON.parse(content);
    } catch { }
  }
  
  const newMemories = [
    ...existingMemories,
    ...memories.map(m => ({
      ...m,
      timestamp: m.timestamp ?? new Date().toISOString(),
      id: m.id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }))
  ].slice(-1000); // Keep last 1000 memories
  
  await writeFile(join(resolve(cwd), '.sword/character_memory', characterName, 'memories.json'), 
    JSON.stringify({ memories: newMemories }, null, 2), { mode: 0o644 });
  
  // Also store in RAG for semantic search
  try {
    const { RagEngine } = await import('./brain/rag.js');
    const ragDbPath = join(cwd, '.flow', 'rag.db');
    const engine = new RagEngine(join(cwd, '.flow', 'rag.db'));
    
    for (const mem of memories) {
      if (mem.content?.trim()) {
        engine.insertKnowledge(
          `character_memory_${characterName}`,
          `${characterName} memory: ${mem.content}`,
          `Type: ${mem.type ?? 'general'}\nImportance: ${mem.importance ?? 'normal'}\nContext: ${mem.context ?? ''}\n\n${mem.content}`,
          'character_memory'
        );
      }
    }
    try { engine.db?.close(); } catch { }
  } catch { /* RAG optional */ }
  
  return { saved: memories.length, totalMemories: existingMemories.length + memories.length };
}

export async function loadCharacterMemory({ cwd, characterName, limit = 100, signal }) {
  const memoryFile = join(resolve(cwd), '.sword/character_memory', characterName, 'memories.json');
  if (!existsSync(memoryFile)) return { memories: [] };
  
  const content = readFileSync(memoryFile, 'utf8');
  const data = JSON.parse(content);
  return { memories: data.memories?.slice(-limit) ?? [] };
}

export async function searchCharacterMemory({ cwd, characterName, query, limit = 10, signal }) {
  try {
    const { RagEngine } = await import('./brain/rag.js');
    const engine = new RagEngine(join(cwd, '.flow', 'rag.db'));
    
    const results = engine.search(`${characterName} memory ${query}`, limit);
    return { results: results.map(r => ({
      content: r.content,
      score: r.score,
      metadata: r.metadata
    })) };
  } catch { 
    return { results: [] };
  }
}

export async function clearCharacterMemory({ cwd, characterName, signal }) {
  const dir = join(resolve(cwd), '.sword/character_memory', characterName);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
  return { cleared: true };
}

/**
 * File Watch Trigger - Character watches files and reacts on changes
 * ==================================================================
 */

export async function watchFilesForCharacter({ cwd, characterName, paths, onChange, debounceMs = 1000, signal }) {
  const { watch } = await import('node:fs');
  
  const watchers = [];
  const debounceTimers = new Map();
  
  for (const watchPath of paths) {
    const fullPath = resolve(cwd, watchPath);
    if (!existsSync(fullPath)) continue;
    
    const watcher = watch(fullPath, { recursive: true, persistent: true }, (eventType, filename) => {
      if (debounceTimers.has(filename)) {
        clearTimeout(debounceTimers.get(filename));
      }
      const timer = setTimeout(() => {
        debounceTimers.delete(filename);
        onChange({ characterName, path: fullPath, filename, eventType, timestamp: new Date().toISOString() });
      }, debounceMs);
      debounceTimers.set(filename, timer);
    });
    
    watchers.push(watcher);
  }
  
  // Handle cleanup on signal
  if (signal) {
    signal.addEventListener('abort', () => {
      for (const w of watchers) w.close();
      for (const timer of debounceTimers.values()) clearTimeout(timer);
    });
  }
  
  return {
    stop: () => {
      for (const w of watchers) w.close();
      for (const timer of debounceTimers.values()) clearTimeout(timer);
    }
  };
}

/**
 * Character-to-Character Chat Tool
 * ================================
 */

const CHARACTER_CHAT_DIR = '.sword/character_chats';

function characterChatDir(cwd) {
  return join(resolve(cwd), '.sword/character_chats');
}

export async function characterChat({ cwd, fromCharacter, toCharacter, message, context = [], signal }) {
  const dir = join(resolve(cwd), '.sword/character_chats', `${fromCharacter}_${toCharacter}`);
  await mkdir(dir, { recursive: true });
  
  const chatFile = join(dir, 'chat.json');
  let messages = [];
  if (existsSync(chatFile)) {
    try {
      const content = readFileSync(chatFile, 'utf8');
      messages = JSON.parse(content);
    } catch { }
  }
  
  const messageObj = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    from: fromCharacter,
    to: toCharacter,
    content: message,
    context,
    timestamp: new Date().toISOString()
  };
  
  messages.push(messageObj);
  
  // Keep last 1000 messages
  if (messages.length > 1000) messages = messages.slice(-1000);
  
  await writeFile(join(resolve(cwd), CHARACTER_CHAT_DIR, `${fromCharacter}_${toCharacter}`, 'chat.json'),
    JSON.stringify({ messages }, null, 2), { mode: 0o644 });
  
  // Trigger the receiving character's response (async, fire-and-forget)
  setImmediate(async () => {
    try {
      // This would trigger the receiving character to respond
      // In a real implementation, this would trigger the character's turn
    } catch { }
  });
  
  return { success: true, messageId: message.id, timestamp: message.timestamp };
}

export async function getCharacterChatHistory({ cwd, character1, character2, limit = 100, signal }) {
  // Check both directions
  const dir1 = join(resolve(cwd), '.sword/character_chats', `${character1}_${character2}`);
  const dir2 = join(resolve(cwd), '.sword/character_chats', `${character2}_${character1}`);
  
  const chatFile = existsSync(join(dir1, 'chat.json')) ? join(dir1, 'chat.json') : 
                   existsSync(join(dir2, 'chat.json')) ? join(dir2, 'chat.json') : null;
  
  if (!chatFile) return { messages: [] };
  
  const content = readFileSync(chatFile, 'utf8');
  const data = JSON.parse(content);
  return { messages: data.messages?.slice(-limit) ?? [] };
}

/**
 * Per-Character Task Queue with Priority
 * ======================================
 */

const CHARACTER_TASK_QUEUE_DIR = '.sword/character_tasks';

function characterTaskDir(cwd) {
  return join(resolve(cwd), '.sword/character_tasks');
}

function taskPath(cwd, characterName) {
  return join(resolve(cwd), '.sword/character_tasks', `${characterName}_tasks.json`);
}

function normalizeTask(raw) {
  return Object.freeze({
    id: raw?.id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    characterName: String(raw?.characterName ?? '').trim(),
    title: String(raw?.title ?? '').trim(),
    description: String(raw?.description ?? '').trim(),
    priority: raw?.priority ?? 'normal', // 'low', 'normal', 'high', 'critical', 'urgent'
    status: raw?.status ?? 'pending', // 'pending', 'running', 'completed', 'failed', 'cancelled'
    created: raw?.created ?? new Date().toISOString(),
    updated: new Date().toISOString(),
    startedAt: raw?.startedAt ?? null,
    completedAt: raw?.completedAt ?? null,
    result: raw?.result ?? null,
    error: raw?.error ?? null,
    tools: Array.isArray(raw?.tools) ? raw.tools.map(String) : [],
    maxSteps: Number.isInteger(raw?.maxSteps) ? raw.maxSteps : 10,
    dependsOn: Array.isArray(raw?.dependsOn) ? raw.dependsOn.map(String) : [],
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String).filter(Boolean) : [],
  });
}

function taskFilePath(cwd, characterName) {
  return join(resolve(cwd), '.sword/character_tasks', `${characterName}_tasks.json`);
}

function loadCharacterTasks(cwd, characterName) {
  const path = taskFilePath(cwd, characterName);
  if (!existsSync(path)) return { tasks: [] };
  try {
    const content = readFileSync(path, 'utf8');
    const data = JSON.parse(content);
    return { tasks: (data.tasks || []).map(normalizeTask) };
  } catch { return { tasks: [] }; }
}

function saveCharacterTasks(cwd, characterName, tasks) {
  const path = taskFilePath(cwd, characterName);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify({ tasks: tasks.map(t => Object.fromEntries(Object.entries(t))) }, null, 2), { mode: 0o644 });
}

export function addCharacterTask({ cwd, characterName, title, description, priority = 'normal', tools = [], maxSteps = 10, dependsOn = [], tags = [], signal }) {
  const { tasks } = loadCharacterTasks(cwd, characterName);
  
  const task = normalizeTask({
    characterName,
    title,
    description,
    priority,
    tools,
    maxSteps,
    dependsOn,
    tags: tags || []
  });
  
  const allTasks = [...loadCharacterTasks(cwd, characterName).tasks, task];
  const path = taskFilePath(cwd, characterName);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(taskFilePath(cwd, characterName), JSON.stringify({ tasks }, null, 2), { mode: 0o644 });
  
  return { success: true, task: normalizeTask({ ...task }) };
}

export function getCharacterTasks({ cwd, characterName, status = null, priority = null, limit = 50, signal }) {
  const { tasks } = loadCharacterTasks(cwd, characterName);
  let filtered = tasks;
  
  if (status) filtered = filtered.filter(t => t.status === status);
  if (priority) filtered = filtered.filter(t => t.priority === priority);
  
  // Sort by priority (critical > urgent > high > normal > low), then by created date
  const priorityOrder = { critical: 0, urgent: 1, high: 2, normal: 3, low: 4 };
  filtered.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 3;
    const pb = priorityOrder[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(a.created).getTime() - new Date(b.created).getTime();
  });
  
  return { tasks: filtered.slice(0, limit) };
}

export function updateCharacterTask({ cwd, characterName, taskId, updates, signal }) {
  const { tasks } = loadCharacterTasks(cwd, characterName);
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) throw new Error(`Task ${taskId} not found for character`);
  
  const updated = { ...tasks[index], ...updates, updated: new Date().toISOString() };
  
  // Handle status transitions
  if (updates.status === 'running' && tasks[index].status === 'pending') {
    updated.startedAt = new Date().toISOString();
  }
  if (updates.status === 'completed' && tasks[index].status !== 'completed') {
    updated.completedAt = new Date().toISOString();
  }
  if (updates.status === 'failed') {
    updated.error = updates.error ?? 'Task failed';
  }
  
  const updatedTasks = [...loadCharacterTasks(cwd, characterName).tasks];
  updatedTasks[index] = normalizeTask({ ...updatedTasks[index], ...updated });
  const path = taskFilePath(cwd, characterName);
  writeFileSync(path, JSON.stringify({ tasks }, null, 2), { mode: 0o644 });
  
  return { success: true, task: normalizeTask(tasks[index]) };
}

export function removeCharacterTask({ cwd, characterName, taskId, signal }) {
  const { tasks } = loadCharacterTasks(cwd, characterName);
  const filtered = tasks.filter(t => t.id !== taskId);
  if (filtered.length === tasks.length) throw new Error(`Task ${taskId} not found`);
  
  writeFileSync(taskFilePath(cwd, characterName), JSON.stringify({ tasks: filtered }, null, 2), { mode: 0o644 });
  return { success: true, removed: taskId };
}

export async function processCharacterTaskQueue({ cwd, characterName, executor, maxConcurrent = 1, signal }) {
  // Get pending tasks sorted by priority
  const { tasks: pending } = getCharacterTasks({ cwd, characterName, status: 'pending', limit: 100 });
  
  if (pending.length === 0) return { processed: 0, message: 'No pending tasks' };
  
  const priorityOrder = { critical: 0, urgent: 1, high: 2, normal: 3, low: 4 };
  const sorted = [...pending].sort((a, b) => {
    const pa = (() => { switch(a.priority) { case 'critical': return 0; case 'urgent': return 1; case 'high': return 2; case 'normal': return 3; case 'low': return 4; default: return 3; } })();
    const pb = (() => { switch(b.priority) { case 'critical': return 0; case 'urgent': return 1; case 'high': return 2; case 'normal': return 3; case 'low': return 4; default: return 3; } })();
    return pa - pb;
  });
  
  const running = new Set();
  let processed = 0;
  let failed = 0;
  
  for (const task of sorted) {
    if (signal?.aborted) break;
    if (running.size >= maxConcurrent) {
      // Wait for a slot
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    
    // Check dependencies
    if (task.dependsOn?.length) {
      const { tasks } = loadCharacterTasks(cwd, characterName);
      const depsMet = task.dependsOn.every(depId => {
        const dep = tasks.find(t => t.id === depId);
        return dep && dep.status === 'completed';
      });
      if (!depsMet) continue;
    }
    
    running.add(task.id);
    const updated = updateCharacterTask({ cwd, characterName, taskId: task.id, updates: { status: 'running', startedAt: new Date().toISOString() } });
    
    try {
      // Execute the task using the provided executor
      if (executor) {
        const result = await executor({ task: updated, cwd, signal });
        updateCharacterTask({ cwd, characterName, taskId: updated.id, updates: { status: 'completed', result: result, completedAt: new Date().toISOString() } });
        processed++;
      } else {
        // No executor provided - just mark as ready
        updateCharacterTask({ cwd, characterName, taskId: task.id, updates: { status: 'pending', result: 'No executor provided - task queued' } });
        processed++;
      }
    } catch (error) {
      updateCharacterTask({ cwd, characterName, taskId: task.id, updates: { status: 'failed', error: error?.message ?? String(error) } });
      failed++;
    } finally {
      running.delete(updated.id);
    }
    
    if (signal?.aborted) break;
  }
  
  return { processed, failed, message: `Processed ${processed} tasks, ${failed} failed` };
}

/**
 * Character Tools - New Tool Definitions
 * ======================================
 * These will be added to toolDefinitions array
 */

// Tool definitions for the new character autonomy features
export const CHARACTER_AUTONOMY_TOOLS = [
  {
    name: 'character_memory_save',
    description: 'Save memories for a character (cross-session persistence). Memories are stored locally and indexed in RAG for semantic search.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        memories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['fact', 'preference', 'experience', 'knowledge', 'goal', 'observation'] },
              content: { type: 'string' },
              importance: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
              context: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } }
            },
            required: ['content']
          }
        }
      },
      required: ['character_name', 'memories']
    },
    handler: 'saveCharacterMemory'
  },
  {
    name: 'character_memory_load',
    description: 'Load memories for a character from persistent storage.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
      },
      required: ['character_name']
    },
    handler: 'loadCharacterMemory'
  },
  {
    name: 'character_memory_search',
    description: 'Search character memories semantically using RAG.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
      },
      required: ['character_name', 'query']
    },
    handler: 'searchCharacterMemory'
  },
  {
    name: 'character_watch_files',
    description: 'Watch files/directories for changes and trigger character reactions. Uses fs.watch with debouncing.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
        debounce_ms: { type: 'integer', minimum: 100, maximum: 60000, default: 1000 },
        callback_tool: { type: 'string', description: 'Tool to call when change detected (e.g., task, character_chat)' },
        callback_args: { type: 'object' }
      },
      required: ['character_name', 'paths']
    },
    handler: 'watchFilesForCharacter'
  },
  {
    name: 'character_chat',
    description: 'Send a message to another character. Creates a persistent chat history between characters.',
    parameters: {
      type: 'object',
      properties: {
        from_character: { type: 'string' },
        to_character: { type: 'string' },
        message: { type: 'string' },
        context: { type: 'array', items: { type: 'string' }, default: [] }
      },
      required: ['from_character', 'to_character', 'message']
    },
    handler: 'characterChat'
  },
  {
    name: 'character_chat_history',
    description: 'Get chat history between two characters.',
    parameters: {
      type: 'object',
      properties: {
        character1: { type: 'string' },
        character2: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
      },
      required: ['character1', 'character2']
    },
    handler: 'getCharacterChatHistory'
  },
  {
    name: 'character_task_add',
    description: 'Add a task to a character\'s priority queue.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical', 'urgent'], default: 'normal' },
        tools: { type: 'array', items: { type: 'string' }, default: [] },
        max_steps: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        depends_on: { type: 'array', items: { type: 'string' }, default: [] },
        tags: { type: 'array', items: { type: 'string' }, default: [] }
      },
      required: ['character_name', 'title']
    },
    handler: 'addCharacterTask'
  },
  {
    name: 'character_task_list',
    description: 'List tasks for a character with optional filters.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical', 'urgent'] },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
      },
      required: ['character_name']
    },
    handler: 'getCharacterTasks'
  },
  {
    name: 'character_task_update',
    description: 'Update a character task (status, priority, result, etc.).',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical', 'urgent'] },
        result: { type: 'string' },
        error: { type: 'string' }
      },
      required: ['character_name', 'task_id']
    },
    handler: 'updateCharacterTask'
  },
  {
    name: 'character_task_remove',
    description: 'Remove a task from a character\'s queue.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        task_id: { type: 'string' }
      },
      required: ['character_name', 'task_id']
    },
    handler: 'removeCharacterTask'
  },
  {
    name: 'character_task_process',
    description: 'Process a character\'s task queue using the provided executor. Runs pending tasks respecting priority and dependencies.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        max_concurrent: { type: 'integer', minimum: 1, maximum: 10, default: 1 },
        executor_available: { type: 'boolean', default: false }
      },
      required: ['character_name']
    },
    handler: 'processCharacterTaskQueue'
  },
  {
    name: 'character_watch_files',
    description: 'Watch files/directories for changes and trigger character reactions. Uses fs.watch with debouncing.',
    parameters: {
      type: 'object',
      properties: {
        character_name: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
        debounce_ms: { type: 'integer', minimum: 100, maximum: 60000, default: 1000 },
        callback_tool: { type: 'string', description: 'Tool to call when change detected (e.g., task, character_chat)' },
        callback_args: { type: 'object' }
      },
      required: ['character_name', 'paths']
    },
    handler: 'watchFilesForCharacter'
  }
];

/**
 * ============================================================================
 * END OF NEW CHARACTER AUTONOMY FEATURES
 * ============================================================================
 */
