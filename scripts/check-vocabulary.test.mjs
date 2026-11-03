import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sourceDigest,inspectSource} from './check-vocabulary.mjs';
test('currency rejects missing and stale locks and accepts the exact normalized section',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fleet-currency-'));
 const source=path.join(root,'instructions.md'),lock=path.join(root,'.vocab-lock');
 const original='prefix\n## Vocabulary and locations\nneutral fixture one\n## Secrets and sensitive input\nsuffix\n';
 try{
  fs.writeFileSync(source,original);assert.throws(()=>inspectSource(source),/LOCK_UNAVAILABLE/);
  fs.writeFileSync(lock,sourceDigest(original)+'\n');assert.equal(inspectSource(source),true);
  fs.writeFileSync(source,original.replaceAll('\n','\r\n'));assert.equal(inspectSource(source),true);
  fs.writeFileSync(source,original.replace('fixture one','fixture two'));assert.throws(()=>inspectSource(source),/STALE/);
  assert.throws(()=>sourceDigest('no section markers'),/BOUNDARIES_MISSING/);
 }finally{
  const relative=path.relative(fs.realpathSync(os.tmpdir()),fs.realpathSync(root));
  assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(relative).startsWith('fleet-currency-'));
  fs.rmSync(root,{recursive:true,force:true});
 }
});
