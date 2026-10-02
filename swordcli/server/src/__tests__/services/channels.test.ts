import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sanitizeConnection, sessionKey, toView, listChannels, saveChannel,
  removeChannel, sendChannel, verifyChannel,
} from '../../services/channels.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chan-svc-'));
  process.env.CHANNELS_FILE = path.join(dir, 'channels.json');
});

afterEach(() => {
  delete process.env.CHANNELS_FILE;
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function stubTelegram(result: Record<string, unknown>, status = 200, ok = true) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ ok, result }), { status, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}

describe('channel session keys', () => {
  it('builds an OpenClaw-style session key per platform', () => {
    expect(sessionKey({ agentId: 'main', platform: 'telegram', target: '123456' })).toBe('agent:main:telegram:chat:123456');
    expect(sessionKey({ agentId: 'ops', platform: 'discord', target: 'https://discord.com/api/webhooks/x' })).toBe('agent:ops:discord:channel:https://discord.com/api/webhooks/x');
  });
});

describe('connection validation', () => {
  it('requires a token for telegram', () => {
    // A create needs a token; the requirement is enforced in saveChannel so an
    // update that omits the token can reuse the stored one.
    expect(() => saveChannel({ platform: 'telegram', target: '123' })).toThrow(/bot token/);
  });

  it('accepts a numeric chat id and defaults the agent id', () => {
    const conn = sanitizeConnection({ platform: 'telegram', target: '12345', secret: 'tok' });
    expect(conn.agentId).toBe('main');
    expect(sessionKey(conn)).toBe('agent:main:telegram:chat:12345');
  });

  it('rejects a non-https webhook', () => {
    expect(() => sanitizeConnection({ platform: 'slack', target: 'http://example.com/hook' })).toThrow(/https/);
  });

  it('rejects a private or loopback webhook host (SSRF guard)', () => {
    expect(() => sanitizeConnection({ platform: 'webhook', target: 'https://127.0.0.1/hook' })).toThrow(/private or loopback/);
    expect(() => sanitizeConnection({ platform: 'webhook', target: 'https://192.168.1.10/hook' })).toThrow(/private or loopback/);
  });

  it('rejects a webhook that also carries a token', () => {
    expect(() => sanitizeConnection({ platform: 'discord', target: 'https://discord.com/api/webhooks/a/b', secret: 'oops' })).toThrow(/credential in the URL/);
  });
});

describe('channel store', () => {
  it('never returns the secret and writes the file 0600', () => {
    const view = saveChannel({ platform: 'telegram', target: '777', secret: 'super-secret-token', label: 'Team' });
    expect(view.hasSecret).toBe(true);
    expect(JSON.stringify(view)).not.toContain('super-secret-token');
    expect(JSON.stringify(listChannels())).not.toContain('super-secret-token');
    const mode = fs.statSync(process.env.CHANNELS_FILE as string).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('keeps the existing secret when an update omits it', () => {
    const first = saveChannel({ platform: 'telegram', target: '777', secret: 'tok-1' });
    const updated = saveChannel({ id: first.id, platform: 'telegram', target: '888', label: 'Renamed' });
    expect(updated.label).toBe('Renamed');
    expect(updated.hasSecret).toBe(true);
    expect(updated.session).toBe('agent:main:telegram:chat:888');
  });

  it('deletes a connection and reports a miss', () => {
    const view = saveChannel({ platform: 'telegram', target: '1', secret: 't' });
    expect(removeChannel(view.id)).toBe(true);
    expect(removeChannel(view.id)).toBe(false);
    expect(listChannels()).toHaveLength(0);
  });

  it('toView drops the secret field entirely', () => {
    const conn = sanitizeConnection({ platform: 'telegram', target: '5', secret: 'x' });
    const view = toView({ ...conn, createdAt: 'now', updatedAt: 'now' });
    expect(view).not.toHaveProperty('secret');
  });
});

describe('telegram delivery', () => {
  it('verifies a bot with getMe', async () => {
    const calls = stubTelegram({ username: 'swordbot' });
    const view = saveChannel({ platform: 'telegram', target: '42', secret: 'tok' });
    const result = await verifyChannel(view.id);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('@swordbot');
    expect(calls[0].url).toBe('https://api.telegram.org/bottok/getMe');
  });

  it('sends a message and returns the message id', async () => {
    const calls = stubTelegram({ message_id: 99 });
    const view = saveChannel({ platform: 'telegram', target: '42', secret: 'tok' });
    const result = await sendChannel(view.id, 'hello from SwordCLI');
    expect(result).toMatchObject({ ok: true, messageId: '99' });
    expect(calls[0].url).toBe('https://api.telegram.org/bottok/sendMessage');
    expect(calls[0].body).toMatchObject({ chat_id: '42', text: 'hello from SwordCLI' });
  });

  it("reports Telegram's own error text on failure", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ok: false, description: 'chat not found' }), { status: 400, headers: { 'Content-Type': 'application/json' } },
    )));
    const view = saveChannel({ platform: 'telegram', target: '42', secret: 'tok' });
    await expect(sendChannel(view.id, 'x')).rejects.toThrow(/chat not found/);
  });

  it('refuses an empty message', async () => {
    const view = saveChannel({ platform: 'telegram', target: '42', secret: 'tok' });
    await expect(sendChannel(view.id, '   ')).rejects.toThrow(/text is required/);
  });
});

describe('webhook delivery', () => {
  it('posts Slack-shaped { text } and reports a shape-only verify', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      return new Response('ok', { status: 200 });
    }));
    const view = saveChannel({ platform: 'slack', target: 'https://hooks.slack.com/services/T/B/X' });
    const verified = await verifyChannel(view.id);
    expect(verified.ok).toBe(true);
    await sendChannel(view.id, 'deploy done');
    expect(calls.at(-1)?.body).toEqual({ text: 'deploy done' });
  });
});