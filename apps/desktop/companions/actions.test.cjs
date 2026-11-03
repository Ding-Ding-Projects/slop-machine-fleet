const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { validateConfig, redact } = require('./actions.cjs');
const good = { FLEET_HOST: 'fleet.lan', FLEET_HTTPS_PORT: '8443', FLEET_IMAGE: 'ghcr.io/ding-ding-projects/slop-machine-fleet:sha-abc123' };

test('hosting fields reject command injection, loopback and floating image references', () => {
  assert.deepEqual(validateConfig(good), good);
  for (const FLEET_HOST of ['localhost', '127.0.0.1', '0.0.0.0', 'fleet.lan&calc', 'fleet.lan\nOTHER=value', 'https://fleet.lan', 'x/y']) assert.throws(() => validateConfig({ ...good, FLEET_HOST }));
  for (const FLEET_HTTPS_PORT of ['0', '65536', '8443 & calc', '1.5', '-2']) assert.throws(() => validateConfig({ ...good, FLEET_HTTPS_PORT }));
  for (const FLEET_IMAGE of ['ghcr.io/ding-ding-projects/slop-machine-fleet:latest', 'ghcr.io/other/project:1', 'image:1\nX=Y', 'ghcr.io/ding-ding-projects/slop-machine-fleet:main']) assert.throws(() => validateConfig({ ...good, FLEET_IMAGE }));
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
