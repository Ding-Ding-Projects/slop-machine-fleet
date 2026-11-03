import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'apps/desktop/package.json'),'utf8'));
const identity=await fs.readFile(path.join(root,'build-identity.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return{mode:'local',version:pkg.version};throw error;});
const require=createRequire(path.join(root,'apps/desktop/package.json'));
const asar=require('@electron/asar');
const packed=JSON.parse(asar.extractFile(path.join(root,'apps/desktop/release/win-unpacked/resources/app.asar'),'package.json').toString('utf8'));
const web=JSON.parse(await fs.readFile(path.join(root,'apps/web/dist/build-version.json'),'utf8'));
const docs=JSON.parse(await fs.readFile(path.join(root,'apps/docs/src/content.generated.json'),'utf8'));
if(packed.version!==identity.version||web.version!==identity.version||docs.version!==identity.version)throw Error('Packaged desktop, compiled web or documentation version differs from the build identity.');
if(['provider-overlay','local-overlay'].includes(identity.mode)&&(web.source!==identity.source||docs.commit!==identity.source))throw Error('Compiled source identities differ from the version overlay.');
for(const app of ['web','docs']){
  const directory=path.join(root,`apps/${app}/dist/assets`);let embedded=false;
  for(const name of await fs.readdir(directory))if(name.endsWith('.js')&&(await fs.readFile(path.join(directory,name),'utf8')).includes(identity.version))embedded=true;
  if(!embedded)throw Error(`The ${app} compiled renderer does not contain its declared visible version.`);
}
for(const mode of ['build','host','docs']){
  const generated=JSON.parse(await fs.readFile(path.join(root,`apps/desktop/dist/companions/${mode}/mode.json`),'utf8'));
  if(generated.version!==identity.version)throw Error('Companion embedded version differs from the release identity.');
}
console.log(`Actual ASAR, renderer bundles and companion embedded version verified: ${identity.version}.`);
