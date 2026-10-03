// The sandbox is an OPportunistic hardening layer, and these tests exist mostly to
// pin down the honesty of the degradation path: when nothing is available we say
// 'none', and a runtime ENOENT is reported rather than silently swallowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, buildArgv, describe, degrade, sandboxDowngrade, resetDetection, CAPABILITIES } from '../cli/sandbox.js';

const CWD = '/work/project';
const none = () => false;

test('detection returns none when bwrap and firejail are both absent', async () => {
  resetDetection();
  const capability = await detect({ env: {}, platform: 'linux', probeImpl: none });
  assert.equal(capability.kind, 'none');
  assert.match(capability.reason, /neither bwrap nor firejail/);
  resetDetection();
});

test('detection prefers bwrap and falls back to firejail', async () => {
  resetDetection();
  const bwrap = await detect({ env: {}, platform: 'linux', probeImpl: async kind => kind === 'bwrap' });
  assert.equal(bwrap.kind, 'bwrap');
  resetDetection();
  const firejail = await detect({ env: {}, platform: 'linux', probeImpl: async kind => kind === 'firejail' });
  assert.equal(firejail.kind, 'firejail');
  resetDetection();
});

test('detection refuses every backend on Windows and caches its answer', async () => {
  resetDetection();
  const capability = await detect({ env: {}, platform: 'win32', probeImpl: async () => true });
  assert.equal(capability.kind, 'none');
  assert.match(capability.reason, /Windows/);
  resetDetection();
  let probes = 0;
  const probeImpl = async () => { probes++; return false; };
  await detect({ env: {}, platform: 'linux', probeImpl });
  await detect({ env: {}, platform: 'linux', probeImpl });
  assert.equal(probes, 2, 'two binaries probed once; the third call is served from cache');
  resetDetection();
});

test('SWORDCLI_SANDBOX forces a rung and an unknown value degrades to none', async () => {
  resetDetection();
  assert.equal((await detect({ env: { SWORDCLI_SANDBOX: 'none' }, platform: 'linux', probeImpl: async () => true })).kind, 'none');
  assert.equal((await detect({ env: { SWORDCLI_SANDBOX: 'firejail' }, platform: 'linux', probeImpl: async () => true })).kind, 'firejail');
  const bogus = await detect({ env: { SWORDCLI_SANDBOX: 'chroot' }, platform: 'linux', probeImpl: async () => true });
  assert.equal(bogus.kind, 'none');
  assert.match(bogus.reason, /Unknown SWORDCLI_SANDBOX/);
  resetDetection();
});
test('bwrap argv has the required hardening flags and binds only the project', () => {
  const { command, args, meta } = buildArgv({ kind: 'bwrap', cwd: CWD, command: 'npm', args: ['test'] });
  assert.equal(command, 'bwrap');
  for (const flag of ['--die-with-parent', '--unshare-all', '--new-session', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--chdir']) {
    assert.ok(args.includes(flag), `bwrap argv must contain ${flag}`);
  }
  assert.deepEqual(args.slice(args.indexOf('--ro-bind'), args.indexOf('--ro-bind') + 3), ['--ro-bind', '/', '/']);
  assert.deepEqual(args.slice(-3), ['--', 'npm', 'test']);
  assert.deepEqual(meta.writable, [CWD], 'the writable allowlist is exactly [cwd]');
  assert.equal(meta.sandboxed, true);
  assert.equal(meta.network, 'none');
  assert.ok(!args.includes('--share-net'), 'network=deny must not share the net namespace');
});

test('--share-net appears only when the network is allowed', () => {
  const allowed = buildArgv({ kind: 'bwrap', cwd: CWD, command: 'curl', network: 'allow' });
  assert.ok(allowed.args.includes('--share-net'));
  assert.equal(allowed.meta.network, 'allow');
  assert.ok(!buildArgv({ kind: 'bwrap', cwd: CWD, command: 'curl', network: 'deny' }).args.includes('--share-net'));
});

test('firejail argv matches the documented shape', () => {
  const { command, args, meta } = buildArgv({ kind: 'firejail', cwd: CWD, command: 'git', args: ['status'] });
  assert.equal(command, 'firejail');
  assert.deepEqual(args, ['--quiet', '--private-tmp', '--read-only=/', `--read-write=${CWD}`, '--net=none', 'git', 'status']);
  assert.deepEqual(meta.writable, [CWD]);
  assert.ok(!buildArgv({ kind: 'firejail', cwd: CWD, command: 'git', network: 'allow' }).args.includes('--net=none'));
});

test('extra writable paths are layered on and de-duplicated', () => {
  const { args, meta } = buildArgv({ kind: 'bwrap', cwd: CWD, command: 'sh', writable: ['/tmp/scratch', CWD] });
  assert.deepEqual(meta.writable, [CWD, '/tmp/scratch']);
  assert.equal(args.filter(a => a === `--bind` || a === '--bind').length, 2);
  const fj = buildArgv({ kind: 'firejail', cwd: CWD, command: 'sh', writable: ['/tmp/scratch'] });
  assert.ok(fj.args.includes('--read-write=/tmp/scratch'));
});

test('kind none passes the command through untouched and admits it', () => {
  const { command, args, meta } = buildArgv({ kind: 'none', cwd: CWD, command: 'rm', args: ['-rf', '/'] });
  assert.equal(command, 'rm');
  assert.deepEqual(args, ['-rf', '/']);
  assert.equal(meta.sandboxed, false);
  assert.equal(meta.writable, null, 'no allowlist exists when nothing is enforced');
});

test('a runtime ENOENT downgrades once and is reported, never silent', () => {
  resetDetection();
  const downgraded = degrade({ kind: 'bwrap' }, 'spawn bwrap ENOENT');
  assert.equal(downgraded.kind, 'firejail');
  assert.deepEqual(sandboxDowngrade(), { from: 'bwrap', to: 'firejail', reason: 'spawn bwrap ENOENT' });
  const again = degrade({ kind: 'firejail' }, 'spawn firejail ENOENT');
  assert.equal(again.kind, 'none');
  assert.equal(sandboxDowngrade().from, 'firejail');
  const floored = degrade({ kind: 'none' });
  assert.equal(floored.kind, 'none', 'degradation bottoms out at none');
  assert.equal(CAPABILITIES.at(-1).kind, 'none');
  resetDetection();
  assert.equal(sandboxDowngrade(), null);
});

test('describe states what the sandbox does and does not give you', () => {
  const bwrap = describe('bwrap', { writable: [CWD], network: 'deny' });
  assert.equal(bwrap.mode, 'bwrap');
  assert.equal(bwrap.network, 'none');
  assert.deepEqual(bwrap.writable, [CWD]);
  assert.match(bwrap.notice, /read-only filesystem/);
  assert.match(bwrap.notice, /~\/\.ssh.*stay readable/, 'the credential caveat must be stated');
  assert.match(bwrap.notice, /no seccomp/, 'the missing seccomp caveat must be stated');

  const unsandboxed = describe('none');
  assert.equal(unsandboxed.network, 'inherit');
  assert.equal(unsandboxed.writable, null);
  assert.match(unsandboxed.notice, /NOT SANDBOXED/);
  assert.equal(describe({ kind: 'firejail' }, { network: 'allow' }).network, 'allow');
});
