import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {assertGeneratedBytes,assertArchiveEntries,peDebugTypes} from './generated-payload-privacy.mjs';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'apps/desktop/package.json'),'utf8'));
const identity=await fs.readFile(path.join(root,'build-identity.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return{mode:'local',version:pkg.version};throw error;});
const require=createRequire(path.join(root,'apps/desktop/package.json'));
const asar=require('@electron/asar');
const desktopArchive=path.join(root,'apps/desktop/release/win-unpacked/resources/app.asar');
assertArchiveEntries(asar.listPackage(desktopArchive),'desktop');assertGeneratedBytes(await fs.readFile(desktopArchive),'desktop ASAR');
const packed=JSON.parse(asar.extractFile(desktopArchive,'package.json').toString('utf8'));
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
  const archive=path.join(root,`apps/desktop/release/companions/${mode}/win-unpacked/resources/app.asar`);
  assertArchiveEntries(asar.listPackage(archive),mode);assertGeneratedBytes(await fs.readFile(archive),`${mode} companion ASAR`);
  const unpacked=path.join(root,`apps/desktop/release/companions/${mode}/win-unpacked/resources/app.asar.unpacked/protect-config.ps1`);
  const helper=await fs.readFile(unpacked),source=await fs.readFile(path.join(root,'apps/desktop/companions/protect-config.ps1'));
  if(asar.statFile(archive,'protect-config.ps1').unpacked!==true||!helper.equals(source)||generated.nativeHelper?.name!=='protect-config.ps1'||generated.nativeHelper.bytes!==helper.length||generated.nativeHelper.sha256!==createHash('sha256').update(helper).digest('hex'))throw Error('Companion native helper is not the exact inventoried unpacked source file.');
}
assertGeneratedBytes(await fs.readFile(path.join(root,'release/worker/Fleet.Worker.exe')),'worker executable');
const managed=await fs.readFile(path.join(root,'worker/bin/Release/net8.0-windows/win-x64/Fleet.Worker.dll'));
assertGeneratedBytes(managed,'managed worker payload');const debugTypes=peDebugTypes(managed);
if(debugTypes.includes(2)||debugTypes.includes(17))throw Error('Managed worker payload still contains CodeView or embedded debug symbols.');
for(const value of ['build-identity.json','apps/web/dist/build-version.json','apps/docs/src/content.generated.json']){const file=path.join(root,value);try{assertGeneratedBytes(await fs.readFile(file),value);}catch(error){if(error.code!=='ENOENT')throw error;}}
console.log(`Actual ASAR, renderer bundles and companion embedded version verified: ${identity.version}.`);
