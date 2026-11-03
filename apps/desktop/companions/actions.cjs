const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const fields = ['FLEET_HOST', 'FLEET_HTTPS_PORT', 'FLEET_IMAGE'];
async function validateSource(root) {
  const real = await fs.realpath(root);
  const pkg = JSON.parse(await fs.readFile(path.join(real, 'package.json'), 'utf8'));
  if (pkg.name !== 'slop-machine-fleet') throw new Error('Select the Slop Machine Fleet source folder.');
  for (const name of ['build.bat', 'build-installer.bat', 'host.bat', 'compose.yaml', 'scripts/host.ps1']) {
    if (!(await fs.stat(path.join(real, name))).isFile()) throw new Error('The source folder is missing a required entrypoint.');
  }
  return real;
}
function validateConfig(value) {
  if (!value || typeof value !== 'object') throw new Error('Hosting configuration is required.');
  const host = value.FLEET_HOST;
  const port = String(value.FLEET_HTTPS_PORT);
  const image = value.FLEET_IMAGE;
  if (typeof host !== 'string' || host.length > 253 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host) || /^(localhost|127\.|0\.0\.0\.0$)/i.test(host)) throw new Error('Enter a LAN hostname or IPv4 address, not loopback.');
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Enter a port from 1 to 65535.');
  if (typeof image !== 'string' || image.length > 300 || !/^ghcr\.io\/ding-ding-projects\/slop-machine-fleet(?:@sha256:[a-f0-9]{64}|:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$/.test(image) || /:(latest|main|master)$/i.test(image)) throw new Error('Use a published Fleet version tag or sha256 digest, not a moving channel.');
  return { FLEET_HOST: host, FLEET_HTTPS_PORT: port, FLEET_IMAGE: image };
}
async function readConfig(root) {
  let body = '';
  try { body = await fs.readFile(path.join(root, '.env'), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const result = { FLEET_HOST: '', FLEET_HTTPS_PORT: '8443', FLEET_IMAGE: '' };
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match && fields.includes(match[1])) result[match[1]] = match[2];
  }
  return result;
}
async function saveConfig(root, input) {
  const config = validateConfig(input);
  const file = path.join(root, '.env');
  let body = '';
  try { body = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (body.length > 65536) throw new Error('Existing configuration is too large to update safely.');
  for (const [key, value] of Object.entries(config)) {
    const expression = new RegExp(`^${key}=.*$`, 'gm');
    if (expression.test(body)) body = body.replace(expression, `${key}=${value}`);
    else body += `${body.endsWith('\n') || !body ? '' : '\n'}${key}=${value}\n`;
  }
  // This file holds only public endpoint/image settings. Existing unrelated keys are preserved.
  // Authentication material is created separately by host.ps1 in its ACL-protected directory.
  await fs.writeFile(file, body, { mode: 0o600 });
  return config;
}
function redact(text) {
  return String(text).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/(?:https?|postgres(?:ql)?):\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi, '[protected connection]')
    .replace(/\b(?:password|token|secret|authorization|setup[-_ ]?code)\b\s*[:=]\s*\S+/gi, '[protected value]')
    .replace(/\b[a-f0-9]{48,}\b/gi, '[redacted identifier]').slice(0, 16000);
}
class Actions {
  constructor(emit) { this.emit = emit; this.child = null; this.cancelled = false; }
  async execute(root, action) {
    if (process.platform !== 'win32') throw new Error('These entrypoints require Windows.');
    if (this.child || this.busy) throw new Error('An operation is already running.');
    this.busy = true; this.cancelled = false;
    try {
      await validateSource(root);
      if (action === 'check') {
        await this.run(root, 'docker.exe', ['info', '--format', '{{.ServerVersion}}']);
        await this.run(root, 'docker.exe', ['compose', 'version']);
      } else {
        const commands = { build: 'build.bat /s', run: 'build.bat /s /run', installer: 'build-installer.bat /s', host: 'host.bat --detached' };
        if (!Object.hasOwn(commands, action)) throw new Error('Unsupported action.');
        await this.run(root, 'cmd.exe', ['/d', '/s', '/c', commands[action]]);
      }
    } finally { this.busy = false; }
  }
  run(root, executable, args) {
    if (this.cancelled) return Promise.reject(new Error('Cancelled. Completed effects remain in place.'));
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      // Buffer entire lines before redaction so a credential split between chunks cannot escape.
      const streams = [child.stdout, child.stderr];
      const buffers = new Map(streams.map(stream => [stream, '']));
      const send = text => this.emit({ kind: 'log', text: redact(text) });
      for (const stream of streams) stream.on('data', chunk => {
        let pending = buffers.get(stream) + chunk.toString('utf8');
        const end = pending.lastIndexOf('\n');
        if (end >= 0) { send(pending.slice(0, end + 1)); pending = pending.slice(end + 1); }
        // Never expose a truncated partial line that might contain a protected value.
        if (pending.length > 65536) pending = '[oversized output line suppressed]';
        buffers.set(stream, pending);
      });
      child.once('error', () => { this.child = null; reject(new Error(`${executable} could not start. Check its supported installation.`)); });
      child.once('close', code => {
        for (const pending of buffers.values()) if (pending) send(pending);
        this.child = null;
        this.emit({ kind: 'exit', code });
        if (this.cancelled) reject(new Error('Cancelled. Completed files and running containers are preserved.'));
        else if (code !== 0) reject(new Error(`Operation exited with code ${code}. Review the output and retry after resolving the cause.`));
        else resolve();
      });
    });
  }
  async cancel() {
    if (!this.busy) throw new Error('The operation is preparing or has ended. Wait for its next status before cancellation.');
    this.cancelled = true;
    const child = this.child;
    if (!child?.pid) return;
    await new Promise((resolve, reject) => {
      const stop = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, shell: false, stdio: 'ignore' });
      stop.once('error', () => reject(new Error('The owned process could not be cancelled.')));
      stop.once('close', code => code === 0 || child.exitCode !== null ? resolve() : reject(new Error('Cancellation did not complete.')));
    });
  }
}
module.exports = { validateSource, validateConfig, readConfig, saveConfig, redact, Actions };
