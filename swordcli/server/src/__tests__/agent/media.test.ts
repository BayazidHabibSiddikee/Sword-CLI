import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, getDb } from '../../db/index.js';
import { catalogForSession, executeToolCall, builtinTools, findTool } from '../../agent/registry.js';
import { characterRoster, resolveCharacter, characterSystemBlock } from '../../agent/characters.js';
import { listCharacterVoices, speak, voiceForCharacter, espeakAvailable } from '../../agent/voice.js';
import type { AgentSessionRow, ToolContext } from '../../agent/types.js';

describe('agent media + persona layers', () => {
  let workdir: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-media-'));
  });

  const mkCtx = (): ToolContext => ({ workdir, shellTimeoutMs: 300_000, signal: new AbortController().signal, voice: 'en-gb' });
  const catalog = () => catalogForSession({ tool_allow: null, tool_deny: '[]' } as Pick<AgentSessionRow, 'tool_allow' | 'tool_deny'>, false);

  it('exposes video_edit and speak as builtin tools', () => {
    const names = builtinTools().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['video_edit', 'speak']));
  });

  it('rejects unknown video ops gracefully', async () => {
    const tool = findTool(catalog(), 'video_edit')!;
    const r = await executeToolCall(tool, JSON.stringify({ op: 'nuclear' }), mkCtx(), 'video_edit');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('Unknown video op');
  });

  it('make_test_video → probe → cut pipeline works on a tmp workdir', async () => {
    const tool = findTool(catalog(), 'video_edit')!;
    const ctx = mkCtx();

    const mk = await executeToolCall(tool, JSON.stringify({ op: 'make_test_video', seconds: 2, width: 320, height: 180, fps: 10 }), ctx, 'video_edit');
    expect(mk.ok).toBe(true);
    expect(fs.existsSync(path.join(workdir, 'test_video.mp4'))).toBe(true);

    const probe = await executeToolCall(tool, JSON.stringify({ op: 'probe', input: 'test_video.mp4' }), ctx, 'video_edit');
    expect(probe.ok).toBe(true);
    expect(probe.text).toContain('duration');

    const cut = await executeToolCall(tool, JSON.stringify({ op: 'cut', input: 'test_video.mp4', in: 0, out: 1, output: 'clip.mp4' }), ctx, 'video_edit');
    expect(cut.ok).toBe(true);
    expect(fs.existsSync(path.join(workdir, 'clip.mp4'))).toBe(true);
  }, 240_000);

  it('confines video outputs to the workdir', async () => {
    const tool = findTool(catalog(), 'video_edit')!;
    const r = await executeToolCall(tool, JSON.stringify({ op: 'cut', input: '../../etc/passwd', in: 0, out: 1, output: '/tmp/escape.mp4' }), mkCtx(), 'video_edit');
    expect(r.ok).toBe(false);
  });

  it('speak generates a wav with the session voice', async () => {
    const tool = findTool(catalog(), 'speak')!;
    const r = await executeToolCall(tool, JSON.stringify({ text: 'Sword CLI is ready', say: false }), mkCtx(), 'speak');
    expect(r.ok).toBe(true);
    const wavPath = r.text.match(/(\S+\.wav)/);
    expect(wavPath?.[1]).toBeDefined();
    const file = path.resolve(workdir, wavPath![1]);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);
  }, 60_000);

  it('speak tool rejects empty text', async () => {
    const tool = findTool(catalog(), 'speak')!;
    const r = await executeToolCall(tool, JSON.stringify({ text: '   ' }), mkCtx(), 'speak');
    expect(r.ok).toBe(false);
  });

  it('loadCharacterVoices + roster joins 10 personas with distinct voices', () => {
    const voices = listCharacterVoices();
    expect(voices).toHaveLength(10);
    const distinct = new Set(voices.map((v) => v.voice));
    expect(distinct.size).toBe(10);

    const roster = characterRoster();
    expect(roster).toHaveLength(10);
    // Persona prompts joined from data/characters.json where ids match
    expect(roster.some((ch) => ch.systemPrompt !== null)).toBe(true);

    const ghost = resolveCharacter('Ghost');
    expect(ghost?.id).toBe('Ghost_-_The_bug');
    expect(characterSystemBlock('Ghost')).toContain('## Persona');
    expect(voiceForCharacter('Makima_||_The_Control_Devil~')?.voice).toBe('en-us');
  });
});
