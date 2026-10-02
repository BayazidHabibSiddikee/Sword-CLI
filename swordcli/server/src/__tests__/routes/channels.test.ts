// Route-level tests for /api/channels. Mounted on a bare Express app so the test
// does not need the database or provider stack to boot.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { channelsRouter } from '../../routes/channels.js';

let server: Server;
let base: string;
let dir: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/channels', channelsRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}/api/channels`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chan-rt-'));
  process.env.CHANNELS_FILE = path.join(dir, 'channels.json');
});

afterEach(() => {
  delete process.env.CHANNELS_FILE;
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function api(method: string, p: string, body?: unknown) {
  const res = await realFetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Canned Telegram only; localhost requests fall through to the real fetch. */
function stubTelegram() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('https://api.telegram.org')) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 7, username: 'swordbot' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return realFetch(url, init);
  }));
}

describe('POST /api/channels', () => {
  it('saves a Telegram connection and returns an OpenClaw session key without the token', async () => {
    const { status, body } = await api('POST', '/', { platform: 'telegram', target: '123456789', secret: 'BOTTOKEN-abc123', label: 'Team channel' });
    expect(status).toBe(201);
    expect(body.connection.session).toBe('agent:main:telegram:chat:123456789');
    expect(body.connection.hasSecret).toBe(true);
    expect(JSON.stringify(body)).not.toContain('BOTTOKEN-abc123');
  });

  it('rejects an unknown platform', async () => {
    const { status } = await api('POST', '/', { platform: 'myspace', target: 'x' });
    expect(status).toBe(400);
  });

  it('rejects Telegram without a token', async () => {
    const { status, body } = await api('POST', '/', { platform: 'telegram', target: '123' });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/bot token/);
  });
});

describe('GET /api/channels', () => {
  it('lists connections without secrets', async () => {
    await api('POST', '/', { platform: 'telegram', target: '1', secret: 'BOTTOKEN-xyz' });
    const { status, body } = await api('GET', '/');
    expect(status).toBe(200);
    expect(body.connections).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('BOTTOKEN-xyz');
  });
});

describe('POST /api/channels/:id/send', () => {
  it('delivers to Telegram and returns the message id', async () => {
    stubTelegram();
    const created = await api('POST', '/', { platform: 'telegram', target: '555', secret: 'tok' });
    const { status, body } = await api('POST', `/${created.body.connection.id}/send`, { text: 'Build is green.' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, messageId: '7' });
  });

  it('404s for an unknown connection', async () => {
    const { status } = await api('POST', '/does-not-exist/send', { text: 'hi' });
    expect(status).toBe(404);
  });

  it('400s when text is missing', async () => {
    const created = await api('POST', '/', { platform: 'telegram', target: '555', secret: 'tok' });
    const { status } = await api('POST', `/${created.body.connection.id}/send`, {});
    expect(status).toBe(400);
  });
});

describe('DELETE /api/channels/:id', () => {
  it('removes the connection then reports a miss', async () => {
    const created = await api('POST', '/', { platform: 'telegram', target: '9', secret: 'tok' });
    const first = await api('DELETE', `/${created.body.connection.id}`);
    expect(first.status).toBe(200);
    const second = await api('DELETE', `/${created.body.connection.id}`);
    expect(second.status).toBe(404);
  });
});