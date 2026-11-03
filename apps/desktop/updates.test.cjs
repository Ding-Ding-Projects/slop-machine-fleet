const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { DesktopUpdates } = require('./updates.cjs');
const { allowedExternal, trustedWorkspace } = require('./external-links.cjs');
const { compareVersions, validateRelease, validateManifest, allowedDownload, discoverRelease, verifySource, installedSupport, releaseBase, RELEASES_API, API_ROOT } = require('./update-feed.cjs');

const sha = 'a'.repeat(40), tag = 'build-unit-fixture';
const feed = `${'b'.repeat(40)} SlopMachineFleet-0.1.1-full.nupkg 100\n`;
const base = releaseBase(tag);
const releaseValue = { draft:false, prerelease:false, tag_name:tag, html_url:`https://github.com/Ding-Ding-Projects/slop-machine-fleet/releases/tag/${tag}`, target_commitish:sha, assets:[{name:'RELEASES',size:Buffer.byteLength(feed),browser_download_url:`${base}/RELEASES`},{name:'source-manifest.json',size:500,browser_download_url:`${base}/source-manifest.json`},{name:'SlopMachineFleet-0.1.1-full.nupkg',size:100,browser_download_url:`${base}/SlopMachineFleet-0.1.1-full.nupkg`}] };
const manifest = { updateChannel:'stable',sourceBranch:'main',source:sha,version:'0.1.1',unsigned:true,files:[{name:'RELEASES',bytes:Buffer.byteLength(feed),sha256:createHash('sha256').update(feed).digest('hex')},{name:'SlopMachineFleet-0.1.1-full.nupkg',bytes:100,sha256:'c'.repeat(64)}] };
const candidate = validateManifest(manifest, validateRelease(releaseValue), feed);
const safe = { authenticated:true, reachable:true, activeTasks:false, pendingWrites:false, dirty:false };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides={}) {
  const updater = new EventEmitter(); updater.checks=0;updater.quits=0;
  updater.setFeedURL=value=>{updater.feed=value.url;};updater.checkForUpdates=()=>{updater.checks++;updater.emit('checking-for-update');};updater.quitAndInstall=()=>{updater.quits++;};
  let time=10000; const timers=[];
  const controller=new DesktopUpdates({updater,currentVersion:'0.1.0',supported:true,discover:async()=>candidate,now:()=>time,confirm:async()=>true,schedule:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},unschedule:()=>{},...overrides});
  return {updater,controller,timers,advance:amount=>{time+=amount;}};
}
async function ready(f) { await f.controller.check();f.updater.emit('update-available');f.updater.emit('update-downloaded',{},'untrusted release body','0.1.1',new Date(),base);await flush();assert.equal(f.controller.snapshot().status,'ready'); }

test('only plain official device verification routes open externally',()=>{
  for(const url of ['https://auth.openai.com/codex/device','https://github.com/login/device','https://help.openai.com/']) assert.equal(allowedExternal(url),true);
  for(const url of ['https://auth.openai.com/codex/device?user_code=fixture','https://github.com/login/device?code=fixture','https://github.com/login/oauth/authorize','https://auth.openai.com/oauth/authorize','https://auth.openai.com.evil.invalid/codex/device','http://github.com/login/device','https://u:p@github.com/login/device','https://github.com:444/login/device','https://github.com/login/device#fixture']) assert.equal(allowedExternal(url),false,url);
});
test('updater IPC trusts only the selected HTTPS main frame and sender',()=>{
  const frame={url:'https://fleet.lan:8443/workers'},webContents={mainFrame:frame},window={webContents};
  assert.equal(trustedWorkspace({sender:webContents,senderFrame:frame},window,'https://fleet.lan:8443'),true);
  assert.equal(trustedWorkspace({sender:webContents,senderFrame:{url:frame.url}},window,'https://fleet.lan:8443'),false);
  assert.equal(trustedWorkspace({sender:{},senderFrame:frame},window,'https://fleet.lan:8443'),false);
  frame.url='https://other.lan/';assert.equal(trustedWorkspace({sender:webContents,senderFrame:frame},window,'https://fleet.lan:8443'),false);
});
test('numeric versions compare correctly and malformed versions fail',()=>{
  assert.equal(compareVersions('0.10.0','0.9.9'),1);assert.equal(compareVersions('0.1.0','0.1.0'),0);assert.equal(compareVersions('0.1.0','1.0.0'),-1);
  for(const value of ['1.2','1.2.3-beta','01.2.3','1.2.99999999999999999999'])assert.throws(()=>compareVersions(value,'0.1.0'));
});
test('manifest binds stable main identity, exact feed bytes and published package size',()=>{
  assert.equal(candidate.version,'0.1.1');
  for(const patch of [{updateChannel:'preservation'},{sourceBranch:'ai/task'},{unsigned:false},{version:'0.1.2'},{source:'invalid'}])assert.throws(()=>validateManifest({...manifest,...patch},validateRelease(releaseValue),feed));
  assert.throws(()=>validateManifest(manifest,validateRelease(releaseValue),feed.replace('100','101')));
  assert.throws(()=>validateRelease({...releaseValue,html_url:'https://evil.invalid/release'}));
});
test('download transport rejects arbitrary API, local and credential destinations',()=>{
  assert.equal(allowedDownload(RELEASES_API),true);assert.equal(allowedDownload(`${base}/RELEASES`),true);
  for(const url of ['http://github.com/a','https://api.github.com/user','https://github.com/another/project/releases/download/x/RELEASES','https://user:fixture@github.com/Ding-Ding-Projects/slop-machine-fleet/releases/download/x/RELEASES','https://localhost/RELEASES'])assert.equal(allowedDownload(url),false);
});
test('release discovery skips preservation and proves annotated tag plus main ancestry',async()=>{
  const preservation={...releaseValue,tag_name:'preservation',html_url:'https://github.com/Ding-Ding-Projects/slop-machine-fleet/releases/tag/preservation',assets:releaseValue.assets.map(asset=>({...asset,browser_download_url:asset.browser_download_url.replace(tag,'preservation')}))};
  const seen=[];
  const read=async url=>{seen.push(url);if(url===RELEASES_API)return JSON.stringify([preservation,releaseValue]);if(url.includes('/download/preservation/source-manifest'))return JSON.stringify({...manifest,updateChannel:'preservation',sourceBranch:'ai/task'});if(url===`${base}/source-manifest.json`)return JSON.stringify(manifest);if(url===`${base}/RELEASES`)return feed;if(url===`${API_ROOT}/git/ref/tags/${tag}`)return JSON.stringify({object:{type:'tag',sha:'d'.repeat(40)}});if(url===`${API_ROOT}/git/tags/${'d'.repeat(40)}`)return JSON.stringify({object:{type:'commit',sha}});if(url===`${API_ROOT}/compare/${sha}...main`)return JSON.stringify({status:'ahead',base_commit:{sha}});throw Error('Unexpected fixture route');};
  assert.equal((await discoverRelease('0.1.0',read)).version,'0.1.1');
  assert.ok(!seen.some(url=>url.includes('/download/preservation/RELEASES')));
  await assert.rejects(verifySource(tag,sha,async()=>JSON.stringify({object:{type:'commit',sha:'e'.repeat(40)}})),/does not match/);
  await assert.rejects(verifySource(tag,sha,async url=>url.includes('/compare/')?JSON.stringify({status:'diverged',base_commit:{sha}}):JSON.stringify({object:{type:'commit',sha}})),/not verified/);
});
test('development, portable and missing Update.exe never enable updates',async()=>{
  assert.equal(await installedSupport({packaged:false,platform:'win32',execPath:'C:/app-0.1.0/Fleet.exe',version:'0.1.0'}),false);
  assert.equal(await installedSupport({packaged:true,platform:'win32',execPath:'C:/portable/Fleet.exe',version:'0.1.0'},async()=>({isFile:()=>true})),false);
  assert.equal(await installedSupport({packaged:true,platform:'win32',execPath:'C:/app-0.1.0/Fleet.exe',version:'0.1.0'},async()=>{throw Error('absent');}),false);
  const f=fixture({supported:false});await f.controller.check();assert.equal(f.updater.checks,0);assert.equal(f.controller.snapshot().status,'unavailable');
});
test('parallel checks serialize and ready download is never automatically installed',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=fixture({discover:()=>waiting});
  const first=f.controller.check();await f.controller.check();release(candidate);await first;assert.equal(f.updater.checks,1);
  f.updater.emit('update-downloaded',{},'private raw notes','0.1.1',new Date(),base);await flush();
  assert.equal(f.controller.snapshot().status,'ready');assert.equal(f.updater.quits,0);assert.ok(!JSON.stringify(f.controller.snapshot()).includes('private raw notes'));
  await f.controller.check();f.controller.later();assert.equal(f.updater.checks,1);assert.equal(f.controller.snapshot().status,'ready');
});
test('mismatched native identity and raw native errors never become ready or leak details',async()=>{
  const f=fixture();await f.controller.check();f.updater.emit('update-downloaded',{},'','9.9.9',new Date(),base);await flush();assert.equal(f.controller.snapshot().code,'download-identity-mismatch');assert.equal(f.updater.quits,0);
  const g=fixture();await g.controller.check();g.updater.emit('error',new Error('fixture-auth-value'));assert.equal(g.controller.snapshot().code,'native-error');assert.ok(!JSON.stringify(g.controller.snapshot()).includes('fixture-auth-value'));
});
test('unknown, stale, disconnected, dirty or active work blocks restart before confirmation',async()=>{
  let confirmations=0;const f=fixture({confirm:async()=>{confirmations++;return true;}});await ready(f);
  assert.equal((await f.controller.requestRestart()).ok,false);
  for(const patch of [{reachable:false},{dirty:true},{activeTasks:true},{pendingWrites:true},{authenticated:false}]){f.controller.reportSafety({...safe,...patch});assert.equal((await f.controller.requestRestart()).ok,false);}
  f.controller.reportSafety(safe);f.advance(6001);assert.equal((await f.controller.requestRestart()).ok,false);assert.equal(confirmations,0);assert.equal(f.updater.quits,0);
});
test('native Later and state changes during confirmation preserve the running application',async()=>{
  const later=fixture({confirm:async()=>false});await ready(later);later.controller.reportSafety(safe);assert.equal((await later.controller.requestRestart()).code,'later');assert.equal(later.updater.quits,0);
  let accept;const f=fixture({confirm:()=>new Promise(resolve=>{accept=resolve;})});await ready(f);f.controller.reportSafety(safe);const pending=f.controller.requestRestart();f.controller.reportSafety({...safe,dirty:true});f.controller.reportSafety(safe);accept(true);assert.equal((await pending).code,'workspace-changed');assert.equal(f.updater.quits,0);
});
test('only explicit native confirmation with fresh unchanged safety invokes application restart',async()=>{
  const f=fixture();await ready(f);f.controller.reportSafety(safe);assert.equal((await f.controller.requestRestart()).ok,true);assert.equal(f.updater.quits,1);assert.equal(f.controller.snapshot().status,'restarting');assert.equal((await f.controller.requestRestart()).ok,false);assert.equal(f.updater.quits,1);
});
test('first-run delay and native timeout are bounded without launching overlapping downloads',async()=>{
  const f=fixture();f.controller.start(true);assert.equal(f.timers[0].ms,20000);await f.controller.check();const watchdog=f.timers.find(timer=>timer.ms===300000);watchdog.fn();assert.equal(f.controller.snapshot().code,'native-timeout');await f.controller.check();assert.equal(f.updater.checks,1);f.updater.emit('update-downloaded',{},'','0.1.1',new Date(),base);await flush();assert.equal(f.controller.snapshot().status,'ready');f.controller.dispose();
});
