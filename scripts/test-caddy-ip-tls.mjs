import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const imageTag = 'caddy:2.10.2-alpine';
const labelKey = 'org.dingdingprojects.fleet.tls-regression';
const owner = crypto.randomUUID();
const arguments_ = process.argv.slice(2);
if (arguments_.length && (arguments_.length !== 2 || arguments_[0] !== '--source' || !/^[a-f0-9]{40}$/i.test(arguments_[1]))) throw Error('Use --source <full commit SHA>, or omit it to test HEAD.');
const command = (executable, args, options = {}) => execFileSync(executable, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, ...options }).trim();
const source = command('git', ['rev-parse', `${arguments_[1] ?? 'HEAD'}^{commit}`]);
const config = command('git', ['show', `${source}:deploy/Caddyfile`]) + '\n';
if (!/^\s*default_sni\s+\{\$FLEET_HOST\}\s*$/m.test(config)) throw Error('The selected production configuration lacks the required IP default SNI.');
const negative = config.replace(/^\s*default_sni\s+\{\$FLEET_HOST\}\s*\r?\n/m, '');
const image = JSON.parse(command('docker', ['image', 'inspect', imageTag]))[0];
if (!/^sha256:[a-f0-9]{64}$/.test(image.Id)) throw Error('The existing pinned Caddy image could not be identified. No image is built or pulled by this check.');
const temporaryRoot = await fs.realpath(os.tmpdir());
const directory = await fs.mkdtemp(path.join(temporaryRoot, 'fleet-caddy-ip-tls-'));
await fs.writeFile(path.join(directory, 'owner.txt'), owner);
const receipt = { source, imageTag, imageId: image.Id, configSha256: crypto.createHash('sha256').update(config).digest('hex'), startedAt: new Date().toISOString(), variants: [], result: 'running', applicationHealth: 'not tested; TLS-only fixture' };
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; });
process.on('SIGTERM', () => { interrupted = true; });
const checkInterruption = () => { if (interrupted) throw Error('TLS regression interrupted; owned teardown remains required.'); };
const saveReceipt = () => fs.writeFile(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2));
const inspect = id => JSON.parse(command('docker', ['inspect', id]))[0];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function handshake(port, ca) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: '127.0.0.1', port, ca });
    const timer = setTimeout(() => socket.destroy(Error('TLS handshake exceeded 4 seconds.')), 4000);
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      if (!socket.authorized) { socket.destroy(Error('TLS authorization did not pass.')); return; }
      clearTimeout(timer);
      socket.end();
      resolve(certificate);
    });
    socket.once('error', error => { clearTimeout(timer); socket.destroy(); reject(error); });
  });
}

function assertOwnership(current, variant) {
  if (current.Id !== variant.containerId || current.Image !== image.Id || current.Config?.Labels?.[labelKey] !== owner) throw Error('Container identity changed; teardown was refused.');
  const volumes = current.Mounts.filter(mount => mount.Type === 'volume').map(mount => mount.Name).sort();
  if (JSON.stringify(volumes) !== JSON.stringify(variant.anonymousVolumes)) throw Error('Container volume identity changed; teardown was refused.');
}

async function variant(name, text, expectNoSniSuccess) {
  checkInterruption();
  const configuration = path.join(directory, `${name}.Caddyfile`);
  await fs.writeFile(configuration, text);
  const state = { name, configurationSha256: crypto.createHash('sha256').update(text).digest('hex'), containerId: null, anonymousVolumes: [], noSniExpected: expectNoSniSuccess, result: 'starting', startedAt: new Date().toISOString() };
  receipt.variants.push(state);
  await saveReceipt();
  try {
    state.containerId = command('docker', ['run', '--detach', '--pull=never', '--label', `${labelKey}=${owner}`, '--env', 'FLEET_HOST=127.0.0.1', '--publish', '127.0.0.1::443', '--mount', `type=bind,source=${configuration},target=/etc/caddy/Caddyfile,readonly`, image.Id]);
    if (!/^[a-f0-9]{64}$/.test(state.containerId)) throw Error('Docker did not return one exact container identity.');
    const initial = inspect(state.containerId);
    state.anonymousVolumes = initial.Mounts.filter(mount => mount.Type === 'volume').map(mount => mount.Name).sort();
    assertOwnership(initial, state);
    state.caddyVersion = command('docker', ['exec', state.containerId, 'caddy', 'version']);
    if (!state.caddyVersion.startsWith('v2.10.2 ')) throw Error('The owned fixture does not run the required Caddy version.');
    const binding = initial.NetworkSettings?.Ports?.['443/tcp'];
    if (binding?.length !== 1 || binding[0].HostIp !== '127.0.0.1' || !/^[0-9]+$/.test(binding[0].HostPort)) throw Error('The TLS fixture is not bound exclusively to one loopback port.');
    state.port = Number(binding[0].HostPort);
    console.log(`${name}: owned container ${state.containerId}, loopback port ${state.port}.`);
    await saveReceipt();
    const deadline = Date.now() + 45000;
    let ca;
    let ready = false;
    while (Date.now() < deadline) {
      checkInterruption();
      const current = inspect(state.containerId);
      assertOwnership(current, state);
      if (!current.State.Running) throw Error('The owned Caddy fixture stopped before readiness.');
      try {
        if (!ca) ca = command('docker', ['exec', state.containerId, 'cat', '/data/caddy/pki/authorities/local/root.crt'], { stdio: ['ignore', 'pipe', 'ignore'] });
        const certificates = command('docker', ['exec', state.containerId, 'find', '/data/caddy/certificates', '-type', 'f', '-name', '*.crt'], { stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).filter(Boolean);
        if (certificates.length > 8) throw Error('Fixture certificate inventory exceeded its bound.');
        let issued = false;
        for (const certificate of certificates) {
          if (!certificate.startsWith('/data/caddy/certificates/') || !certificate.endsWith('.crt')) throw Error('Fixture certificate path is invalid.');
          const publicLeaf = command('docker', ['exec', state.containerId, 'cat', certificate], { stdio: ['ignore', 'pipe', 'ignore'] });
          if (new crypto.X509Certificate(publicLeaf).checkIP('127.0.0.1')) { issued = true; break; }
        }
        if (!issued) throw Error('Caddy has not issued its public IP certificate.');
        if (expectNoSniSuccess) await handshake(state.port, ca);
        ready = true;
        break;
      } catch (error) {
        state.readinessFailure = { name: error.name, code: error.code, message: error.message };
        await saveReceipt();
        await wait(500);
      }
    }
    if (!ready) throw Error('The issued public IP certificate and required TLS readiness did not pass within 45 seconds.');
    state.caSha256 = crypto.createHash('sha256').update(ca).digest('hex');
    await fs.writeFile(path.join(directory, `${name}.public-root.crt`), ca);
    if (expectNoSniSuccess) {
      const peer = await handshake(state.port, ca);
      const wrongIdentity = tls.checkServerIdentity('127.0.0.2', peer);
      if (!wrongIdentity || wrongIdentity.code !== 'ERR_TLS_CERT_ALTNAME_INVALID') throw Error('The wrong-IP certificate identity control was unexpectedly accepted.');
      state.noSni = 'authorized with supplied public CA and normal IP validation';
      state.wrongIp = wrongIdentity.code;
    } else {
      let failure;
      try { await handshake(state.port, ca); } catch (error) { failure = error; }
      if (!failure || !/^ERR_SSL_|^ERR_TLS_/.test(failure.code ?? '')) throw Error('Removing default_sni did not produce the required TLS handshake rejection.');
      state.noSni = 'rejected after Caddy issued its public IP certificate';
      state.rejectionCode = failure.code;
    }
    state.result = 'passed';
  } catch (error) {
    state.result = 'failed';
    state.failure = { name: error.name, code: error.code, message: error.message };
    throw error;
  } finally {
    if (state.containerId) {
      try {
        const current = inspect(state.containerId);
        assertOwnership(current, state);
        const logs = spawnSync('docker', ['logs', '--tail', '100', state.containerId], { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
        await fs.writeFile(path.join(directory, `${name}.container.log`), (logs.stdout ?? '') + (logs.stderr ?? ''));
        command('docker', ['rm', '--force', '--volumes', state.containerId]);
        const remaining = command('docker', ['ps', '--all', '--no-trunc', '--filter', `id=${state.containerId}`, '--format', '{{.ID}}']);
        if (remaining) throw Error('Owned-container teardown did not verify.');
        for (const volume of state.anonymousVolumes) {
          const volumes = command('docker', ['volume', 'ls', '--filter', `name=${volume}`, '--format', '{{.Name}}']).split(/\r?\n/);
          if (volumes.includes(volume)) throw Error('An owned anonymous volume remains after teardown.');
        }
        state.teardown = 'owned container and its recorded anonymous volumes removed';
      } catch (error) {
        state.teardown = 'incomplete';
        state.teardownFailure = error.message;
        if (state.result === 'passed') throw error;
      } finally { state.completedAt = new Date().toISOString(); await saveReceipt(); }
    }
  }
}

try {
  await variant('production', config, true);
  await variant('without-default-sni', negative, false);
  await variant('production-restored', config, true);
  receipt.result = 'passed';
  receipt.completedAt = new Date().toISOString();
  await saveReceipt();
  console.log(JSON.stringify(receipt, null, 2));
  const real = await fs.realpath(directory);
  if (path.dirname(real) !== temporaryRoot || !path.basename(real).startsWith('fleet-caddy-ip-tls-') || await fs.readFile(path.join(real, 'owner.txt'), 'utf8') !== owner) throw Error('Temporary-directory ownership changed; removal was refused.');
  await fs.rm(real, { recursive: true });
  console.log('PASS: actual production no-SNI TLS, negative rejection, restored production and wrong-IP identity controls. Application health was not tested.');
} catch (error) {
  receipt.result = 'failed';
  receipt.failure = { name: error.name, code: error.code, message: error.message };
  await saveReceipt();
  console.error(`TLS regression failed; bounded evidence retained at ${directory}: ${error.message}`);
  process.exitCode = 1;
}
