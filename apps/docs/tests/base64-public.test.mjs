import test from 'node:test';
import assert from 'node:assert/strict';
import {claimTemporary as rawClaim,TEMP_DIRECTORY} from '../../../packages/shared/local-base64/storage.mjs';
import {claimTemporary,createTemporarySink,removeTemporary,PUBLIC_TEMP_ROOT} from '../src/base64-storage.mjs';
import {openHistory,PUBLIC_HISTORY_NAME} from '../src/base64-history.mjs';
import {publicIsolation} from '../public-isolation.mjs';
class Directory{
 constructor(){this.directories=new Map();this.files=new Map();}
 async getDirectoryHandle(name,{create=false}={}){if(!this.directories.has(name)){if(!create)throw new DOMException('Missing','NotFoundError');this.directories.set(name,new Directory());}return this.directories.get(name);}
 async getFileHandle(name,{create=false}={}){if(!this.files.has(name)){if(!create)throw new DOMException('Missing','NotFoundError');this.files.set(name,new Uint8Array());}const files=this.files;return {getFile:async()=>new Blob([files.get(name)]),createWritable:async()=>({write:async value=>files.set(name,new Uint8Array(value)),close:async()=>{},abort:async()=>{}})};}
 async removeEntry(name){if(!this.files.delete(name))throw new DOMException('Missing','NotFoundError');}
}
test('public acquisition, worker sink and cleanup cannot touch an application claim with the same ID',async()=>{
 const root=new Directory(),storage={getDirectory:async()=>root,estimate:async()=>({quota:1e8,usage:0})},names=[],locks={request:async(name,_options,action)=>{names.push(name);return action();}};
 const options={consent:true,expectedBytes:100,storage,locks,id:'11111111-1111-1111-1111-111111111111',owner:'22222222-2222-2222-2222-222222222222'};
 const privateClaim=await rawClaim(options);
 await assert.rejects(rawClaim(options),/storage-collision/);
 const publicClaim=await claimTemporary(options);
 const output=await createTemporarySink({claim:publicClaim,storage,locks});await output.write(new Uint8Array([1,2,3]));await output.seal();await output.commit();assert.deepEqual([...new Uint8Array(await(await output.file()).arrayBuffer())],[1,2,3]);
 await removeTemporary(publicClaim,storage,locks);
 const privateDirectory=await root.getDirectoryHandle(TEMP_DIRECTORY),publicDirectory=await(await root.getDirectoryHandle(PUBLIC_TEMP_ROOT)).getDirectoryHandle(TEMP_DIRECTORY);
 assert.equal(privateDirectory.files.has(privateClaim.id+'.owner'),true);assert.equal(publicDirectory.files.size,0);assert.ok(names.some(name=>name.startsWith('fleet.docs:')));assert.ok(names.some(name=>!name.startsWith('fleet.docs:')));
});
test('history adapter uses the public database name rather than the application name',async()=>{let name='';const factory={open(value){name=value;const request={};queueMicrotask(()=>{request.error=Error('fixture');request.onerror();});return request;}};await assert.rejects(openHistory(factory));assert.equal(name,PUBLIC_HISTORY_NAME);});
function runGuard(ids,importers={}){const outputs=[];publicIsolation().generateBundle.call({getModuleIds:()=>ids,getModuleInfo:id=>({importers:importers[id]||[]}),error:message=>{throw Error(message);},emitFile:value=>outputs.push(value)});return outputs;}
test('public bundle guard rejects every original forbidden state module',()=>{for(const file of ['preferences.tsx','wording.mjs','api.ts'])assert.throws(()=>runGuard([`/project/apps/web/src/${file}`]),/must not bundle/);});
test('missing storage adapter in a worker import is a build failure, not a private-scope fallback',()=>{const storage='/project/packages/shared/local-base64/storage.mjs',worker='/project/apps/web/src/tools/base64-stream-worker.js';assert.throws(()=>runGuard([storage,worker],{[storage]:[worker]}),/scoped adapter/);assert.doesNotThrow(()=>runGuard([storage],{[storage]:['/project/apps/docs/src/base64-storage.mjs']}));});
test('all actual tool preference and storage entrypoints resolve to public adapters in worker and main plugins',()=>{for(const worker of [false,true]){const plugin=publicIsolation(worker);for(const file of ['Base64Tool.tsx','Base64History.tsx','StreamingBase64.tsx','StreamOutput.tsx','Output.tsx','useToolCue.ts','Base64Notices.tsx'])assert.match(plugin.resolveId('../preferences',`/project/apps/web/src/tools/${file}`),/[\\/]docs[\\/]src[\\/]preferences.tsx$/);for(const file of ['useBase64Stream.ts','base64-stream-worker.js','temporary-cleanup.mjs'])assert.match(plugin.resolveId('../../../../packages/shared/local-base64/storage.mjs',`/project/apps/web/src/tools/${file}`),/base64-storage.mjs$/);}});
