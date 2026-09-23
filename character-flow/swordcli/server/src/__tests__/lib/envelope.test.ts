import { sendOk, sendError } from '../../lib/envelope.js';
import type { Response } from 'express';

// Minimal mock of express Response — we only use status().json().
function mockRes() {
  const out = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { out.statusCode = code; return out; },
    json(payload: unknown) { out.body = payload; return out; },
  };
  return out as unknown as Response & { statusCode: number; body: any };
}

describe('response envelope helpers', () => {
  it('sendOk wraps payload with success + data while preserving legacy top-level keys', () => {
    const res = mockRes();
    sendOk(res, { roles: [1, 2], assignments: {} });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    // legacy keys stay at the top level so existing HTML clients keep working
    expect(res.body.roles).toEqual([1, 2]);
    expect(res.body.assignments).toEqual({});
    // and the same payload is mirrored under `data` for schema-first consumers
    expect(res.body.data).toEqual({ roles: [1, 2], assignments: {} });
  });

  it('sendOk honours a custom status code', () => {
    const res = mockRes();
    sendOk(res, { created: true }, 201);
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(true);
  });

  it('sendError emits success:false with error, hint and retryable', () => {
    const res = mockRes();
    sendError(res, 400, 'Missing query', { hint: 'POST { query: string }', retryable: true });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Missing query');
    expect(res.body.hint).toBe('POST { query: string }');
    expect(res.body.retryable).toBe(true);
  });

  it('sendError defaults retryable to false and omits hint when absent', () => {
    const res = mockRes();
    sendError(res, 404, 'Document not found');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.retryable).toBe(false);
    expect('hint' in res.body).toBe(false);
  });
});
