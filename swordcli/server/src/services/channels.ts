/**
 * Channel connections — deliver SwordCLI output to Telegram, Discord, Slack or a
 * generic webhook, addressed with OpenClaw-style session keys.
 *
 * A "connection" is a saved destination: a platform, an agent id, and a target
 * (a Telegram chat id, or a webhook URL). Telegram additionally needs a bot token.
 * Secrets live in server/data/channels.json at mode 0600 and are NEVER returned by
 * the API — read responses carry a boolean `hasSecret` instead, so a token cannot
 * leak through the dashboard or a logs dump.
 *
 * Session keys follow OpenClaw's `agent:<agentId>:<platform>:<kind>:<target>`
 * shape, so a destination can be addressed the same way from the CLI or a relay.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type Platform = 'telegram' | 'discord' | 'slack' | 'webhook';
export const PLATFORMS: readonly Platform[] = ['telegram', 'discord', 'slack', 'webhook'];

/** Target kind per platform, used to build the OpenClaw session key. */
const KIND: Record<Platform, string> = { telegram: 'chat', discord: 'channel', slack: 'channel', webhook: 'hook' };

export interface ChannelConnection {
  id: string;
  platform: Platform;
  label: string;
  agentId: string;
  target: string;
  secret?: string;
  createdAt: string;
  updatedAt: string;
}

/** The shape returned over HTTP: everything above except the secret. */
export interface ChannelView {
  id: string;
  platform: Platform;
  label: string;
  agentId: string;
  target: string;
  hasSecret: boolean;
  session: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelInput {
  id?: string;
  platform: Platform;
  label?: string;
  agentId?: string;
  target: string;
  secret?: string;
}

interface Config {
  connections: ChannelConnection[];
}

export function storePath(): string {
  return process.env.CHANNELS_FILE || path.resolve(__dirname, '../../data/channels.json');
}

function loadConfig(): Config {
  const file = storePath();
  if (!fs.existsSync(file)) return { connections: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Config>;
    const connections = Array.isArray(parsed.connections)
      ? parsed.connections.filter(c => Boolean(c?.id && c?.platform && c?.target))
      : [];
    return { connections };
  } catch {
    return { connections: [] };
  }
}

function saveConfig(config: Config): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 0600: the file can hold a bot token, so it must not be world-readable.
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/** OpenClaw-style addressing: agent:<agentId>:<platform>:<kind>:<target>. */
export function sessionKey(conn: Pick<ChannelConnection, 'agentId' | 'platform' | 'target'>): string {
  return `agent:${conn.agentId}:${conn.platform}:${KIND[conn.platform]}:${conn.target}`;
}

/** Strip the secret before anything leaves the process. */
export function toView(conn: ChannelConnection): ChannelView {
  const { secret, ...rest } = conn;
  return { ...rest, hasSecret: Boolean(secret), session: sessionKey(conn) };
}

// ---- validation -------------------------------------------------------------

// Loopback / link-local / RFC1918 hosts. A user-supplied webhook URL must not be
// able to make this server probe its own network (the classic SSRF pivot).
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|::1$|\[::1\]$|172\.(1[6-9]|2\d|3[01])\.)/i;
const TELEGRAM_CHAT = /^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/;
const AGENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('target must be a valid URL'); }
  if (url.protocol !== 'https:') throw new Error('target URL must use https');
  if (PRIVATE_HOST.test(url.hostname)) throw new Error('target URL must not point at a private or loopback host');
  return url;
}

/** Validate and normalise an incoming connection, filling defaults. */
export function sanitizeConnection(input: ChannelInput): Omit<ChannelConnection, 'createdAt' | 'updatedAt'> {
  const platform = input.platform;
  if (!PLATFORMS.includes(platform)) throw new Error(`platform must be one of ${PLATFORMS.join(', ')}`);
  const target = String(input.target ?? '').trim();
  if (!target) throw new Error('target is required');
  const agentId = (input.agentId && input.agentId.trim()) || 'main';
  if (!AGENT_ID.test(agentId)) throw new Error('agentId may contain letters, digits, "_" and "-" only');
  const secret = input.secret?.trim() || undefined;

  if (platform === 'telegram') {
    if (!TELEGRAM_CHAT.test(target)) throw new Error('Telegram target must be a numeric chat id or an @username');
  } else {
    assertPublicHttpsUrl(target);
    if (secret) throw new Error(`${platform} webhooks carry their credential in the URL; leave the token empty`);
  }

  return { id: input.id?.trim() || randomUUID(), platform, label: (input.label?.trim() || `${platform} ${target}`).slice(0, 80), agentId, target, secret };
}

// ---- adapters ---------------------------------------------------------------

const TELEGRAM_API = 'https://api.telegram.org';
const TIMEOUT_MS = 10_000;

export interface DeliveryResult {
  ok: boolean;
  detail: string;
  messageId?: string;
}

async function telegramCall(token: string, method: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null) as { ok?: boolean; description?: string; result?: any } | null;
  if (!res.ok || body?.ok === false) {
    // `description` is Telegram's own human-readable reason; fall back to the code.
    throw new Error(body?.description || `Telegram HTTP ${res.status}`);
  }
  return body?.result;
}

async function webhookPost(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function verifyConnection(conn: ChannelConnection): Promise<DeliveryResult> {
  try {
    if (conn.platform === 'telegram') {
      const me = await telegramCall(conn.secret as string, 'getMe', {});
      return { ok: true, detail: `Bot @${me?.username ?? 'unknown'} is reachable` };
    }
    const url = assertPublicHttpsUrl(conn.target);
    if (conn.platform === 'discord') {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Discord HTTP ${res.status}`);
      const hook = await res.json().catch(() => null) as { name?: string } | null;
      return { ok: true, detail: `Webhook "${hook?.name ?? 'ok'}" is reachable` };
    }
    // Slack / generic webhooks have no safe read-only probe: posting to verify
    // would send a real message, so verification is shape-only and says so.
    return { ok: true, detail: 'URL is well-formed; a real post is the only live check' };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}

export async function deliver(conn: ChannelConnection, text: string): Promise<DeliveryResult> {
  const message = String(text ?? '').trim();
  if (!message) throw new Error('text is required');
  if (message.length > 4096 * 4) throw new Error('text is too long; keep it under ~16 KB');

  if (conn.platform === 'telegram') {
    const result = await telegramCall(conn.secret as string, 'sendMessage', {
      chat_id: conn.target, text: message, disable_web_page_preview: true,
    });
    return { ok: true, detail: 'sent', messageId: String(result?.message_id ?? '') };
  }

  const url = assertPublicHttpsUrl(conn.target);
  const payload = conn.platform === 'slack' ? { text: message } : conn.platform === 'discord' ? { content: message } : { text: message, session: sessionKey(conn) };
  const res = await webhookPost(url.toString(), payload);
  if (!res.ok) throw new Error(`${conn.platform} webhook HTTP ${res.status}`);
  return { ok: true, detail: 'sent' };
}

// ---- store ------------------------------------------------------------------

export function listChannels(): ChannelView[] {
  return loadConfig().connections.map(toView);
}

/** Full record including the secret — internal use only; never serialise this. */
export function getChannel(id: string): ChannelConnection | undefined {
  return loadConfig().connections.find(c => c.id === id);
}

/**
 * Create or update a connection. Updating keeps the existing secret when the
 * request omits one, so a client can edit a label without re-pasting the token.
 */
export function saveChannel(input: ChannelInput): ChannelView {
  const config = loadConfig();
  const now = new Date().toISOString();
  const clean = sanitizeConnection(input);
  const existing = config.connections.find(c => c.id === clean.id);

  const record: ChannelConnection = {
    ...clean,
    secret: clean.secret ?? existing?.secret,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!record.secret && record.platform === 'telegram') throw new Error('Telegram requires a bot token');

  const connections = existing
    ? config.connections.map(c => (c.id === record.id ? record : c))
    : [...config.connections, record];
  saveConfig({ connections });
  return toView(record);
}

export function removeChannel(id: string): boolean {
  const config = loadConfig();
  const connections = config.connections.filter(c => c.id !== id);
  if (connections.length === config.connections.length) return false;
  saveConfig({ connections });
  return true;
}

export async function verifyChannel(id: string): Promise<DeliveryResult> {
  const conn = getChannel(id);
  if (!conn) throw new Error('connection not found');
  return verifyConnection(conn);
}

export async function sendChannel(id: string, text: string): Promise<DeliveryResult> {
  const conn = getChannel(id);
  if (!conn) throw new Error('connection not found');
  return deliver(conn, text);
}