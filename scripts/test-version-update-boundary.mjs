import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
import {deriveVersion} from './release-version.mjs';
const require=createRequire(import.meta.url);const {DesktopUpdates}=require('../apps/desktop/updates.cjs');
async function check(version){
  const updater=new EventEmitter(),calls=[];
  updater.setFeedURL=value=>calls.push(['feed',value.url]);updater.checkForUpdates=()=>calls.push(['check']);updater.quitAndInstall=()=>{throw Error('No native updater may run in this fixture.');};
  const controller=new DesktopUpdates({updater,currentVersion:'0.1.2',supported:true,discover:async()=>({version,feedUrl:'https://example.invalid/explicit-test-feed'}),confirm:async()=>false,schedule:()=>({unref(){}}),unschedule:()=>{}});
  try{return{state:await controller.check(),calls};}finally{controller.dispose();}
}
test('genuinely newer derived version reaches only the injected updater interface',async()=>{const result=await check(deriveVersion('0','16','1'));assert.equal(result.state.availableVersion,'0.16.1');assert.deepEqual(result.calls.map(call=>call[0]),['feed','check']);});
test('equal and older versions remain current without any updater-interface call',async()=>{for(const version of ['0.1.2','0.1.1']){const result=await check(version);assert.equal(result.state.status,'current');assert.deepEqual(result.calls,[]);}});
