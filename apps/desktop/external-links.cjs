const general = new Set(['platform.openai.com', 'help.openai.com', 'openai.com', 'docs.aws.amazon.com', 'console.aws.amazon.com']);
function allowedExternal(value) {
  try {
    if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) return false;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    if (general.has(url.hostname)) return true;
    if (url.hostname === 'auth.openai.com') return url.pathname === '/codex/device' && !url.search;
    if (url.hostname === 'github.com') return url.pathname === '/login/device' && !url.search;
    return false;
  } catch { return false; }
}
function trustedWorkspace(event, window, origin) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
  try { const url = new URL(event.senderFrame.url); return url.protocol === 'https:' && !url.username && !url.password && url.origin === origin; } catch { return false; }
}
module.exports = { allowedExternal, trustedWorkspace };
