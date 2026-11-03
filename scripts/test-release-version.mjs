import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {deriveVersion,deriveIdentity,validateIdentity,compareVersions,applyOverlay} from './release-version.mjs';
const policy={schemaVersion:1,epoch:0,componentMaximum:65534,repository:'Ding-Ding-Projects/slop-machine-fleet',workflowId:'405397166',workflowPath:'.github/workflows/release.yml'};
const source='a'.repeat(40);
const context={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:policy.repository,GITHUB_SHA:source,GITHUB_RUN_ID:'100',GITHUB_RUN_NUMBER:'16',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/main'};
const run={workflow_id:405397166,path:policy.workflowPath,event:'push',head_sha:source,id:100,run_number:16,run_attempt:1,head_branch:'main'};
test('deterministic numeric versions order later runs and attempts without equal-version bypass',()=>{
  assert.equal(deriveVersion('0','16','1'),'0.16.1');
  assert.equal(deriveVersion('0','16','1'),deriveVersion('0','16','1'));
  assert.equal(compareVersions('0.16.1','0.1.2'),1);
  assert.equal(compareVersions('0.17.1','0.16.9'),1);
  assert.equal(compareVersions('0.16.2','0.16.1'),1);
  assert.equal(compareVersions('0.7.2','0.11.1'),-1);
  assert.equal(compareVersions('0.16.1','0.16.1'),0);
});
test('shared .NET component bounds and exact integer strings fail closed',()=>{
  assert.equal(deriveVersion('65534','65534','65534'),'65534.65534.65534');
  for(const bad of ['65535','-1','1.5','01','1e2','',1,null])assert.throws(()=>deriveVersion('0',bad,'1'));
  assert.throws(()=>deriveVersion('0','1','0'));
});
test('provider workflow, source and run identity cannot reset or be relabelled',()=>{
  const identity=deriveIdentity(run,context,policy,{'package.json':'0.1.2'});
  assert.equal(validateIdentity(identity,policy).version,'0.16.1');
  for(const changed of [{workflow_id:1},{path:'other.yml'},{head_sha:'b'.repeat(40)},{run_number:17},{run_attempt:2}])assert.throws(()=>deriveIdentity({...run,...changed},context,policy,{'package.json':'0.1.2'}));
  assert.throws(()=>validateIdentity({...identity,version:'0.16.2'},policy));
});
test('explicit overlay updates packages, locks and worker metadata while retaining base-version receipts',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fleet-version-overlay-'));
  try{
    await fs.mkdir(path.join(root,'apps/desktop'),{recursive:true});await fs.mkdir(path.join(root,'worker'));
    await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'fixture-root',version:'0.1.2',workspaces:['apps/desktop']}));
    await fs.writeFile(path.join(root,'apps/desktop/package.json'),JSON.stringify({name:'@fleet/desktop',version:'0.1.2',dependencies:{external:'1.2.3'}}));
    await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,version:'0.1.2',packages:{'':{version:'0.1.2'},'apps/desktop':{version:'0.1.2'}}}));
    await fs.writeFile(path.join(root,'worker/Fleet.Worker.csproj'),'<Project><PropertyGroup><Version>0.1.2</Version></PropertyGroup></Project>');
    const base={'package.json':'0.1.2','apps/desktop/package.json':'0.1.2'};
    const identity=deriveIdentity(run,context,policy,base);await applyOverlay(root,identity,policy);
    const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
    assert.equal(lock.version,'0.16.1');assert.equal(lock.packages['apps/desktop'].version,'0.16.1');
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'apps/desktop/package.json'),'utf8')).version,'0.16.1');
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'apps/desktop/package.json'),'utf8')).dependencies.external,'1.2.3');
    const worker=await fs.readFile(path.join(root,'worker/Fleet.Worker.csproj'),'utf8');assert.match(worker,/<AssemblyVersion>0\.16\.1\.0/);assert.match(worker,/<IncludeSourceRevisionInInformationalVersion>false/);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'build-identity.json'),'utf8')).baseVersions,base);
    await assert.rejects(()=>applyOverlay(root,identity,policy));
  }finally{await fs.rm(root,{recursive:true});}
});
test('overlay internal exact references permit a real offline npm lock and restore',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fleet-version-restore-'));
  try{
    await fs.mkdir(path.join(root,'apps/service'),{recursive:true});await fs.mkdir(path.join(root,'packages/shared'),{recursive:true});await fs.mkdir(path.join(root,'worker'));
    await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'fixture-root',version:'0.1.2',workspaces:['apps/service','packages/shared']}));
    await fs.writeFile(path.join(root,'apps/service/package.json'),JSON.stringify({name:'@fleet/service',version:'0.1.2',dependencies:{'@fleet/shared':'0.1.0'}}));
    await fs.writeFile(path.join(root,'packages/shared/package.json'),JSON.stringify({name:'@fleet/shared',version:'0.1.0'}));
    await fs.writeFile(path.join(root,'worker/Fleet.Worker.csproj'),'<Project><PropertyGroup><Version>0.1.2</Version></PropertyGroup></Project>');
    const npm=command=>execFileSync(process.platform==='win32'?process.env.ComSpec:'sh',process.platform==='win32'?['/d','/c',`npm.cmd ${command}`]:['-c',`npm ${command}`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
    npm('install --package-lock-only --ignore-scripts --offline --no-audit --no-fund');
    await applyOverlay(root,deriveIdentity(run,context,policy,{'package.json':'0.1.2','apps/service/package.json':'0.1.2','packages/shared/package.json':'0.1.0'}),policy);
    const service=JSON.parse(await fs.readFile(path.join(root,'apps/service/package.json'),'utf8'));
    const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
    assert.equal(service.dependencies['@fleet/shared'],'0.16.1');assert.equal(lock.packages['apps/service'].dependencies['@fleet/shared'],'0.16.1');
    npm('ci --ignore-scripts --offline --no-audit --no-fund');
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'node_modules/@fleet/shared/package.json'),'utf8')).version,'0.16.1');
  }finally{await fs.rm(root,{recursive:true});}
});
