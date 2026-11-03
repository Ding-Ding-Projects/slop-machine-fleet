import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {loadConfigFromFile} from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const canonical=path.join(root,'src/preferences.tsx').replaceAll('\\','/');
const loaded=await loadConfigFromFile({command:'build',mode:'test'},path.join(root,'vite.config.ts'),root);
const plugin=loaded.config.plugins.find(value=>value?.name==='public-docs-preferences');
assert.equal(typeof plugin?.resolveId,'function');

async function compile(useBrokenIdentity=false){
 const result=await build({stdin:{contents:`import React from 'react';import {renderToString} from 'react-dom/server';import {UIProvider} from './src/preferences';import {Search} from '../web/src/Search';export function render(){return renderToString(React.createElement(UIProvider,null,React.createElement(Search,{label:'Context identity fixture',state:{query:'',flags:'i',regex:false},onChange:()=>{}})));}`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom/server','react/jsx-runtime'],logLevel:'silent',plugins:[{
  name:'preserve-real-resolver-identities',
  setup(bundler){
   bundler.onResolve({filter:/preferences(?:\.tsx)?$/},args=>{
    if(args.importer.replaceAll('\\','/').endsWith('/web/src/Search.tsx')){
     const resolved=plugin.resolveId.call({},args.path,args.importer);
     assert.equal(typeof resolved,'string');
     return {path:useBrokenIdentity?resolved.replaceAll('/','\\'):resolved,namespace:'exact-module-identity'};
    }
    if(args.path==='./src/preferences')return {path:canonical,namespace:'exact-module-identity'};
   });
   bundler.onLoad({filter:/.*/,namespace:'exact-module-identity'},args=>({contents:fs.readFileSync(args.path.replaceAll('\\','/'),'utf8'),loader:'tsx',resolveDir:path.join(root,'src')}));
  }
 }]});
 const module={exports:{}};
 new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 return module.exports.render;
}

test('actual documentation provider and shared Search render through one resolver identity',async()=>{
 const render=await compile();
 assert.match(render(),/Context identity fixture/);
});
test('reintroducing a Windows separator identity split makes the same real components fail',async()=>{
 const render=await compile(true);
 assert.throws(render,error=>error instanceof TypeError&&/null/.test(error.message));
});
