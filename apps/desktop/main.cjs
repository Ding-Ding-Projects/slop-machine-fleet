const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
let window;
let serviceOrigin;
const official = new Set(['platform.openai.com', 'help.openai.com', 'openai.com', 'docs.aws.amazon.com', 'console.aws.amazon.com']);
function validatedUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid HTTPS service address.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an HTTPS origin without credentials, path, query or fragment.');
  return url.origin;
}
function allowedNavigation(url) { try { return new URL(url).origin === serviceOrigin; } catch { return false; } }
async function connect(value) {
  const origin = validatedUrl(value);
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
    try { const target = new URL(url); if (target.protocol === 'https:' && official.has(target.hostname) && !target.username && !target.password) void shell.openExternal(target.href); } catch {}
    return { action: 'deny' };
  });
  ipcMain.handle('fleet:connect', async (event, value) => {
    if (event.sender !== window.webContents || !event.senderFrame.url.startsWith('file:')) return { ok: false, error: 'Connection changes require the local setup screen.' };
    try { await connect(value); return { ok: true }; } catch { await window.loadFile(path.join(__dirname, 'connect.html')); return { ok: false, error: 'The HTTPS service could not be opened. Check its address and trusted certificate.' }; }
  });
  const { Menu } = require('electron');
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Connection', submenu: [{ label: 'Change service address', click: () => window.loadFile(path.join(__dirname, 'connect.html')) }, { role: 'quit' }] }, { role: 'editMenu' }, { role: 'viewMenu' }]));
  try { const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'connection.json'), 'utf8')); await connect(saved.origin); } catch { await window.loadFile(path.join(__dirname, 'connect.html')); }
});
app.on('window-all-closed', () => app.quit());
