const { app, BrowserWindow, ipcMain, shell, session, autoUpdater, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
let window;
let serviceOrigin;
let updates;
let updateLanguage = 'en';
const { allowedExternal, trustedWorkspace } = require('./external-links.cjs');
const { installedSupport } = require('./update-feed.cjs');
const { DesktopUpdates } = require('./updates.cjs');
function validatedUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid HTTPS service address.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an HTTPS origin without credentials, path, query or fragment.');
  return url.origin;
}
function allowedNavigation(url) { try { return new URL(url).origin === serviceOrigin; } catch { return false; } }
async function connect(value) {
  const origin = validatedUrl(value);
  updates?.invalidateSafety();
  serviceOrigin = origin;
  await window.loadURL(origin);
  await fs.writeFile(path.join(app.getPath('userData'), 'connection.json'), JSON.stringify({ origin }), { mode: 0o600 });
}
app.whenReady().then(async () => {
  const squirrelEvent = process.argv.find(argument => /^--squirrel-(install|updated|uninstall|obsolete)$/.test(argument));
  if (squirrelEvent) {
    if (squirrelEvent === '--squirrel-obsolete') { app.quit(); return; }
    const update = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    const action = squirrelEvent === '--squirrel-uninstall' ? '--removeShortcut' : '--createShortcut';
    const child = require('node:child_process').spawn(update, [action, path.basename(process.execPath)], { windowsHide: true });
    child.once('close', () => app.quit());
    child.once('error', () => app.quit());
    return;
  }
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 800, minHeight: 600, title: 'Slop Machine Fleet', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false } });
  window.webContents.on('will-navigate', (event, url) => { if (!allowedNavigation(url)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!allowedNavigation(url)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (allowedExternal(url)) void shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  const updateText = (en, yue) => updateLanguage === 'yue' ? yue : updateLanguage === 'both' ? `${en}\n${yue}` : en;
  updates = new DesktopUpdates({ updater: autoUpdater, currentVersion: app.getVersion(), supported: await installedSupport({ packaged: app.isPackaged, platform: process.platform, execPath: process.execPath, version: app.getVersion() }),
    persist: async record => {
      await fs.mkdir(app.getPath('userData'), { recursive: true });
      await fs.writeFile(path.join(app.getPath('userData'), 'staged-update.json'), JSON.stringify(record), { mode: 0o600 });
    },
    confirm: async version => {
      const result = await dialog.showMessageBox(window, { type: 'warning', title: updateText('Restart Fleet to update', '重新啟動 Fleet 以更新'), buttons: [updateText('Later', '稍後'), updateText('Restart Fleet', '重新啟動 Fleet')], defaultId: 0, cancelId: 0, noLink: true,
        message: updateText(`Install Fleet ${version} and restart this application?`, `安裝 Fleet ${version} 並重新啟動此應用程式？`),
        detail: updateText('This package is unsigned. Save all work first. Only Fleet restarts; the computer will not restart. An active task, unsaved draft or changed workspace prevents this action.', '此套件未簽署。請先儲存所有工作。只會重新啟動 Fleet，不會重新啟動電腦。如有執行中任務、未儲存草稿或工作區狀態改變，此操作會被阻止。') });
      return result.response === 1;
    }
  });
  const updateAction = (name, callback) => ipcMain.handle(`fleet:updates:${name}`, async (event, value) => {
    if (!trustedWorkspace(event, window, serviceOrigin)) return { ok: false, code: 'untrusted-workspace' };
    try { return { ok: true, value: await callback(value) }; } catch { return { ok: false, code: 'update-action-unavailable' }; }
  });
  updateAction('read', () => updates.snapshot());
  updateAction('check', () => updates.check());
  updateAction('safety', value => {
    if (value && ['en', 'yue', 'both'].includes(value.language)) updateLanguage = value.language;
    updates.reportSafety(value); return updates.snapshot();
  });
  updateAction('restart', () => updates.requestRestart());
  updateAction('later', () => updates.later());
  updateAction('notes', async () => { const url = updates.snapshot().notesUrl; if (!url) throw new Error('No release notes'); await shell.openExternal(url); return true; });
  updates.on('state', state => {
    if (!window.isDestroyed() && allowedNavigation(window.webContents.getURL())) window.webContents.send('fleet:updates:state', state);
  });
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) updates.invalidateSafety(); });
  window.webContents.on('render-process-gone', () => updates.invalidateSafety());
  updates.start(process.argv.includes('--squirrel-firstrun'));
  ipcMain.handle('fleet:connect', async (event, value) => {
    if (event.sender !== window.webContents || !event.senderFrame.url.startsWith('file:')) return { ok: false, error: 'Connection changes require the local setup screen.' };
    try { await connect(value); return { ok: true }; } catch { await window.loadFile(path.join(__dirname, 'connect.html')); return { ok: false, error: 'The HTTPS service could not be opened. Check its address and trusted certificate.' }; }
  });
  const { Menu } = require('electron');
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Connection', submenu: [{ label: 'Change service address', click: () => window.loadFile(path.join(__dirname, 'connect.html')) }, { role: 'quit' }] }, { label: 'Updates', submenu: [{ label: 'Check for updates', click: () => { void updates.check(); } }, { label: 'Restart Fleet to install downloaded update', click: () => { void updates.requestRestart(); } }] }, { role: 'editMenu' }, { role: 'viewMenu' }]));
  try { const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'connection.json'), 'utf8')); await connect(saved.origin); } catch { await window.loadFile(path.join(__dirname, 'connect.html')); }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => updates?.dispose());
