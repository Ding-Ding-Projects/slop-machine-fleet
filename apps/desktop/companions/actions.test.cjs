const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { validateConfig, redact } = require('./actions.cjs');
const good = { FLEET_HOST: 'fleet.lan', FLEET_HTTPS_PORT: '8443', FLEET_IMAGE: 'ghcr.io/ding-ding-projects/slop-machine-fleet:sha-abc123' };

test('hosting fields reject command injection, loopback and floating image references', () => {
  assert.deepEqual(validateConfig(good), good);
  for (const FLEET_HOST of ['localhost', '127.0.0.1', '0.0.0.0', 'fleet.lan&calc', 'fleet.lan\nOTHER=value', 'https://fleet.lan', 'x/y']) assert.throws(() => validateConfig({ ...good, FLEET_HOST }));
  for (const FLEET_HTTPS_PORT of ['0', '65536', '8443 & calc', '1.5', '-2']) assert.throws(() => validateConfig({ ...good, FLEET_HTTPS_PORT }));
  for (const FLEET_IMAGE of ['ghcr.io/ding-ding-projects/slop-machine-fleet:latest', 'ghcr.io/other/project:1', 'image:1\nX=Y', 'ghcr.io/ding-ding-projects/slop-machine-fleet:main']) assert.throws(() => validateConfig({ ...good, FLEET_IMAGE }));
});

test('an oversized output line suppresses every later chunk until its newline', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const sandbox = { module: { exports: {} }, __dirname, process, require: name => name === 'node:child_process' ? { spawn: () => child } : require(name) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'actions.cjs'), 'utf8'), sandbox);
  const events = [], actions = new sandbox.module.exports.Actions(event => events.push(event));
  const operation = actions.run('.', 'fixed-command', []);
  child.stdout.emit('data', Buffer.from('a'.repeat(65537)));
  child.stdout.emit('data', Buffer.from('do-not-display-this-suffix'));
  child.stdout.emit('data', Buffer.from('\nSafe following line\n'));
  child.emit('close', 0); await operation;
  const output = events.filter(event => event.kind === 'log').map(event => event.text).join('');
  assert.ok(!output.includes('do-not-display-this-suffix'));
  assert.ok(output.includes('[oversized output line suppressed]'));
  assert.ok(output.includes('Safe following line'));
});

test('atomic configuration replacement preserves unrelated keys without leftover temporary files', async () => {
  const fsp = require('node:fs/promises');
  const directory = await fsp.mkdtemp(path.join(require('node:os').tmpdir(), 'fleet-config-test-'));
  // Exercise portable file logic separately. Windows ACL verification remains a native acceptance item.
  const sandbox = { module: { exports: {} }, __dirname, process: { platform: 'linux' }, require };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'actions.cjs'), 'utf8'), sandbox);
  try {
    await fsp.writeFile(path.join(directory, '.env'), 'FLEET_HOST=old.lan\nUNRELATED_SETTING=retained\n');
    await sandbox.module.exports.saveConfig(directory, good);
    const stored = await fsp.readFile(path.join(directory, '.env'), 'utf8');
    assert.ok(stored.includes('UNRELATED_SETTING=retained'));
    assert.ok(stored.includes('FLEET_HOST=fleet.lan'));
    assert.deepEqual(await fsp.readdir(directory), ['.env']);
    const interrupted = { module: { exports: {} }, __dirname, process: { platform: 'linux' }, require: name => name === 'node:fs/promises' ? { ...fsp, rename: async () => { throw new Error('Simulated replacement interruption'); } } : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'actions.cjs'), 'utf8'), interrupted);
    await assert.rejects(interrupted.module.exports.saveConfig(directory, { ...good, FLEET_HOST: 'new.lan' }), /Simulated replacement interruption/);
    assert.equal(await fsp.readFile(path.join(directory, '.env'), 'utf8'), stored);
    assert.deepEqual(await fsp.readdir(directory), ['.env']);
  } finally { await fsp.unlink(path.join(directory, '.env')); await fsp.rmdir(directory); }
});

test('output suppresses protected URL credentials and credential assignments', () => {
  const sample = 'postgresql://user:sample-password@host/db\nsetup-code=sample-code\nAuthorization: sample-auth\n';
  const result = redact(sample);
  for (const value of ['sample-password', 'sample-code', 'sample-auth']) assert.ok(!result.includes(value));
  assert.ok(redact('Build completed with exit code 0').includes('exit code 0'));
});

test('offline article resolution rejects protocols and root traversal', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'reader.js'), 'utf8'), sandbox);
  const resolve = sandbox.window.FleetReader.resolveLink;
  for (const target of ['javascript:alert(1)', 'https://example.com', '//example.com', '../../../outside.md', 'file:///etc/passwd', '..\\outside.md']) assert.equal(resolve('docs/topic.md', target), null);
  assert.equal(resolve('docs/guide/topic.md', '../API.md#accounts').id, 'docs/API.md');
  assert.equal(resolve('docs/guide/topic.md', '#accounts').anchor, 'accounts');
});
