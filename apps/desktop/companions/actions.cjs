const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');

function configurationHelperPath(directory = __dirname, resources = process.resourcesPath) {
  if (path.basename(directory).toLowerCase() !== 'app.asar') return path.join(directory,'protect-config.ps1');
  if (typeof resources !== 'string' || !path.isAbsolute(resources)) throw new Error('Packaged configuration helper resources are unavailable.');
  return path.join(resources,'app.asar.unpacked','protect-config.ps1');
}
async function validatedConfigurationHelper(directory = __dirname, resources = process.resourcesPath) {
  const file = configurationHelperPath(directory,resources);
  const mode = JSON.parse(await fs.readFile(path.join(directory,'mode.json'),'utf8'));
  const expected = mode.nativeHelper;
  if (!expected || expected.name !== 'protect-config.ps1' || !Number.isSafeInteger(expected.bytes) || expected.bytes < 1 || expected.bytes > 65536 || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error('Configuration helper inventory is invalid. Existing configuration was retained.');
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.bytes) throw new Error('Configuration helper is not the inventoried native file. Existing configuration was retained.');
  const bytes = await fs.readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error('Configuration helper hash verification failed. Existing configuration was retained.');
  return file;
}

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
  let existed = false;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Existing configuration must be a regular file.');
    body = await fs.readFile(file, 'utf8'); existed = true;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const previous = body;
  if (body.length > 65536) throw new Error('Existing configuration is too large to update safely.');
  const helper = existed && process.platform === 'win32' ? await validatedConfigurationHelper() : null;
  for (const [key, value] of Object.entries(config)) {
    const expression = new RegExp(`^${key}=.*$`, 'gm');
    if (expression.test(body)) body = body.replace(expression, `${key}=${value}`);
    else body += `${body.endsWith('\n') || !body ? '' : '\n'}${key}=${value}\n`;
  }
  // This file holds only public endpoint/image settings. Existing unrelated keys are preserved.
  // Authentication material is created separately by host.ps1 in its ACL-protected directory.
  const temporary = path.join(root, `.fleet-config-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    if (existed && process.platform === 'win32') {
      await new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, file, temporary], { windowsHide: true, shell: false, stdio: 'ignore' });
        child.once('error', () => reject(new Error('Could not preserve configuration permissions. Existing configuration was retained.')));
        child.once('close', code => code === 0 ? resolve() : reject(new Error('Configuration permission verification failed. Existing configuration was retained.')));
      });
    }
    // Apply the existing ACL before any retained values enter the replacement file.
    await handle.writeFile(body, 'utf8'); await handle.sync(); await handle.close(); handle = null;
    let current = null;
    try { current = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (current !== (existed ? previous : null)) throw new Error('Configuration changed during review. Existing configuration was retained; reload and retry.');
    await fs.rename(temporary, file);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
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
      const buffers = new Map(streams.map(stream => [stream, { pending: '', dropping: false }]));
      const send = text => this.emit({ kind: 'log', text: redact(text) });
      for (const stream of streams) stream.on('data', chunk => {
        const buffer = buffers.get(stream);
        for (const segment of chunk.toString('utf8').split(/(?<=\n)/)) {
          const complete = segment.endsWith('\n');
          if (!buffer.dropping) {
            buffer.pending += segment;
            if (buffer.pending.length > 65536) { buffer.pending = ''; buffer.dropping = true; }
          }
          if (complete) {
            send(buffer.dropping ? '[oversized output line suppressed]\n' : buffer.pending);
            buffer.pending = ''; buffer.dropping = false;
          }
        }
      });
      child.once('error', () => { this.child = null; reject(new Error(`${executable} could not start. Check its supported installation.`)); });
      child.once('close', code => {
        for (const buffer of buffers.values()) if (buffer.dropping) send('[oversized output line suppressed]\n'); else if (buffer.pending) send(buffer.pending);
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
module.exports = { validateSource, validateConfig, readConfig, saveConfig, redact, Actions, configurationHelperPath, validatedConfigurationHelper };
