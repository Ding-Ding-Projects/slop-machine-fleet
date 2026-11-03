import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {numericVersion,compareVersions,validateIdentity,deriveIdentity} from './release-version.mjs';

export function assertNewer(candidate, history) {
  numericVersion(candidate);
  const highest=history.reduce((best,item)=>!best||compareVersions(item.version,best.version)>0?item:best,null);
  if(highest&&compareVersions(candidate,highest.version)<=0)throw Error(`Stable candidate ${candidate} is not newer than accepted ${highest.version} (${highest.tag}). Start a new source-bound workflow run; equal-version publication is not allowed.`);
  return highest;
}
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export async function acceptedHistory(releases,api,download,main) {
  const history=[];
  for(const release of releases) {
    if(release.draft===true||release.prerelease===true)continue;
    if(release.draft!==false||release.prerelease!==false||typeof release.tag_name!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(release.tag_name))throw Error('Published release history metadata is invalid.');
    const tag=release.tag_name;
    const records=release.assets.filter(asset=>asset.name==='source-manifest.json');
    if(records.length!==1||records[0].size<1||records[0].size>1048576)throw Error(`Possible stable history ${tag} has no bounded source manifest.`);
    const manifest=JSON.parse((await download(tag,'source-manifest.json')).toString('utf8').replace(/^\uFEFF/,''));
    if(!/^[a-f0-9]{40}$/.test(manifest.source??'')||manifest.unsigned!==true||!Array.isArray(manifest.files))throw Error(`Source manifest history is incomplete for ${tag}.`);
    if(manifest.updateChannel==='preservation'&&typeof manifest.sourceBranch==='string'&&manifest.sourceBranch&&manifest.sourceBranch!=='main')continue;
    const legacy=manifest.updateChannel===undefined&&manifest.sourceBranch===undefined;
    if(!legacy&&(manifest.updateChannel!=='stable'||manifest.sourceBranch!=='main'))throw Error(`Release channel history is contradictory for ${tag}.`);
    let object=(await api(`git/ref/tags/${tag}`)).object;
    for(let depth=0;object?.type==='tag'&&depth<3;depth++)object=(await api(`git/tags/${object.sha}`)).object;
    if(object?.type!=='commit'||object.sha!==manifest.source)throw Error(`Release tag source differs from history manifest for ${tag}.`);
    const comparison=await api(`compare/${manifest.source}...${main}`);
    if(!['ahead','identical'].includes(comparison.status)||comparison.merge_base_commit?.sha!==manifest.source){if(legacy)continue;throw Error(`Declared stable source is outside authenticated main for ${tag}.`);}
    const feedRecord=manifest.files.filter(file=>file.name==='RELEASES');
    const feedAsset=release.assets.filter(file=>file.name==='RELEASES');
    if(feedRecord.length!==1||feedAsset.length!==1||feedRecord[0].bytes!==feedAsset[0].size||!/^[a-f0-9]{64}$/i.test(feedRecord[0].sha256??''))throw Error(`Stable feed inventory is invalid for ${tag}.`);
    const feed=await download(tag,'RELEASES');
    if(feed.length!==feedRecord[0].bytes||digest(feed)!==feedRecord[0].sha256.toLowerCase())throw Error(`Stable feed hash differs for ${tag}.`);
    const full=[];
    for(const line of feed.toString('utf8').trim().split(/\r?\n/)){
      const match=/^([a-f0-9]{40})\s+(SlopMachineFleet-([0-9]+\.[0-9]+\.[0-9]+)-(full|delta)\.nupkg)\s+([1-9][0-9]*)$/i.exec(line);
      if(!match)throw Error(`Stable feed format is invalid for ${tag}.`);
      numericVersion(match[3]);
      if(match[4]==='full'){
        const entry=manifest.files.find(file=>file.name===match[2]),asset=release.assets.find(file=>file.name===match[2]);
        if(!entry||!asset||entry.bytes!==Number(match[5])||asset.size!==entry.bytes||!/^[a-f0-9]{64}$/i.test(entry.sha256??''))throw Error(`Stable full package metadata differs for ${tag}.`);
        full.push(match[3]);
      }
    }
    if(!full.length)throw Error(`Stable feed has no full package for ${tag}.`);
    const version=full.sort((a,b)=>compareVersions(b,a))[0];
    if(!legacy&&manifest.version!==version)throw Error(`Stable manifest/package version differs for ${tag}.`);
    history.push({tag,source:manifest.source,version,legacyConservativeFloor:legacy});
  }
  return history;
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function main(){
  const policy=JSON.parse(await fs.readFile(path.join(root,'scripts/release-version-policy.json'),'utf8'));
  const [identityArgument,outputArgument]=process.argv.slice(2);
  const identity=validateIdentity(JSON.parse(await fs.readFile(identityArgument?path.resolve(identityArgument):path.join(root,'build-identity.json'),'utf8')),policy);
  const gh=(args,binary=false)=>execFileSync('gh',args,{encoding:binary?null:'utf8',windowsHide:true,timeout:30000,maxBuffer:32*1024*1024});
  const api=async endpoint=>JSON.parse(gh(['api',`repos/${policy.repository}/${endpoint}`]));
  const run=await api(`actions/runs/${identity.runId}`);
  const authenticated=deriveIdentity(run,process.env,policy,identity.baseVersions);
  if(JSON.stringify(authenticated)!==JSON.stringify(identity))throw Error('Publication identity differs from authenticated current run metadata.');
  let receipt={schemaVersion:1,source:identity.source,version:identity.version,updateChannel:identity.updateChannel,applicable:identity.updateChannel==='stable'};
  if(receipt.applicable){
    const main=(await api('git/ref/heads/main')).object;
    if(main?.type!=='commit'||!/^[a-f0-9]{40}$/.test(main.sha))throw Error('Authenticated stable main identity is unavailable.');
    const pages=JSON.parse(gh(['api','--paginate','--slurp',`repos/${policy.repository}/releases?per_page=100`]));
    if(!Array.isArray(pages)||pages.some(page=>!Array.isArray(page)))throw Error('Release pagination was incomplete.');
    const history=await acceptedHistory(pages.flat(),api,async(tag,name)=>gh(['release','download',tag,'--repo',policy.repository,'--pattern',name,'--output','-'],true),main.sha);
    receipt={...receipt,main:main.sha,highest:assertNewer(identity.version,history),history,verifiedAt:new Date().toISOString()};
  }
  const output=outputArgument?path.resolve(outputArgument):path.join(root,'apps/desktop/release/stable-version-check.json');
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify(receipt,null,2));
  console.log(receipt.applicable?`Stable version ${identity.version} is newer than ${receipt.highest?.version??'an empty accepted history'}.`:'Preservation publication is not an accepted stable update.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
