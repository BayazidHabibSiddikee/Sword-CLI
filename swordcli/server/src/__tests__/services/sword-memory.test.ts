import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, initDb } from '../../db/index.js';
import {
  ensureSwordSchema, createSwordSession, listSwordSessions, getSwordSession,
  saveSwordMessages, deleteSwordSession, searchSwordMemory, getSwordMemory, buildSwordContext,
} from '../../services/sword-memory.js';

const create = (workdir = '/project') => createSwordSession({ title: 'Work', workdir, mode: 'coding' });
beforeEach(() => { initDb(':memory:'); });
afterEach(() => { getDb().close(); });

describe('Sword shared sessions', () => {
  it('creates schema lazily and preserves complete OpenAI history', () => {
    expect(getDb().prepare("SELECT name FROM sqlite_master WHERE name = 'sword_sessions'").get()).toBeUndefined();
    ensureSwordSchema();
    ensureSwordSchema();
    const session = create();
    expect(session).toMatchObject({ revision: 0, messages: [], model: null });
    expect(session.id).toMatch(/^[a-f0-9-]{36}$/);
    const messages = [
      { role: 'system', content: 'internal prompt' },
      { role: 'user', content: [{ type: 'text', text: 'Please fix login' }] },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call1', type: 'function', function: { name: 'test', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call1', content: 'Tests pass: orchidmarker' },
    ];
    expect(saveSwordMessages(session.id, messages, 0).revision).toBe(1);
    expect(getSwordSession(session.id).messages).toEqual(messages);
    expect(listSwordSessions()[0]).not.toHaveProperty('messages');
    expect(searchSwordMemory('orchidmarker', { workdir: '/project' })[0]).toMatchObject({ sessionId: session.id, messageIndex: 3, role: 'tool' });
  });

  it('rejects stale revisions without changing history or index', () => {
    const s = create();
    saveSwordMessages(s.id, [{ role: 'user', content: 'originalmarker' }], 0);
    expect(() => saveSwordMessages(s.id, [{ role: 'user', content: 'badmarker' }], 0)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    expect(searchSwordMemory('badmarker', { workdir: '/project' })).toEqual([]);
    expect(getSwordSession(s.id).revision).toBe(1);
    expect(() => getSwordSession('missing')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => saveSwordMessages('missing', [], 0)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('replaces indexes without duplicates and removes deleted memory', () => {
    const s = create();
    const messages = [{ role: 'user', content: 'oldmarker' }];
    saveSwordMessages(s.id, messages, 0);
    saveSwordMessages(s.id, messages, 1);
    expect(searchSwordMemory('oldmarker', { workdir: '/project' })).toHaveLength(1);
    saveSwordMessages(s.id, [{ role: 'assistant', content: 'newmarker' }], 2);
    expect(searchSwordMemory('oldmarker', { workdir: '/project' })).toEqual([]);
    expect(deleteSwordSession(s.id)).toBe(true);
    expect(searchSwordMemory('newmarker', { workdir: '/project' })).toEqual([]);
    expect(listSwordSessions()).toEqual([]);
  });

  it('validates inputs and rejects oversized histories without truncation', () => {
    const s = create();
    expect(() => createSwordSession({ title: '', workdir: '/p', mode: 'coding' })).toThrow();
    expect(() => createSwordSession({ title: 'x', workdir: '/p', mode: 'invalid' as never })).toThrow();
    for (const invalid of [[{ role: 'invalid', content: 'x' }], [{ role: 'user', content: 42 }], null]) {
      expect(() => saveSwordMessages(s.id, invalid as never, 0)).toThrow();
    }
    expect(() => saveSwordMessages(s.id, [], -1)).toThrow();
    expect(() => saveSwordMessages(s.id, [{ role: 'user', content: 'é'.repeat(600_000) }], 0)).toThrow();
    const history = [{ role: 'user', content: 'x'.repeat(900_000) }];
    saveSwordMessages(s.id, history, 0);
    expect(getSwordSession(s.id).messages).toEqual(history);
  });
});


describe('Sword lexical memory', () => {
  it('recalls old sessions, handles literal queries, and isolates exact workdirs', () => {
    const old = create();
    saveSwordMessages(old.id, [{ role: 'user', content: 'kubernetes ingress quotes' }], 0);
    const current = create();
    const other = create('/project/');
    saveSwordMessages(other.id, [{ role: 'assistant', content: 'privateother kubernetes' }], 0);
    expect(searchSwordMemory('kubernetes', { workdir: '/project' })).toHaveLength(1);
    expect(searchSwordMemory('kubernetes', { workdir: '/project', sessionId: current.id })).toEqual([]);
    expect(buildSwordContext(current.id, 'kubernetes')).toContain(old.id);
    expect(getSwordMemory(current.id).globalSummary).not.toContain('privateother');
    for (const query of ['" OR 1=1 --', 'NEAR(* * *', 'a" AND b', '*', '???', "'; DROP TABLE sword_sessions; --", '']) {
      expect(() => searchSwordMemory(query, { workdir: '/project' })).not.toThrow();
    }
    expect(() => searchSwordMemory('x'.repeat(201), { workdir: '/project' })).toThrow();
    expect(() => searchSwordMemory('x', { workdir: '/project', limit: 0 })).toThrow();
  });

  it('caps retrieval and summaries, retains latest context, and labels outcomes', () => {
    const s = create();
    saveSwordMessages(s.id, Array.from({ length: 202 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user', content: `needle Message${i} ${'details '.repeat(80)}`,
    })), 0);
    expect(searchSwordMemory('needle', { workdir: '/project' })).toHaveLength(5);
    expect(searchSwordMemory('needle', { workdir: '/project', limit: 2 })).toHaveLength(2);
    expect(searchSwordMemory('needle', { workdir: '/project', limit: 99 })).toHaveLength(5);
    const memory = getSwordMemory(s.id);
    expect(memory).toMatchObject({ sessionLines: 100, globalLines: 50 });
    expect(memory.sessionSummary.length).toBeLessThanOrEqual(12000);
    expect(memory.sessionSummary.split('\n').length).toBeLessThanOrEqual(100);
    expect(memory.sessionSummary).toContain('Message201');
    expect(memory.globalSummary.length).toBeLessThanOrEqual(6000);
    expect(memory.globalSummary.split('\n').length).toBeLessThanOrEqual(50);
    expect(memory.globalSummary).toContain(s.id);
    expect(buildSwordContext(s.id, 'needle').length).toBeLessThanOrEqual(14000);
  });

  it('excludes prompts and redacts recognizable credentials from derived memory', () => {
    const s = create();
    saveSwordMessages(s.id, [
      { role: 'system', content: 'systemmarker' },
      { role: 'developer', content: 'developermarker' },
      { role: 'user', content: 'credential Bearer exampleToken123 and api_key=exampleSecret456' },
      { role: 'assistant', content: 'credential sk-exampleabcdefghijklmnop' },
    ], 0);
    expect(searchSwordMemory('systemmarker developermarker', { workdir: '/project' })).toEqual([]);
    const derived = JSON.stringify([getSwordMemory(s.id), searchSwordMemory('credential', { workdir: '/project' }), buildSwordContext(s.id, 'credential')]);
    for (const secret of ['exampleToken123', 'exampleSecret456', 'sk-exampleabcdefghijklmnop', 'systemmarker', 'developermarker']) expect(derived).not.toContain(secret);
    expect(derived).toContain('[REDACTED]');
  });
});
