const api = window.fleetCompanion;
const $ = selector => document.querySelector(selector);
const dictionary = {
  buildTitle: ['Build workspace', '建置工作區'], hostTitle: ['Set up your Fleet host', '設定 Fleet 主機'], docsTitle: ['Fleet offline guide', 'Fleet 離線指南'],
  language: ['Language', '語言'], theme: ['Appearance', '外觀'],
  sourceTitle: ['Choose trusted source', '選擇可信任的原始碼'], select: ['Choose Fleet folder', '選擇 Fleet 資料夾'],
  sourceHelp: ['Select the existing Fleet source folder. These actions execute its scripts with your current permissions. A matching project name does not prove that source is safe.', '請選擇現有 Fleet 原始碼資料夾。以下操作會以目前權限執行當中的指令碼。專案名稱相符並不代表原始碼安全。'],
  trust: ['I have reviewed and trust this source folder and its build/hosting scripts.', '已檢查並信任此原始碼資料夾及其建置和主機指令碼。'],
  noSource: ['No source selected', '尚未選擇原始碼'], build: ['Build', '建置'], run: ['Build and run', '建置並執行'], installer: ['Build installer', '建置安裝程式'],
  buildHelp: ['Build the service, web interface, worker and desktop client. Tools are acquired through the source entrypoint. Build and run opens the client after building; its operation stays active until the client exits.', '建置服務、網頁介面、工作程式及桌面用戶端。所需工具由原始碼入口取得。建置並執行會在完成後開啟用戶端，直至用戶端結束才完成操作。'],
  output: ['Operation output', '操作輸出'], idle: ['Ready when you are. No operation has started.', '準備就緒，尚未開始任何操作。'], cancel: ['Cancel operation', '取消操作'],
  cancelHelp: ['Cancellation stops only this operation’s process tree. Completed files and running containers are preserved.', '取消只會停止此操作的程序樹，已完成的檔案和正在執行的容器會保留。'],
  running: ['Running. Follow the output below.', '正在執行，請查看下方輸出。'], check: ['Check engine and Compose', '檢查引擎及 Compose'],
  checkTitle: ['Check your hosting tools', '檢查主機工具'], checkHelp: ['The Docker engine must be running and Compose v2 available. This checks the actual engine. Automatic engine installation is not available here.', 'Docker 引擎必須正在執行，並已提供 Compose v2。此操作會檢查實際引擎；此處尚未提供自動安裝引擎。'],
  configure: ['Configure', '設定'], review: ['Review', '檢閱'], back: ['Back', '上一步'], next: ['Next', '下一步'],
  host: ['LAN hostname or IPv4 address', '區域網絡主機名稱或 IPv4 位址'], port: ['HTTPS host port', 'HTTPS 主機連接埠'], image: ['Published Fleet version or digest', '已發佈的 Fleet 版本或摘要'],
  configHelp: ['Use your actual LAN address and an immutable published image version. Registry authentication and certificate trust must already be configured through their supported local controls.', '請使用實際區域網絡位址及已發佈的固定映像版本。登錄驗證和憑證信任必須先透過支援的本機控制完成設定。'],
  storageTitle: ['Keep existing persistent storage', '保留現有持續儲存'], storageHelp: ['Fleet uses its existing named Compose volumes: database, certificates and gateway_config. Data relocation is not supported by this wizard. Setup authorization remains in the protected .local/setup-code file, never in this interface or output.', 'Fleet 使用現有 Compose 命名磁碟區：database、certificates 及 gateway_config。本精靈尚未支援搬移資料。設定授權只保存在受保護的 .local/setup-code 檔案，不會出現在此介面或輸出中。'],
  reviewHelp: ['Starting updates only the three displayed hosting settings in .env, preserving other keys, then runs host.bat --detached. Existing containers and persistent data are retained. Image availability and trusted HTTPS health must pass before completion.', '開始會更新 .env 中顯示的三項主機設定，保留其他設定，然後執行 host.bat --detached。現有容器和持續資料會保留。必須確認映像可用及可信任的 HTTPS 健康狀態才算完成。'],
  startHost: ['Save settings and start Fleet', '儲存設定並啟動 Fleet'], checkFirst: ['Run the engine check successfully before continuing.', '請先成功完成引擎檢查。'],
  openHost: ['Open verified Fleet address', '開啟已驗證的 Fleet 位址'],
  search: ['Search all offline articles', '搜尋所有離線文章'], noResults: ['No matching articles. Try a shorter phrase.', '找不到相符文章，請嘗試較短的詞句。'],
  docsHelp: ['Read complete bundled articles without a network connection. Follow a task below or search article titles and content. External resources are shown as references, never fetched.', '無需網絡連線即可閱讀完整內置文章。請選擇下方任務，或搜尋文章標題及內容。外部資源只顯示為參考，不會下載。'],
  readBuild: ['Build and package', '建置與封裝'], readHost: ['Host and connect', '架設及連線'], readAccounts: ['Accounts and API', '帳戶及 API'],
  limits: ['Runtime acceptance, full advanced search parity and the universal feature inventory remain unverified. This tool reports actual operation results only.', '執行驗收、完整進階搜尋功能及通用功能清單仍未驗證。本工具只報告實際操作結果。'],
  progressSteps: ['Source · Tools · Configure · Start', '原始碼 · 工具 · 設定 · 啟動'],
  version: ['Version', '版本'], reset: ['Reset appearance', '重設外觀'], chosen: ['Source selected. Review it before enabling actions.', '已選擇原始碼，啟用操作前請先檢查。'],
  hostComplete: ['Same-host HTTPS verification completed. Verify this address from another intended LAN device before claiming cross-device access.', '已完成同一主機的 HTTPS 驗證。宣稱跨裝置連線成功前，請先從另一部預定的區域網絡裝置驗證此位址。']
};
let initial, mode, language = 'en', theme = 'system', step = 0, root = '', config = { FLEET_HOST: '', FLEET_HTTPS_PORT: '8443', FLEET_IMAGE: '' }, trusted = false, checked = false, busy = false, hostVerified = false, output = '', result = '', failed = false, query = '', selectedArticle = '';
function t(key) { const pair = dictionary[key] ?? [key, key]; return language === 'zh' ? pair[1] : language === 'both' ? `${pair[0]} / ${pair[1]}` : pair[0]; }
function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
function button(key, callback, primary = false, disabled = false) { const node = element('button', t(key), primary ? 'primary' : ''); node.dataset.focusKey = key; node.type = 'button'; node.disabled = disabled; node.addEventListener('click', callback); return node; }
function notice(text) { $('#notice').textContent = text; }
async function call(promise) { const response = await promise; if (!response.ok) { notice(response.error); throw new Error(response.error); } return response.value; }
function safely(callback) { return (...args) => Promise.resolve(callback(...args)).catch(error => notice(error.message)); }
async function preferences() { await call(api.preferences({ language, theme, step, ...(root ? { draft: config } : {}) })); }
function heading(title, help) { const fragment = document.createDocumentFragment(); fragment.append(element('h1', t(title)), element('p', t(help), 'muted')); return fragment; }
function sourcePanel() {
  const section = element('section', '', 'panel'); section.append(element('h2', t('sourceTitle')), element('p', t('sourceHelp'), 'muted'), element('p', root || t('noSource'), 'source'));
  section.append(button('select', safely(async () => {
    const selected = await call(api.select()); if (!selected) return;
    root = selected.root; config = selected.config; trusted = false; checked = false; hostVerified = false; step = 0; notice(t('chosen')); render();
  }), false, busy));
  const label = element('label', '', 'trust'); const input = element('input'); input.dataset.focusKey = 'trust'; input.type = 'checkbox'; input.checked = trusted; input.disabled = busy || !root; input.addEventListener('change', () => { trusted = input.checked; render(); }); label.append(input, document.createTextNode(t('trust'))); section.append(label); return section;
}
function operationPanel() {
  const section = element('section', '', 'panel'); section.append(element('h2', t('output')));
  const status = element('p', result || t('idle'), failed ? 'result error' : 'result'); status.id = 'operation-status'; status.setAttribute('role', 'status'); section.append(status);
  const log = element('pre', output, 'log'); log.id = 'output'; log.tabIndex = 0; log.setAttribute('aria-label', t('output')); section.append(log, element('p', t('cancelHelp'), 'muted'));
  section.append(button('cancel', safely(async () => { await call(api.cancel()); notice(t('cancelHelp')); }), false, !busy)); return section;
}
async function start(action) {
  if (busy) return;
  busy = true; failed = false; if (action === 'host') hostVerified = false; output = ''; result = t('running'); render();
  try { await call(api.action({ action, trusted, config })); } catch (error) { busy = false; failed = true; result = error.message; render(); }
}
function renderBuild(container) {
  container.append(heading('buildTitle', 'buildHelp'), sourcePanel());
  const actions = element('div', '', 'actions'); for (const key of ['build', 'run', 'installer']) actions.append(button(key, safely(() => start(key)), key === 'build', busy || !root || !trusted)); container.append(actions, operationPanel());
}
function field(key, configKey) {
  const label = element('label', t(key)); const input = element('input'); input.value = config[configKey]; input.disabled = busy; input.maxLength = configKey === 'FLEET_IMAGE' ? 300 : configKey === 'FLEET_HOST' ? 253 : 5; input.autocomplete = 'off'; input.spellcheck = false;
  if (configKey === 'FLEET_HTTPS_PORT') input.inputMode = 'numeric';
  input.addEventListener('input', () => { config[configKey] = input.value; }); input.addEventListener('change', safely(() => preferences())); label.append(input); return label;
}
function renderHost(container) {
  container.append(heading('hostTitle', 'progressSteps'));
  const steps = element('nav', '', 'steps'); steps.setAttribute('aria-label', t('progressSteps'));
  ['sourceTitle', 'checkTitle', 'configure', 'review'].forEach((key, index) => { const item = element('span', `${index + 1}. ${t(key)}`, index === step ? 'current' : ''); if (index === step) item.setAttribute('aria-current', 'step'); steps.append(item); }); container.append(steps);
  if (step === 0) container.append(sourcePanel());
  if (step === 1) {
    const section = element('section', '', 'panel'); section.append(element('h2', t('checkTitle')), element('p', t('checkHelp')), button('check', safely(() => start('check')), true, busy || !root || !trusted)); container.append(section);
  }
  if (step === 2) {
    const section = element('section', '', 'panel'); section.append(element('h2', t('configure')), element('p', t('configHelp')));
    const fields = element('div', '', 'grid'); fields.append(field('host', 'FLEET_HOST'), field('port', 'FLEET_HTTPS_PORT'), field('image', 'FLEET_IMAGE')); section.append(fields, element('h2', t('storageTitle')), element('p', t('storageHelp'))); container.append(section);
  }
  if (step === 3) {
    const section = element('section', '', 'panel'); section.append(element('h2', t('review')), element('p', t('reviewHelp')), element('pre', `FLEET_HOST=${config.FLEET_HOST}\nFLEET_HTTPS_PORT=${config.FLEET_HTTPS_PORT}\nFLEET_IMAGE=${config.FLEET_IMAGE}`, 'log'), element('p', t('storageHelp')));
    section.append(button('startHost', safely(() => start('host')), true, busy || !root || !trusted || !checked)); container.append(section);
    if (hostVerified) section.append(button('openHost', safely(() => call(api.openHost()))));
  }
  const actions = element('div', '', 'actions'); actions.append(button('back', safely(async () => { step = Math.max(0, step - 1); await preferences(); render(); }), false, step === 0 || busy));
  if (step < 3) actions.append(button('next', safely(async () => { step++; await preferences(); render(); }), true, busy || !root || !trusted || (step === 1 && !checked) || (step === 2 && !config.FLEET_HOST)));
  container.append(actions, operationPanel());
}
function navigate(id, anchor = '') {
  selectedArticle = id; render();
  const target = anchor ? document.getElementById(`article-${anchor}`) : $('#article');
  target?.scrollIntoView({ block: 'start' }); if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
}
function renderDocs(container) {
  container.append(heading('docsTitle', 'docsHelp'));
  const tasks = element('div', '', 'actions');
  for (const [key, pattern] of [['readBuild', /build|install/i], ['readHost', /host|deploy/i], ['readAccounts', /account|api|auth/i]]) tasks.append(button(key, () => { const found = initial.articles.find(article => pattern.test(article.title)) ?? initial.articles.find(article => pattern.test(article.text)); if (found) navigate(found.id); }));
  container.append(tasks);
  const search = element('label', t('search'), 'search'); const input = element('input'); input.type = 'search'; input.value = query;
  input.addEventListener('input', () => { query = input.value; refreshList(); }); search.append(input); container.append(search);
  const layout = element('div', '', 'reader-layout'), list = element('nav', '', 'article-list'), article = element('article', '', 'panel'); list.id = 'articles'; list.setAttribute('aria-label', t('docsTitle')); article.id = 'article'; layout.append(list, article); container.append(layout);
  const current = initial.articles.find(item => item.id === selectedArticle) ?? initial.articles[0]; if (current) { selectedArticle = current.id; window.FleetReader.render(article, current, initial.articles, initial.assets, navigate); }
  refreshList(list);
}
function refreshList(target = $('#articles')) {
  if (!target) return; target.replaceChildren();
  const needle = query.toLocaleLowerCase(); const results = initial.articles.filter(article => `${article.title}\n${article.text}`.toLocaleLowerCase().includes(needle));
  for (const article of results) { const item = element('button', article.title, article.id === selectedArticle ? 'active' : ''); item.type = 'button'; item.addEventListener('click', () => navigate(article.id)); target.append(item); }
  if (!results.length) target.append(element('p', t('noResults')));
}
function render() {
  const previousFocus = document.activeElement;
  const focusKey = previousFocus?.dataset?.focusKey;
  const movedStep = focusKey === 'next' || focusKey === 'back';
  document.documentElement.lang = language === 'zh' ? 'zh-HK' : 'en'; document.documentElement.dataset.theme = theme;
  $('#language').value = language; $('#theme').value = theme; $('#language-label').textContent = t('language'); $('#theme-label').textContent = t('theme');
  $('#subtitle').textContent = t(`${mode}Title`); $('#footer').textContent = `${t('version')} ${initial.version} · ${t('limits')}`;
  const container = $('#content'); container.replaceChildren();
  if (mode === 'build') renderBuild(container); else if (mode === 'host') renderHost(container); else renderDocs(container);
  if (previousFocus && !previousFocus.isConnected) {
    const retained = !movedStep && focusKey ? [...container.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focusKey && !node.disabled) : null;
    const target = retained || (busy ? $('#operation-status') : container.querySelector('.panel h2, h1'));
    if (target) { if (!retained) target.tabIndex = -1; target.focus({ preventScroll: false }); }
  }
}
api.progress(event => {
  if (event.kind === 'log') { output = (output + event.text).slice(-80000); const log = $('#output'); if (log) { log.textContent = output; log.scrollTop = log.scrollHeight; } return; }
  if (event.kind === 'exit') return;
  busy = false; failed = event.kind === 'failed'; result = event.text;
  if (!failed && event.action === 'check') checked = true;
  if (!failed && event.action === 'host') { hostVerified = true; result += ` ${t('hostComplete')} https://${config.FLEET_HOST}:${config.FLEET_HTTPS_PORT}/`; }
  render(); notice(result);
});
$('#language').addEventListener('change', safely(async event => { language = event.target.value; await preferences(); render(); }));
$('#theme').addEventListener('change', safely(async event => { theme = event.target.value; await preferences(); render(); }));
void safely(async () => {
  initial = await call(api.initial()); mode = initial.mode; language = initial.state.language ?? 'en'; theme = initial.state.theme ?? 'system'; result = initial.state.last ?? '';
  // An interrupted setup returns to deliberate source selection before any mutation.
  step = 0; render();
})();
