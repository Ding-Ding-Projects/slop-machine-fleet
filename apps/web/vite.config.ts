import { defineConfig } from 'vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const designRoot=new URL('../../design/design-system/',import.meta.url);
const packageVersion:unknown=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;
if(typeof packageVersion!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(packageVersion))throw new Error('Web package version must use major.minor.patch with an optional version suffix.');
export default defineConfig({
 server:{proxy:{'/api':'http://127.0.0.1:3000'}},
 build:{outDir:'dist',sourcemap:false},
 define:{__APP_VERSION__:JSON.stringify(packageVersion),__BUILD_TIME__:JSON.stringify(process.env.FLEET_BUILD_TIME||'')},
 plugins:[{
  name:'preserved-design-font-provenance',
  generateBundle(){
   const fontFiles=['Geist-Variable.woff2','GeistMono-Variable.woff2','MaterialSymbolsRounded.woff2'];
   const fonts=fontFiles.map(name=>{const bytes=readFileSync(fileURLToPath(new URL(`fonts/${name}`,designRoot)));return {name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};});
   for(const name of ['LICENSE-Geist.txt','LICENSE-MaterialSymbols.txt'])this.emitFile({type:'asset',fileName:`licenses/${name}`,source:readFileSync(fileURLToPath(new URL(`fonts/${name}`,designRoot)))});
   this.emitFile({type:'asset',fileName:'design-font-provenance.json',source:JSON.stringify({schemaVersion:1,designVersion:2,source:'design/design-system/fonts',fonts},null,2)});
  }
 }]
});

