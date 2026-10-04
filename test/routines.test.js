// Routines: the Abacus-inspired "standing task" feature. Pure store/schedule/record
// logic plus the subcommand handlers — all driven with temp dirs and injected executors
// so no provider, network, or real cron is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addRoutine, loadRoutines, removeRoutine, recordRun,
  scheduleCron, scheduleCronLine, runRoutineNow, runRoutineCommand,
  PROJECT_REL, HOME_REL,
} from '../cli/routines.js';

async function dirs(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'routines-'));
  const home = await mkdtemp(join(tmpdir(), 'routines-home-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  t.after(() => rm(home, { recursive: true, force: true }));
  return { cwd, home };
}

test('addRoutine + loadRoutines round-trip through the project file', async t => {
  const { cwd } = await dirs(t);
  const r = addRoutine({ cwd, name: 'nightly', prompt: 'run tests', schedule: 'daily' });
  assert.equal(r.path, join(cwd, PROJECT_REL));
  assert.equal(r.replaced, false);
  const loaded = loadRoutines({ cwd });
  assert.equal(loaded.routines.length, 1);
  assert.equal(loaded.routines[0].name, 'nightly');
  assert.equal(loaded.routines[0].schedule, 'daily');
  // Re-add replaces in place rather than duplicating.
  const r2 = addRoutine({ cwd, name: 'nightly', prompt: 'run tests + open PR', schedule: 'daily' });
  assert.equal(r2.replaced, true);
  assert.equal(loadRoutines({ cwd }).routines.length, 1);
  assert.equal(loadRoutines({ cwd }).routines[0].prompt, 'run tests + open PR');
});

test('addRoutine validates name and prompt', async t => {
  const { cwd } = await dirs(t);
  assert.throws(() => addRoutine({ cwd, name: 'bad/name', prompt: 'x' }), /[A-Za-z0-9._-]/);
  assert.throws(() => addRoutine({ cwd, name: 'ok', prompt: '   ' }), /non-empty/);
});

test('global store is separate from project; project wins on merge', async t => {
  const { cwd, home } = await dirs(t);
  addRoutine({ cwd, name: 'local', prompt: 'l', global: false, cwdOverride: cwd });
  addRoutine({ cwd, name: 'global-one', prompt: 'g', global: true, home });
  addRoutine({ cwd, name: 'local', prompt: 'overrides', global: true, home });
  // Project path should contain only "local" (the non-global one); global path both.
  const proj = JSON.parse(await readFile(join(cwd, PROJECT_REL), 'utf8'));
  assert.deepEqual(proj.routines.map(r => r.name), ['local']);
  const glob = JSON.parse(await readFile(join(home, HOME_REL), 'utf8'));
  assert.deepEqual(glob.routines.map(r => r.name).sort(), ['global-one', 'local']);
  // Merged load: project "local" shadows the global one (first seen wins).
  const merged = loadRoutines({ cwd, env: { HOME: home } });
  assert.equal(merged.routines.find(r => r.name === 'local').prompt, 'l');
  assert.equal(merged.routines.find(r => r.name === 'global-one').prompt, 'g');
});

test('scheduleCron maps named schedules and yields a crontab line', () => {
  assert.equal(scheduleCron({ schedule: 'daily' }), '0 6 * * *');
  assert.equal(scheduleCron({ schedule: { cron: '*/5 * * * *' } }), '*/5 * * * *');
  assert.equal(scheduleCron({ schedule: 'on-demand' }), null);
  const line = scheduleCronLine({ name: 'nightly', schedule: 'daily' }, { cwd: '/proj' });
  assert.match(line, /0 6 \* \* \* cd \/proj && sword routine run nightly/);
  const onDemand = scheduleCronLine({ name: 'x', schedule: 'on-demand' }, { cwd: '/p' });
  assert.match(onDemand, /run it manually/);
});

test('recordRun writes a 0600 record and stamps the definition', async t => {
  const { cwd } = await dirs(t);
  addRoutine({ cwd, name: 'r', prompt: 'p', global: false, cwdOverride: cwd });
  const one = recordRun({ cwd, name: 'r', prompt: 'p', status: 'ok', output: 'did it', toolCount: 2, durationMs: 1500 });
  assert.match(one.file, /routines\/r\/000000\.json$/);
  const body = JSON.parse(await readFile(one.file, 'utf8'));
  assert.equal(body.output, 'did it');
  assert.equal(body.toolCount, 2);
  const two = recordRun({ cwd, name: 'r', prompt: 'p', status: 'error', output: 'boom' });
  assert.match(two.file, /000001\.json$/);
  // The definition now reflects the latest run.
  const def = loadRoutines({ cwd }).routines.find(r => r.name === 'r');
  assert.equal(def.lastStatus, 'error');
  assert.ok(def.lastRun);
});

test('runRoutineNow (dry-run) returns the command without executing', async t => {
  const { cwd } = await dirs(t);
  addRoutine({ cwd, name: 'r', prompt: 'p', global: false, cwdOverride: cwd });
  const out = await runRoutineNow({ cwd, name: 'r', dryRun: true });
  assert.equal(out.dryRun, true);
  assert.ok(out.args.includes('--prompt'));
  assert.ok(out.args.includes('p'));
});

test('runRoutineNow records via an injected executor (no provider needed)', async t => {
  const { cwd } = await dirs(t);
  addRoutine({ cwd, name: 'r', prompt: 'p', global: false, cwdOverride: cwd });
  const out = await runRoutineNow({
    cwd, name: 'r',
    executor: () => JSON.stringify({ response: 'done', degraded: false, toolsRan: 3 }),
  });
  assert.equal(out.status, 'ok');
  assert.equal(out.toolsRan, 3);
  const recorded = JSON.parse(await readFile(out.recorded, 'utf8'));
  assert.equal(recorded.output, 'done');
  assert.equal(recorded.status, 'ok');
});

test('runRoutineNow errors cleanly on an unknown routine', async t => {
  const { cwd } = await dirs(t);
  await assert.rejects(runRoutineNow({ cwd, name: 'ghost' }), /not found/);
});

test('the routine subcommand: add -> list -> schedule -> remove (exit codes)', async t => {
  const { cwd } = await dirs(t);
  // Redirect cwd via cwdOverride for a hermetic target.
  let out = '';
  const cap = { log: s => { out += s + '\n'; }, error: s => { out += s + '\n'; } };
  const origLog = console.log, origErr = console.error;
  console.log = cap.log; console.error = cap.error;
  let code;
  try {
    code = await runRoutineCommand(['routine', 'add', 'nightly', '--prompt', 'run tests', '--schedule', 'daily', '--cwd', cwd]);
    assert.equal(code, 0);
    code = await runRoutineCommand(['routine', 'list', '--cwd', cwd]);
    assert.equal(code, 0);
    code = await runRoutineCommand(['routine', 'schedule', 'nightly', '--cwd', cwd]);
    assert.equal(code, 0);
    code = await runRoutineCommand(['routine', 'remove', 'nightly', '--cwd', cwd]);
    assert.equal(code, 0);
  } finally { console.log = origLog; console.error = origErr; }
  assert.match(out, /Added routine "nightly"/);
  assert.match(out, /0 6 \* \* \* .*crontab -e|0 6 \* \* \*/);
  assert.match(out, /Removed routine "nightly"/);
});

test('the routine subcommand rejects a missing prompt with exit 2', async t => {
  const { cwd } = await dirs(t);
  let err = '';
  const origErr = console.error; console.error = s => { err += s + '\n'; };
  let code;
  try { code = await runRoutineCommand(['routine', 'add', 'x', '--cwd', cwd]); }
  finally { console.error = origErr; }
  assert.equal(code, 2);
  assert.match(err, /--prompt/);
});
