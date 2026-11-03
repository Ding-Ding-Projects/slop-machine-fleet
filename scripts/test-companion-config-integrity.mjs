import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('invalid native helper blocks before retained configuration or temporary replacement is written',async()=>{
  const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'fleet-helper-integrity-'));
  try{
    const previous='FLEET_HOST=old.lan\nUNRELATED_SETTING=retained\n';await fsp.writeFile(path.join(directory,'.env'),previous);
    await fsp.writeFile(path.join(directory,'protect-config.ps1'),'# explicit fixture');
    await fsp.writeFile(path.join(directory,'mode.json'),JSON.stringify({nativeHelper:{name:'protect-config.ps1',bytes:18,sha256:'0'.repeat(64)}}));
    let nativeCalls=0;
    const sandbox={module:{exports:{}},__dirname:directory,process:{platform:'win32'},require:name=>name==='node:child_process'?{spawn:()=>{nativeCalls++;throw Error('Native execution is forbidden in this fixture.');}}:require(name)};
    vm.runInNewContext(fs.readFileSync(new URL('../apps/desktop/companions/actions.cjs',import.meta.url),'utf8'),sandbox);
    await assert.rejects(()=>sandbox.module.exports.saveConfig(directory,{FLEET_HOST:'fleet.lan',FLEET_HTTPS_PORT:'8443',FLEET_IMAGE:'ghcr.io/ding-ding-projects/slop-machine-fleet:fixture'}),/hash/);
    assert.equal(nativeCalls,0);assert.equal(await fsp.readFile(path.join(directory,'.env'),'utf8'),previous);assert.deepEqual((await fsp.readdir(directory)).sort(),['.env','mode.json','protect-config.ps1']);
  }finally{await fsp.rm(directory,{recursive:true});}
});
