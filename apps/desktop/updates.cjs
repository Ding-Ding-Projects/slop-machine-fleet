const { EventEmitter } = require('node:events');
const { compareVersions, discoverRelease } = require('./update-feed.cjs');

class DesktopUpdates extends EventEmitter {
  constructor({ updater, currentVersion, supported, discover = discoverRelease, persist = async () => {}, now = Date.now, confirm, schedule = setTimeout, unschedule = clearTimeout }) {
    super();
    this.updater = updater; this.currentVersion = currentVersion; this.supported = supported;
    this.discover = discover; this.persist = persist; this.now = now; this.confirm = confirm;
    this.schedule = schedule; this.unschedule = unschedule;
    this.state = { status: supported ? 'idle' : 'unavailable', code: supported ? 'ready-to-check' : 'installed-only', currentVersion, availableVersion: null, notesUrl: null, unsigned: true, checkedAt: null, retryAvailable: supported };
    this.busy = false; this.candidate = null; this.safety = null; this.safetyGeneration = 0; this.confirming = false; this.disposed = false;
    this.revision = 0;
    this.sourceGenerationFloor = null;
    this.handlers = {
      'checking-for-update': () => { if (this.busy && this.candidate) this.publish({ status: 'checking', code: 'native-check' }); },
      'update-available': () => { if (this.busy && this.candidate) this.publish({ status: 'downloading', code: 'downloading' }); },
      'update-not-available': () => { if (this.busy) { this.finish(); this.candidate = null; this.publish({ status: 'current', code: 'current', availableVersion: null, notesUrl: null, retryAvailable: true }); } },
      'error': () => { if (this.busy) { this.finish(); this.candidate = null; this.publish({ status: 'failed', code: 'native-error', availableVersion: null, notesUrl: null, retryAvailable: true }); } },
      'update-downloaded': (_event, _notes, version, _date, feed) => { void this.downloaded(version, feed); }
    };
    if (supported) for (const [event, handler] of Object.entries(this.handlers)) updater.on(event, handler);
  }
  snapshot() { return { ...this.state, revision: this.revision, installBlocked: !this.safe(), operationInProgress: this.busy }; }
  publish(patch) { if (this.disposed) return; this.state = { ...this.state, ...patch }; this.revision++; this.emit('state', this.snapshot()); }
  safe() {
    if (!this.safety) return false;
    const now = this.now(), receivedAge = now - this.safety.at, sourceAge = now - this.safety.verifiedAt;
    return this.safety.authenticated && this.safety.reachable && !this.safety.activeTasks && !this.safety.pendingWrites && !this.safety.dirty && receivedAge >= 0 && receivedAge <= 6000 && sourceAge >= 0 && sourceAge <= 4000;
  }
  reportSafety(value) {
    const keys = ['authenticated', 'reachable', 'activeTasks', 'pendingWrites', 'dirty'];
    const now = this.now();
    if (!value || keys.some(key => typeof value[key] !== 'boolean') || !Number.isSafeInteger(value.verifiedAt) || value.verifiedAt <= 0 || value.verifiedAt > now || !Number.isSafeInteger(value.sourceGeneration) || value.sourceGeneration < 0 || (this.sourceGenerationFloor !== null && value.sourceGeneration < this.sourceGenerationFloor)) {
      // Malformed or unknown evidence immediately revokes the prior safe snapshot.
      this.safety = null; this.safetyGeneration++; this.publish({});
      throw new Error('A complete authoritative workspace snapshot with valid verification time and write revision is required.');
    }
    if (!this.safety || keys.some(key => this.safety[key] !== value[key]) || this.safety.sourceGeneration !== value.sourceGeneration) this.safetyGeneration++;
    this.sourceGenerationFloor = value.sourceGeneration;
    this.safety = Object.fromEntries(keys.map(key => [key, value[key]]));
    this.safety.at = now; this.safety.verifiedAt = value.verifiedAt; this.safety.sourceGeneration = value.sourceGeneration;
    this.publish({});
  }
  invalidateSafety() { this.safety = null; this.sourceGenerationFloor = null; this.safetyGeneration++; this.publish({}); }
  start(firstRun = false) {
    if (!this.supported || this.disposed || this.automatic) return;
    const tick = () => { if (this.disposed) return; void this.check(); this.automatic = this.schedule(tick, 4 * 60 * 60 * 1000); this.automatic?.unref?.(); };
    this.automatic = this.schedule(tick, firstRun ? 20000 : 12000); this.automatic?.unref?.();
  }
  finish() { this.busy = false; if (this.watchdog) this.unschedule(this.watchdog); this.watchdog = null; }
  async check() {
    if (!this.supported || this.disposed || this.busy || this.state.status === 'ready' || this.state.status === 'restarting') return this.snapshot();
    this.busy = true;
    this.publish({ status: 'checking', code: 'metadata-check', retryAvailable: false, availableVersion: null, notesUrl: null });
    try {
      const candidate = await this.discover(this.currentVersion);
      if (this.disposed) return this.snapshot();
      this.publish({ checkedAt: new Date(this.now()).toISOString() });
      if (compareVersions(candidate.version, this.currentVersion) <= 0) {
        this.finish(); this.publish({ status: 'current', code: 'current', retryAvailable: true }); return this.snapshot();
      }
      this.candidate = candidate;
      this.publish({ availableVersion: candidate.version, notesUrl: candidate.notesUrl });
      this.updater.setFeedURL({ url: candidate.feedUrl });
      this.watchdog = this.schedule(() => {
        // Electron exposes no native cancellation API. Keep the lock until a terminal event.
        if (this.busy) this.publish({ status: 'failed', code: 'native-timeout', retryAvailable: false });
      }, 5 * 60 * 1000);
      this.watchdog?.unref?.();
      const pending = this.updater.checkForUpdates();
      if (pending?.catch) pending.catch(() => this.handlers.error());
    } catch {
      this.finish(); this.candidate = null;
      this.publish({ status: 'unavailable', code: 'feed-unavailable', availableVersion: null, notesUrl: null, retryAvailable: true });
    }
    return this.snapshot();
  }
  async downloaded(version, feed) {
    if (!this.busy || !this.candidate || this.disposed) return;
    const candidate = this.candidate;
    if (version !== candidate.version || feed !== candidate.feedUrl) {
      this.finish(); this.candidate = null; this.publish({ status: 'failed', code: 'download-identity-mismatch', availableVersion: null, notesUrl: null, retryAvailable: false }); return;
    }
    let code = 'ready';
    try { await this.persist({ version, notesUrl: candidate.notesUrl, stagedAt: new Date(this.now()).toISOString() }); } catch { code = 'ready-not-recorded'; }
    if (this.disposed || this.candidate !== candidate) return;
    this.finish(); this.publish({ status: 'ready', code, availableVersion: version, notesUrl: candidate.notesUrl, retryAvailable: false });
  }
  later() { if (this.state.status === 'ready') this.publish({ code: 'ready-later' }); return this.snapshot(); }
  async requestRestart() {
    if (this.state.status !== 'ready' || !this.candidate || this.confirming || !this.safe()) return { ok: false, code: 'workspace-not-safe' };
    const candidate = this.candidate, generation = this.safetyGeneration;
    this.confirming = true;
    try {
      const accepted = await this.confirm(candidate.version);
      if (!accepted) { this.later(); return { ok: false, code: 'later' }; }
      if (this.disposed || this.state.status !== 'ready' || this.candidate !== candidate || this.safetyGeneration !== generation || !this.safe()) return { ok: false, code: 'workspace-changed' };
      this.publish({ status: 'restarting', code: 'restarting' });
      try { this.updater.quitAndInstall(); return { ok: true }; }
      catch { this.publish({ status: 'ready', code: 'restart-failed' }); return { ok: false, code: 'restart-failed' }; }
    } catch { return { ok: false, code: 'confirmation-unavailable' }; }
    finally { this.confirming = false; }
  }
  dispose() {
    this.disposed = true; this.finish(); this.invalidateSafety();
    if (this.automatic) this.unschedule(this.automatic);
    for (const [event, handler] of Object.entries(this.handlers)) this.updater.removeListener(event, handler);
  }
}
module.exports = { DesktopUpdates };
