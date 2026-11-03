import test from 'node:test';import assert from 'node:assert/strict';
import {assertGeneratedBytes,assertArchiveEntries} from './generated-payload-privacy.mjs';
test('actual-byte privacy guard rejects UTF-8/UTF-16 and escaped staging paths without repeating values',()=>{
  for(const encoding of ['utf8','utf16le'])for(const marker of ['/fixture-source/temporary','\\fixture-source\\temporary','.agent/build-stages/fixture']){
    let failure;try{assertGeneratedBytes(Buffer.from(marker,encoding),'fixture payload',{roots:['/fixture-source','\\fixture-source']});}catch(error){failure=error;}
    assert.ok(failure);assert.ok(!failure.message.includes(marker));
  }
  assertGeneratedBytes(Buffer.from('{"source":"'+'a'.repeat(40)+'","version":"0.16.1"}'),'public identity',{roots:['/fixture-source']});
});
test('archive guard requires productive runtime inputs and rejects builder configuration and intermediate trees',()=>{
  const desktop=['package.json','dist/main.cjs','dist/preload.cjs','dist/connect.html','dist/connect.js','dist/connect.css','dist/external-links.cjs','dist/update-feed.cjs','dist/updates.cjs'];
  assertArchiveEntries(desktop,'desktop');
  assert.throws(()=>assertArchiveEntries([...desktop,'dist/companions/build/builder.json'],'desktop'));
  assert.throws(()=>assertArchiveEntries(desktop.filter(name=>name!=='dist/preload.cjs'),'desktop'));
  const companion=['package.json','main.cjs','preload.cjs','actions.cjs','protect-config.ps1','index.html','reader.js','ui.js','style.css','mode.json','articles.json','assets.json'];
  assertArchiveEntries(companion,'build');assert.throws(()=>assertArchiveEntries([...companion,'builder.json'],'build'));assert.throws(()=>assertArchiveEntries([...companion,'actions.test.cjs'],'build'));
});
