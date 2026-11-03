#!/usr/bin/env node
// The public project stores this method, never the private source or expected digest.
// This checks local possession and currency, not whether conversation followed it.
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function sourceDigest(text){
  const start=text.indexOf('## Vocabulary and locations');
  const end=text.indexOf('## Secrets and sensitive input',start);
  if(start<0||end<=start)throw new Error('PRIVATE_RULES_BOUNDARIES_MISSING');
  return createHash('sha256').update(text.slice(start,end).replace(/\r\n/g,'\n')).digest('hex');
}
export function inspectSource(source){
  if(statSync(source).size>4*1024*1024)throw new Error('PRIVATE_RULES_SOURCE_OVERSIZED');
  const actual=sourceDigest(readFileSync(source,'utf8'));
  const lock=join(dirname(source),'.vocab-lock');
  if(!existsSync(lock)||statSync(lock).size>80)throw new Error('PRIVATE_RULES_LOCK_UNAVAILABLE');
  const expected=readFileSync(lock,'utf8').trim();
  if(!/^[a-f0-9]{64}$/.test(expected)||expected!==actual)throw new Error('PRIVATE_RULES_STALE');
  return true;
}
function privateSource(){
  let documents=join(homedir(),'Documents');
  if(process.platform==='win32'){
    try{const known=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Environment]::GetFolderPath("MyDocuments")'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();if(known)documents=known;}catch{}
  }
  return join(documents,'GitHub','agent-global-memory','memory','SHARED_INSTRUCTIONS.md');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.slice(2).some(arg=>arg!=='--relock'))throw new Error('PRIVATE_RULES_ARGUMENT_INVALID');
    const source=privateSource();
    if(!existsSync(source)){
      if(existsSync(join(homedir(),'.agents','skills','agent-global-memory','SKILL.md')))throw new Error('PRIVATE_RULES_SOURCE_UNAVAILABLE');
      console.log('SKIP: private source is absent, as expected for an outside contributor.');
    }else{
      if(process.argv.includes('--relock')){
        if(statSync(source).size>4*1024*1024)throw new Error('PRIVATE_RULES_SOURCE_OVERSIZED');
        writeFileSync(join(dirname(source),'.vocab-lock'),sourceDigest(readFileSync(source,'utf8'))+'\n',{mode:0o600});
        console.log('PASS: local private lock refreshed after source review; no value was published.');
      }else{inspectSource(source);console.log('PASS: private source is present, locked and current.');}
    }
  }catch(error){console.error(String(error.message));process.exitCode=1;}
}
