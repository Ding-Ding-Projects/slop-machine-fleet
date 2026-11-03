const { app, BrowserWindow, ipcMain, dialog, session, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Actions, validateSource, readConfig, saveConfig } = require('./actions.cjs');
const identity = require('./mode.json');
let window, actions, selected = '', state = {}, closing = false, verifiedHost = '';
const page = pathToFileURL(path.join(__dirname, 'index.html')).href;
const stateFile = () => path.join(app.getPath('userData'), 'companion-state.json');
async function persist() { await fs.mkdir(path.dirname(stateFile()), { recursive: true }); await fs.writeFile(stateFile(), JSON.stringify(state), { mode: 0o600 }); }
function emit(value) { if (window && !window.isDestroyed()) window.webContents.send('companion:progress', value); }
function trusted(event) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page) throw new Error('Only the local companion can request actions.');
}
function handle(name, callback) {
  ipcMain.handle(`companion:${name}`, async (event, value) => {
    try { trusted(event); return { ok: true, value: await callback(value) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  try { state = JSON.parse(await fs.readFile(stateFile(), 'utf8')); } catch { state = {}; }
  if (state.running) { state.running = false; state.last = 'Interrupted. Inspect completed effects before retrying.'; }
  // A previous folder is a suggestion only. Selection and explicit trust are required each launch.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  window = new BrowserWindow({ width: 1100, height: 780, minWidth: 640, minHeight: 520, show: false, title: 'Slop Machine Fleet Companion', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false } });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }]));
  actions = new Actions(emit);
  handle('initial', async () => ({ ...identity, state, articles: JSON.parse(await fs.readFile(path.join(__dirname, 'articles.json'), 'utf8')), assets: JSON.parse(await fs.readFile(path.join(__dirname, 'assets.json'), 'utf8')) }));
  handle('preferences', async input => {
    if (!input || !['en', 'zh', 'both'].includes(input.language) || !['system', 'light', 'dark'].includes(input.theme)) throw new Error('Unsupported preference.');
    state.language = input.language; state.theme = input.theme;
    if (Number.isInteger(input.step) && input.step >= 0 && input.step <= 3) state.step = input.step;
    if (input.draft && typeof input.draft === 'object') {
      const draft = {};
      for (const key of ['FLEET_HOST', 'FLEET_HTTPS_PORT', 'FLEET_IMAGE']) {
        if (typeof input.draft[key] !== 'string' || input.draft[key].length > 300 || /[\r\n\0]/.test(input.draft[key])) throw new Error('Invalid setup draft.');
        draft[key] = input.draft[key];
      }
      state.draft = draft;
    }
    await persist(); return state;
  });
  handle('select', async () => {
    if (actions.busy || state.running) throw new Error('Wait for the running operation.');
    const result = await dialog.showOpenDialog(window, { title: 'Select trusted Fleet source', ...(typeof state.source === 'string' ? { defaultPath: state.source } : {}), properties: ['openDirectory'] });
    if (result.canceled) return null;
    selected = await validateSource(result.filePaths[0]);
    verifiedHost = '';
    const draft = state.source === selected ? state.draft : undefined;
    state.source = selected; if (!draft) delete state.draft; await persist();
    return { root: selected, config: draft ?? await readConfig(selected) };
  });
  handle('action', async input => {
    const allowed = identity.mode === 'build' ? ['build', 'run', 'installer'] : identity.mode === 'host' ? ['check', 'host'] : [];
    if (!input || !allowed.includes(input.action) || input.trusted !== true || !selected) throw new Error('Select and explicitly trust the source folder first.');
    if (actions.busy || state.running) throw new Error('An operation is already running.');
    const source = selected;
    // Reserve before any await so double-clicks cannot launch two producers.
    state.running = true; state.last = `Running: ${input.action}`;
    try {
      await validateSource(source);
      let hostConfig;
      if (input.action === 'host') { verifiedHost = ''; hostConfig = await saveConfig(source, input.config); }
      await persist();
      void actions.execute(source, input.action).then(async () => {
        state.running = false; state.last = input.action === 'host' ? 'Host entrypoint completed its same-host HTTPS check. Another LAN device remains unverified.' : 'Operation completed with exit code 0.';
        if (hostConfig) verifiedHost = `https://${hostConfig.FLEET_HOST}:${hostConfig.FLEET_HTTPS_PORT}/`;
        await persist(); emit({ kind: 'complete', action: input.action, text: state.last });
      }).catch(async error => {
        state.running = false; state.last = error.message;
        await persist().catch(() => {}); emit({ kind: 'failed', action: input.action, text: error.message });
      });
      return { started: true };
    } catch (error) { state.running = false; throw error; }
  });
  handle('cancel', async () => { await actions.cancel(); return { requested: true }; });
  handle('openHost', async () => {
    if (identity.mode !== 'host' || !verifiedHost || state.running) throw new Error('Complete hosting verification before opening Fleet.');
    await shell.openExternal(verifiedHost); return { opened: true };
  });
  window.on('close', event => {
    if (!state.running || closing) return;
    event.preventDefault();
    void dialog.showMessageBox(window, { type: 'warning', buttons: ['Keep working', 'Cancel operation and close'], defaultId: 0, cancelId: 0, message: 'An operation is running.', detail: 'Cancellation stops only the owned process tree. Completed files and running containers remain in place.' }).then(async result => {
      if (result.response !== 1) return;
      try { await actions.cancel(); closing = true; window.close(); } catch (error) { emit({ kind: 'failed', text: error.message }); }
    });
  });
  await window.loadFile(path.join(__dirname, 'index.html'));
  window.show();
});
app.on('window-all-closed', () => app.quit());
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
