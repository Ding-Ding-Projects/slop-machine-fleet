const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const desktop = path.dirname(__dirname);

test('packaging icon has all seven supported PNG-backed sizes', () => {
  const icon = fs.readFileSync(path.join(__dirname, 'icon.ico'));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 7);
  const sizes = [];
  for (let i = 0; i < 7; i++) {
    const entry = 6 + 16 * i;
    const width = icon[entry] || 256, height = icon[entry + 1] || 256;
    assert.equal(width, height); sizes.push(width);
    const length = icon.readUInt32LE(entry + 8), offset = icon.readUInt32LE(entry + 12);
    assert.ok(offset + length <= icon.length);
    assert.deepEqual(icon.subarray(offset, offset + 8), Buffer.from([137,80,78,71,13,10,26,10]));
  }
  assert.deepEqual(sizes, [16,24,32,48,64,128,256]);
});

test('client packaging has an explicit public icon URL and retains unsigned settings', () => {
  const { build } = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  assert.equal(build.win.icon, 'build/icon.ico');
  assert.equal(build.squirrelWindows.setupIcon, undefined);
  assert.equal(build.squirrelWindows.iconUrl, 'https://raw.githubusercontent.com/Ding-Ding-Projects/slop-machine-fleet/main/apps/desktop/build/icon.ico');
  assert.equal(build.win.signAndEditExecutable, false);
  assert.equal(build.win.forceCodeSigning, false);
  assert.equal(build.afterPack, 'build/apply-icon.cjs');
});

test('resource hook invokes only icon editing and rejects an invalid icon', async () => {
  const calls = [];
  const sandbox = { module: { exports: {} }, require: name => name === 'builder-util' ? { executeAppBuilder: async args => calls.push(args) } : name === 'node:fs/promises' ? { readFile: async () => fs.readFileSync(path.join(__dirname, 'icon.ico')), stat: async () => ({ isFile: () => true }) } : require(name) };
  const source = fs.readFileSync(path.join(__dirname, 'apply-icon.cjs'), 'utf8');
  vm.runInNewContext(source, sandbox);
  const context = { electronPlatformName: 'win32', appOutDir: 'C:/fixture/output', packager: { projectDir: desktop, appInfo: { productFilename: 'Fleet' } } };
  await sandbox.module.exports(context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'rcedit');
  assert.equal(calls[0][1], '--args');
  assert.deepEqual(JSON.parse(calls[0][2]), [path.join(context.appOutDir, 'Fleet.exe'), '--set-icon', path.join(desktop, 'build/icon.ico')]);
  const invalid = { module: { exports: {} }, require: name => name === 'node:fs/promises' ? { readFile: async () => Buffer.alloc(10) } : sandbox.require(name) };
  vm.runInNewContext(source, invalid);
  await assert.rejects(invalid.module.exports(context), /missing or invalid/);
  assert.equal(calls.length, 1);
});
