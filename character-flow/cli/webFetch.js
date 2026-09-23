// Read-only web tooling for SwordCLI.
//
// Two transports, deliberately separate:
//   fetchWeb          Node fetch + HTML→Markdown. Fast, no browser, the default.
//   fetchWebRendered  Shell out to scraper/render_page.py (Camoufox) for pages that
//                     only exist after JavaScript runs or that block plain HTTP.
//
// Both go through assertPublicUrl so a prompt-injected or model-chosen URL cannot
// reach loopback, link-local (169.254.169.254 cloud metadata), private ranges or
// internal DNS. This mirrors scraper/security_utils.py, which re-checks server-side.
import { promises as dns } from 'node:dns';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCRAPER_DIR = join(HERE, '..', 'scraper');
export const RENDER_SCRIPT = join(SCRAPER_DIR, 'render_page.py');

const MAX_BODY = 1_000_000;
const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2048;
const TEXT_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown', 'application/xml', 'text/xml', 'application/json'];
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const INTERNAL_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];

/** True when an IPv4/IPv6 literal is routable on the public internet. */
export function isPublicAddress(address) {
  const version = isIP(String(address || ''));
  if (version === 4) {
    const [a, b] = String(address).split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;            // unspecified, private, loopback
    if (a === 172 && b >= 16 && b <= 31) return false;             // private
    if (a === 192 && b === 168) return false;                      // private
    if (a === 169 && b === 254) return false;                      // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return false;            // CGNAT
    if (a >= 224) return false;                                    // multicast / reserved / broadcast
    return true;
  }
  if (version === 6) {
    const value = String(address).toLowerCase();
    if (value === '::' || value === '::1') return false;                 // unspecified, loopback
    if (/^f[cd][0-9a-f]{2}:/.test(value)) return false;                  // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(value)) return false;                  // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(value)) return false;                     // multicast
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);                       // IPv4-mapped
    if (/^(2001:db8|2002|3fff)/.test(value)) return false;               // documentation, 6to4, reserved
    return true;
  }
  return false;
}

/**
 * Validate a URL and every address its host resolves to.
 * `lookup` is injectable so unit tests never touch real DNS.
 */
export async function assertPublicUrl(rawUrl, { lookup = dns.lookup } = {}) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw new Error('URL must be a non-empty string');
  if (rawUrl.length > MAX_URL_LENGTH) throw new Error('URL is too long');
  let url;
  try { url = new URL(rawUrl.trim()); } catch { throw new Error('Invalid URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Unsupported URL scheme: ${url.protocol}`);
  if (url.username || url.password) throw new Error('URL must not contain credentials');
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host) throw new Error('URL must include a host');
  if (INTERNAL_SUFFIXES.some(suffix => host.endsWith(suffix))) throw new Error(`Blocked internal host: ${host}`);
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error(`Blocked non-public address: ${host}`);
    return url;
  }
  let records;
  try { records = await lookup(host, { all: true }); }
  catch (error) { throw new Error(`Could not resolve host ${host}: ${error.message}`); }
  const addresses = (Array.isArray(records) ? records : [records]).map(record => record?.address).filter(Boolean);
  if (!addresses.length) throw new Error(`Host ${host} did not resolve`);
  for (const address of addresses) {
    if (!isPublicAddress(address)) throw new Error(`Blocked host ${host}: resolves to non-public address ${address}`);
  }
  return url;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', middot: '·', laquo: '«', raquo: '»' };

export function decodeEntities(value) {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const BLOCK = 'p|div|section|article|header|footer|main|aside|ul|ol|table|tr|blockquote|figure|figcaption|dl|dt|dd|form';
const SKIP = 'script|style|noscript|svg|template|iframe|object|embed|video|audio';

/** Convert an HTML document to compact Markdown without a DOM dependency. */
export function htmlToMarkdown(html) {
  if (typeof html !== 'string') throw new Error('HTML must be a string');
  const blocks = [];
  let text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(new RegExp(`<(${SKIP})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_match, inner) => {
      blocks.push(decodeEntities(inner.replace(/<[^>]+>/g, '')).trim());
      return `\u0000CODE${blocks.length - 1}\u0000`;
    })
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, '');
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
    .replace(/<h([1-6])[^>]*>/gi, (_match, level) => `\n\n${'#'.repeat(Number(level))} `)
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '')
    .replace(new RegExp(`<(${BLOCK})[^>]*>`, 'gi'), '\n\n')
    .replace(new RegExp(`<\\/(${BLOCK})\\s*>`, 'gi'), '\n\n')
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_match, _tag, inner) => `**${inner.replace(/<[^>]+>/g, '').trim()}**`)
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_match, _tag, inner) => `*${inner.replace(/<[^>]+>/g, '').trim()}*`)
    .replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_match, href, inner) => `[${inner.replace(/<[^>]+>/g, '').trim()}](${href})`)
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, (_match, alt, src) => `![${alt}](${src})`)
    .replace(/<img\b[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, (_match, src) => `![](${src})`)
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text)
    .replace(/\u0000CODE(\d+)\u0000/g, (_match, index) => `\n\n\`\`\`\n${blocks[Number(index)]}\n\`\`\`\n\n`)
    .replace(/\u0000/g, '');
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function extractTitle(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim().slice(0, 300) : '';
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

async function readBounded(response, max) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= max) { await reader.cancel().catch(() => {}); break; }
  }
  const output = new Uint8Array(Math.min(size, max));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= output.length) break;
    output.set(chunk.subarray(0, output.length - offset), offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Fetch a public page over plain HTTP and return readable Markdown.
 * `lookup` and `fetchImpl` are injectable for tests.
 */
export async function fetchWeb(url, { maxChars = 12000, timeoutMs = 20000, lookup, signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available in this runtime');
  const limit = clampInt(maxChars, 1, 200000, 12000);
  const timeout = clampInt(timeoutMs, 1000, 120000, 20000);
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  let target = await assertPublicUrl(url, { lookup });
  let response;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetchImpl(target.href, {
      redirect: 'manual',
      signal: deadline,
      headers: {
        'User-Agent': 'SwordCLI/1.0 (read-only page fetch)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'
      }
    });
    if (!REDIRECT_STATUS.has(response.status)) break;
    const location = response.headers.get('location');
    if (!location) throw new Error(`Redirect without a location from ${target.href}`);
    await response.body?.cancel?.().catch(() => {});
    if (hop === MAX_REDIRECTS) throw new Error('Too many redirects');
    target = await assertPublicUrl(new URL(location, target.href).href, { lookup });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${target.href}`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const textual = !contentType || TEXT_TYPES.includes(contentType) || contentType.endsWith('+xml') || contentType.endsWith('+json');
  if (!textual) throw new Error(`Unsupported content type: ${contentType}`);
  const raw = new TextDecoder('utf-8').decode(await readBounded(response, MAX_BODY));
  const markdown = contentType.includes('json') ? raw : htmlToMarkdown(raw);
  return {
    url: target.href,
    status: response.status,
    contentType: contentType || 'text/html',
    title: extractTitle(raw),
    markdown: markdown.slice(0, limit),
    chars: markdown.length,
    truncated: markdown.length > limit
  };
}

/** Ordered interpreter candidates for the Camoufox renderer. */
export function browserPythonCandidates(env = process.env) {
  return [
    env.SWORD_BROWSER_PYTHON,
    join(SCRAPER_DIR, 'venv', 'bin', 'python'),
    join(SCRAPER_DIR, 'venv', 'Scripts', 'python.exe'),
    env.SWORD_PYTHON || 'python3'
  ].filter(Boolean);
}

/** First interpreter that exists; a bare `python3` is trusted to be on PATH. */
export function resolveBrowserPython({ env = process.env, exists = existsSync } = {}) {
  for (const candidate of browserPythonCandidates(env)) {
    if (!candidate.includes('/') && !candidate.includes('\\')) return candidate;
    if (exists(candidate)) return candidate;
  }
  return null;
}

function runProcess(command, args, { timeoutMs, signal, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: env.PATH || '/usr/bin:/bin',
        HOME: env.HOME || '',
        LANG: env.LANG || 'C.UTF-8',
        TERM: 'dumb',
        ...(env.XDG_CACHE_HOME ? { XDG_CACHE_HOME: env.XDG_CACHE_HOME } : {})
      }
    });
    let stdout = '', stderr = '', timedOut = false;
    const stop = () => { try { child.kill('SIGKILL'); } catch { /* already gone */ } };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.stdout.on('data', data => { if (stdout.length < MAX_BODY) stdout = (stdout + data).slice(0, MAX_BODY); });
    child.stderr.on('data', data => { if (stderr.length < 4000) stderr = (stderr + data).slice(0, 4000); });
    child.on('error', error => { cleanup(); reject(new Error(`Cannot start browser runtime: ${error.message}`)); });
    child.on('close', code => { cleanup(); resolve({ code, stdout, stderr, timedOut }); });
  });
}

/** The renderer may log before its JSON line; take the last valid result object. */
function parseLastJson(text) {
  const lines = String(text).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object' && 'ok' in value) return value;
    } catch { /* keep scanning earlier lines */ }
  }
  return null;
}

/**
 * Render a JavaScript-heavy public page with Camoufox (via scraper/render_page.py)
 * and return Markdown. Slower than fetchWeb by design; opt-in only.
 */
export async function fetchWebRendered(url, {
  maxChars = 12000, timeoutMs = 90000, waitMs = 1200, signal, lookup,
  python, script = RENDER_SCRIPT, env = process.env, exists
} = {}) {
  const limit = clampInt(maxChars, 1, 200000, 12000);
  const timeout = clampInt(timeoutMs, 5000, 300000, 90000);
  const target = await assertPublicUrl(url, { lookup });
  const interpreter = python || resolveBrowserPython({ env, exists });
  if (!interpreter) throw new Error('No Python interpreter found for Camoufox. Set SWORD_BROWSER_PYTHON, create scraper/venv, or use fetch_web instead.');
  const args = [
    script, target.href,
    '--max-chars', String(limit),
    '--timeout', String(Math.max(5, Math.round(timeout / 1000))),
    '--wait-ms', String(clampInt(waitMs, 0, 30000, 1200))
  ];
  const { stdout, stderr, timedOut } = await runProcess(interpreter, args, { timeoutMs: timeout, signal, env });
  if (timedOut) throw new Error(`Camoufox render timed out after ${Math.round(timeout / 1000)} s`);
  const payload = parseLastJson(stdout);
  if (!payload) throw new Error(`Camoufox renderer produced no JSON${stderr ? `: ${stderr.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
  if (!payload.ok) throw new Error(payload.error || 'Camoufox render failed');
  const markdown = String(payload.markdown || '').slice(0, limit);
  return {
    url: payload.url || target.href,
    title: payload.title || '',
    backend: payload.backend || 'camoufox',
    markdown,
    chars: Number.isFinite(payload.chars) ? payload.chars : markdown.length,
    truncated: Boolean(payload.truncated)
  };
}