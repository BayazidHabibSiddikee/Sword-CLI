// Route-level tests for /api/usage. Mounted on a bare Express app so the test needs
// neither the database nor the provider stack. The route reads <SWORD_USAGE_DIR>/
// .sword/usage.jsonl, so each test points SWORD_USAGE_DIR at a temp fixture.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { usageRouter } from '../../routes/usage.js';

let server: Server;
let base: string;
let dir: string;

function writeUsage(lines: unknown[]): void {
  fs.mkdirSync(path.join(dir, '.sword'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.sword', 'usage.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
}

beforeAll(async () => {
  const app = express();
  app.use('/api/usage', usageRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}/api/usage`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-route-'));
  process.env.SWORD_USAGE_DIR = dir;
});

afterEach(() => {
  delete process.env.SWORD_USAGE_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/usage', () => {
  it('returns empty totals when no usage file exists', async () => {
    const res = await fetch(base);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toMatchObject({ turns: 0, tokens_in: 0, tokens_out: 0, tokens: 0 });
    expect(body.rows).toEqual([]);
  });

  it('aggregates rows and echoes only the whitelisted fields', async () => {
    writeUsage([
      { ts: '2026-01-01T00:00:00.000Z', model: 'm1', provider: 'g4f', tokens_in: 10, tokens_out: 5, duration_ms: 100, estimated: true, secret: 'LEAK' },
      { ts: '2026-01-01T00:01:00.000Z', model: 'm1', provider: 'g4f', tokens_in: 20, tokens_out: 8, cost_usd: 0.002, duration_ms: 200, estimated: false },
    ]);
    const res = await fetch(base);
    const body = await res.json();
    expect(body.totals).toMatchObject({ turns: 2, tokens_in: 30, tokens_out: 13, tokens: 43, duration_ms: 300 });
    expect(body.rows).toHaveLength(2);
    // Whitelist: an unexpected key in the file never reaches the response.
    expect(body.rows[0]).not.toHaveProperty('secret');
    expect(body.rows[0]).toMatchObject({ model: 'm1', provider: 'g4f', tokens_in: 10, tokens_out: 5 });
  });

  it('skips a truncated final line instead of failing', async () => {
    const file = path.join(dir, '.sword', 'usage.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ ts: 'x', model: 'm', tokens_in: 1, tokens_out: 1 })}\n{"ts":"partial`);
    const res = await fetch(base);
    const body = await res.json();
    expect(body.totals.turns).toBe(1);
  });
});
