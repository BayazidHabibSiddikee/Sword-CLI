// Marketing-video render test: scripted model -> run_command tool -> model loop,
// exercised against real local ffmpeg/ffprobe media in a temporary workspace.
// RED while cli/prompts.js (buildSystemPrompt(cwd, mode='coding') -> string) is absent.
// NOTE: cli run_command is documented "NOT sandboxed"; this suite asserts approvals
// and local outputs only and does not claim cwd containment.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTools } from '../cli/tools.js';
import { runTurn } from '../cli/agent.js';
import { buildSystemPrompt } from '../cli/prompts.js';

const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';
function missingReason() {
  const missing = [FFMPEG, FFPROBE].filter(command => {
    const result = spawnSync(command, ['-version'], { encoding: 'utf8', timeout: 10000 });
    if (result.error?.code === 'ENOENT') return true;
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${command} -version failed: ${result.stderr}`);
    return false;
  });
  return missing.length ? `required local tools missing: ${missing.join(', ')}` : false;
}

const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');

function probeMedia(file) {
  const run = spawnSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(run.status, 0, `ffprobe failed on ${file}: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

const call = (id, name, args) => ({ id, function: { name, arguments: JSON.stringify(args) } });
const scripted = steps => {
  let next = 0;
  return async history => {
    assert.ok(next < steps.length, 'scripted model ran past its script');
    const step = steps[next++];
    return { choices: [{ message: { role: 'assistant', ...(typeof step === 'function' ? await step(history) : step) } }] };
  };
};

test('feature gate: marketing-video mode returns a dedicated prompt', () => {
  const prompt = buildSystemPrompt(process.cwd(), 'marketing-video');
  assert.equal(typeof prompt, 'string');
  assert.match(prompt, /marketing[- ]video/i);
  assert.notEqual(prompt, buildSystemPrompt(process.cwd()));
});

// Scripted requests exercise plumbing, not live-model creative quality.
test('marketing video loop renders real local media, probes it, and denial stops new output', async t => {
  const reason = missingReason();
  if (reason) { t.skip(reason); return; }
  const cwd = await mkdtemp(join(tmpdir(), 'flow-render-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const approvals = [];
  const execute = createTools({ cwd, timeout: 120000, approve: async request => { approvals.push(request); return true; } });
  const source = join(cwd, 'source.mp4');
  const preview = join(cwd, 'preview_portrait.mp4');
  const system = buildSystemPrompt(cwd, 'marketing-video');
  let sourceHash;

  const events = [];
  const { text, messages } = await runTurn({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: 'Create a 2s landscape master with tone, then a 270x480 portrait preview, verified with ffprobe.' }
    ],
    request: scripted([
      { tool_calls: [call('w1', 'write_file', { path: 'brief.md', content: '# Marketing video brief\n2s landscape master, portrait preview with audio.' })] },
      { tool_calls: [call('c1', 'run_command', { command: FFMPEG, args: ['-nostdin', '-n', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-t', '2', '-c:v', 'mpeg4', '-c:a', 'aac', 'source.mp4'] })] },
      async history => {
        assert.equal(JSON.parse(history.at(-1).content).exitCode, 0, history.at(-1).content);
        sourceHash = await sha256(source);
        return { tool_calls: [call('c2', 'run_command', { command: FFMPEG, args: ['-nostdin', '-n', '-i', 'source.mp4', '-t', '1.5', '-vf', 'scale=270:480', '-c:v', 'mpeg4', '-c:a', 'aac', 'preview_portrait.mp4'] })] };
      },
      { tool_calls: [call('c3', 'run_command', { command: FFPROBE, args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', 'preview_portrait.mp4'] })] },
      async history => {
        const result = JSON.parse(history.at(-1).content);
        const probe = JSON.parse(result.stdout);
        const video = probe.streams.find(s => s.codec_type === 'video');
        const audio = probe.streams.find(s => s.codec_type === 'audio');
        return { content: `preview ${video.width}x${video.height} ${Number(probe.format.duration).toFixed(2)}s audio ${audio.codec_name}` };
      }
    ]),
    execute,
    onEvent: name => events.push(name)
  });

  assert.match(text, /270x480/);
  assert.match(text, /audio aac/);
  assert.deepEqual(events, ['write_file', 'run_command', 'run_command', 'run_command']);
  assert.equal(approvals[0].tool, 'write_file');
  const commandRuns = approvals.filter(r => r.tool === 'run_command');
  assert.equal(commandRuns.length, 3);
  for (const run of commandRuns.filter(r => r.command === FFMPEG)) {
    assert.ok(run.args.includes('-nostdin'), 'every ffmpeg call must use -nostdin');
    assert.ok(run.args.includes('-n'), 'every ffmpeg call must refuse overwrite via -n');
    assert.ok(!run.args.includes('-y'), 'never pass -y');
  }
  const toolResults = messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
  assert.deepEqual(toolResults.filter(r => 'exitCode' in r).map(r => r.exitCode), [0, 0, 0]);

  const master = probeMedia(source);
  const masterVideo = master.streams.find(s => s.codec_type === 'video');
  const masterAudio = master.streams.find(s => s.codec_type === 'audio');
  assert.equal(masterVideo.width, 320);
  assert.equal(masterVideo.height, 240);
  assert.ok(Math.abs(parseFloat(master.format.duration) - 2) < 0.3, `master duration ${master.format.duration}`);
  assert.equal(masterAudio.codec_name, 'aac');

  const cut = probeMedia(preview);
  const cutVideo = cut.streams.find(s => s.codec_type === 'video');
  const cutAudio = cut.streams.find(s => s.codec_type === 'audio');
  assert.equal(cutVideo.width, 270);
  assert.equal(cutVideo.height, 480);
  assert.ok(Math.abs(parseFloat(cut.format.duration) - 1.5) < 0.3, `preview duration ${cut.format.duration}`);
  assert.equal(cutAudio.codec_name, 'aac');

  assert.equal(await sha256(source), sourceHash, 'preview must leave source byte-identical');
  const denials = [];
  const denied = await runTurn({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: 'Also export a flipped copy as doubled.mp4.' }
    ],
    request: scripted([
      { tool_calls: [call('c4', 'run_command', { command: FFMPEG, args: ['-nostdin', '-n', '-i', 'source.mp4', '-vf', 'hflip', 'doubled.mp4'] })] },
      async history => ({ content: `export stopped: ${history.at(-1).content}` })
    ]),
    execute: createTools({ cwd, timeout: 120000, approve: async request => { denials.push(request); return false; } }),
    onEvent: name => events.push(name)
  });

  assert.equal(denials.length, 1, 'approval callback must see and deny the render');
  assert.equal(denials[0].command, FFMPEG);
  assert.ok(denials[0].args.includes('doubled.mp4'));
  assert.match(denied.text, /denied/i);
  await assert.rejects(stat(join(cwd, 'doubled.mp4')), { code: 'ENOENT' }, 'denied command must not create output');
  assert.equal(await sha256(source), sourceHash, 'denied run must leave source byte-identical');
  assert.deepEqual((await readdir(cwd)).sort(), ['brief.md', 'preview_portrait.mp4', 'source.mp4']);
  assert.deepEqual(events, ['write_file', 'run_command', 'run_command', 'run_command', 'run_command']);
});
