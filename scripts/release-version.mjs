import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

export const COMPONENT_MAXIMUM = 65534;
export function numericVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)) throw Error('A bounded numeric three-part version is required.');
  const parts = value.split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part) || part > COMPONENT_MAXIMUM)) throw Error('Version exceeds the shared Windows/.NET component bound.');
  return parts;
}
export function compareVersions(left, right) {
  const a = numericVersion(left), b = numericVersion(right);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}
function integer(value, name, minimum = 1) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > COMPONENT_MAXIMUM) throw Error(`${name} is outside its exact bounded integer range.`);
  return Number(value);
}
export function deriveVersion(epoch, runNumber, runAttempt) {
  return [integer(epoch, 'Product epoch', 0), integer(runNumber, 'Workflow run number'), integer(runAttempt, 'Workflow run attempt')].join('.');
}
export function deriveIdentity(run, context, policy, baseVersions) {
  if (policy.schemaVersion !== 1 || policy.componentMaximum !== COMPONENT_MAXIMUM || context.GITHUB_ACTIONS !== 'true' || context.GITHUB_REPOSITORY !== policy.repository || String(run.workflow_id) !== policy.workflowId || run.path !== policy.workflowPath || !['push','workflow_dispatch'].includes(run.event)) throw Error('Release workflow identity does not match the declared provider policy.');
  if (!/^[a-f0-9]{40}$/.test(context.GITHUB_SHA ?? '') || run.head_sha !== context.GITHUB_SHA || String(run.id) !== context.GITHUB_RUN_ID || String(run.run_number) !== context.GITHUB_RUN_NUMBER || String(run.run_attempt) !== context.GITHUB_RUN_ATTEMPT || !context.GITHUB_REF?.startsWith('refs/heads/') || run.head_branch !== context.GITHUB_REF.slice(11)) throw Error('Authenticated run metadata differs from the build context.');
  const version = deriveVersion(String(policy.epoch), context.GITHUB_RUN_NUMBER, context.GITHUB_RUN_ATTEMPT);
  for (const value of Object.values(baseVersions)) numericVersion(value);
  return { schemaVersion:1, mode:'provider-overlay', source:run.head_sha, version, epoch:policy.epoch, runId:String(run.id), runNumber:context.GITHUB_RUN_NUMBER, runAttempt:context.GITHUB_RUN_ATTEMPT, workflowId:String(run.workflow_id), workflowPath:run.path, repository:policy.repository, sourceBranch:run.head_branch, updateChannel:run.head_branch === 'main' ? 'stable' : 'preservation', baseVersions };
}
export function validateIdentity(identity, policy) {
  if(policy.schemaVersion!==1||policy.componentMaximum!==COMPONENT_MAXIMUM)throw Error('Release version policy is invalid.');
  if (identity.schemaVersion !== 1 || identity.mode !== 'provider-overlay' || identity.repository !== policy.repository || identity.workflowId !== policy.workflowId || identity.workflowPath !== policy.workflowPath || identity.epoch !== policy.epoch || !/^[a-f0-9]{40}$/.test(identity.source ?? '') || !/^[1-9][0-9]*$/.test(identity.runId ?? '') || identity.version !== deriveVersion(String(identity.epoch),identity.runNumber,identity.runAttempt) || typeof identity.sourceBranch !== 'string' || !identity.sourceBranch || identity.updateChannel !== (identity.sourceBranch === 'main' ? 'stable' : 'preservation') || !identity.baseVersions || !Object.keys(identity.baseVersions).length) throw Error('Release derivation receipt is invalid.');
  for (const value of Object.values(identity.baseVersions)) numericVersion(value);
  return identity;
}
export async function packageInventory(root) {
  const pkg = JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const result = { 'package.json':pkg.version };
  for (const workspace of pkg.workspaces) {
    if (typeof workspace !== 'string' || !/^(apps|packages)\/[A-Za-z0-9_-]+$/.test(workspace)) throw Error('Release workspace path is not an explicit bounded directory.');
    const name = `${workspace}/package.json`;
    result[name] = JSON.parse(await fs.readFile(path.join(root,name),'utf8')).version;
  }
  return result;
}
export async function applyOverlay(root, identity, policy, { worker = true } = {}) {
  validateIdentity(identity,policy);
  const inventory = await packageInventory(root);
  if (JSON.stringify(inventory) !== JSON.stringify(identity.baseVersions)) throw Error('Overlay base package versions differ from the source receipt.');
  const manifests = Object.keys(inventory);
  const catalog = new Map();
  const values = new Map();
  for(const name of manifests){const value=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));if(typeof value.name!=='string'||catalog.has(value.name))throw Error('Internal package names must be present and unique.');catalog.set(value.name,name);values.set(name,value);}
  const updateReferences = value => {for(const section of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])if(value[section])for(const name of Object.keys(value[section]))if(catalog.has(name))value[section][name]=identity.version;};
  for (const name of manifests) {
    const file = path.join(root,name), value = values.get(name);
    value.version = identity.version;
    updateReferences(value);
    await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
  }
  const locks = ['package-lock.json',...manifests.filter(name=>name!=='package.json').map(name=>name.replace('package.json','package-lock.json'))];
  for (const name of locks) {
    const file = path.join(root,name);
    const text = await fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if (text === null) continue;
    const lock = JSON.parse(text), relative = path.dirname(name).replaceAll('\\','/');
    if(lock.lockfileVersion!==3)throw Error('Release overlays require the declared npm lockfile version 3.');
    lock.version = identity.version;
    if (lock.packages?.['']) lock.packages[''].version = identity.version;
    if (relative === '.') for (const manifest of manifests) {
      const key = path.posix.dirname(manifest);
      if (key !== '.' && lock.packages?.[key]) lock.packages[key].version = identity.version;
    }
    for(const [key,value] of Object.entries(lock.packages??{})){
      updateReferences(value);
      const packageName=value.name??(key.startsWith('node_modules/')?key.slice('node_modules/'.length):undefined);
      if(!value.link&&catalog.has(packageName))value.version=identity.version;
    }
    await fs.writeFile(file,JSON.stringify(lock,null,2)+'\n');
  }
  if (worker) {
    const file = path.join(root,'worker/Fleet.Worker.csproj');
    let xml = await fs.readFile(file,'utf8');
    for (const name of ['Version','AssemblyVersion','FileVersion','InformationalVersion','IncludeSourceRevisionInInformationalVersion']) xml=xml.replace(new RegExp(`<${name}>[^<]*</${name}>`,'g'),'');
    xml=xml.replace('<PropertyGroup>',`<PropertyGroup><Version>${identity.version}</Version><AssemblyVersion>${identity.version}.0</AssemblyVersion><FileVersion>${identity.version}.0</FileVersion><InformationalVersion>${identity.version}</InformationalVersion><IncludeSourceRevisionInInformationalVersion>false</IncludeSourceRevisionInInformationalVersion>`);
    await fs.writeFile(file,xml);
  }
  await fs.writeFile(path.join(root,'build-identity.json'),JSON.stringify(identity,null,2)+'\n');
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here,'..');
const git = args => execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
async function main() {
  const [mode,...args] = process.argv.slice(2);
  const policy = JSON.parse(await fs.readFile(path.join(here,'release-version-policy.json'),'utf8'));
  if (mode === 'derive') {
    const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
    const run=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(git(['rev-parse','HEAD'])!==process.env.GITHUB_SHA)throw Error('Version derivation checkout differs from the authenticated source.');
    const identity=deriveIdentity(run,process.env,policy,await packageInventory(root));
    await fs.mkdir(path.join(root,'.agent'),{recursive:true});
    await fs.writeFile(path.join(root,'.agent/release-identity.json'),JSON.stringify(identity,null,2));
    console.log(`version=${identity.version}\nidentity64=${Buffer.from(JSON.stringify(identity)).toString('base64')}`);
  } else if (mode === 'stage') {
    if(args.length!==1)throw Error('Stage requires one public derivation receipt encoded as base64.');
    const identity=validateIdentity(JSON.parse(Buffer.from(args[0],'base64').toString('utf8')),policy);
    if(git(['rev-parse','HEAD'])!==identity.source || git(['status','--porcelain','--untracked-files=no']))throw Error('Release staging requires the exact clean source checkout.');
    const entries=git(['ls-tree','-r','--name-only',identity.source]).split(/\r?\n/);
    if(git(['ls-tree','-r','--format=%(objectmode)',identity.source]).split(/\r?\n/).some(mode=>!['100644','100755'].includes(mode)))throw Error('Release staging requires regular tracked source files, without links or nested repositories.');
    if(entries.some(name=>/(^|\/)(\.git|\.local|\.agent)(\/|$)/.test(name)||/(^|\/)\.env($|\.)/.test(name)&&!name.endsWith('.env.example')))throw Error('Protected or operational paths cannot enter a release overlay.');
    const parent=path.join(root,'.agent/build-stages');await fs.mkdir(parent,{recursive:true});
    const directory=await fs.mkdtemp(path.join(parent,'release-'));
    const archive=path.join(directory,'source.tar'), staged=path.join(directory,'source');await fs.mkdir(staged);
    execFileSync('git',['archive','--format=tar',`--output=${archive}`,identity.source],{cwd:root,windowsHide:true});
    execFileSync('tar',['-xf',archive,'-C',staged],{windowsHide:true});
    await applyOverlay(staged,identity,policy);
    await fs.unlink(archive);
    console.log(`root=${staged}`);
  } else if (mode === 'apply-image') {
    if(!process.env.FLEET_RELEASE_IDENTITY64)throw Error('The published controller build requires its shared release derivation receipt.');
    const identity=JSON.parse(Buffer.from(process.env.FLEET_RELEASE_IDENTITY64,'base64').toString('utf8'));
    await applyOverlay(root,identity,policy,{worker:false});
  } else if (mode === 'verify-inputs') {
    const file=path.join(root,'build-identity.json');
    const identity=await fs.readFile(file,'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(identity){validateIdentity(identity,policy);for(const value of Object.values(await packageInventory(root)))if(value!==identity.version)throw Error('Build producer version differs from the release overlay.');console.log(`Provider overlay version: ${identity.version}; source ${identity.source}.`);}
    else {const versions=await packageInventory(root);numericVersion(versions['package.json']);await fs.mkdir(path.join(root,'.agent'),{recursive:true});await fs.writeFile(path.join(root,'.agent/local-build-identity.json'),JSON.stringify({schemaVersion:1,mode:'local',publishable:false,version:versions['package.json'],baseVersions:versions,source:git(['rev-parse','HEAD']),dirty:!!git(['status','--porcelain','--untracked-files=no'])},null,2));console.log(`Local known version: ${versions['package.json']}; not a provider publication.`);}
  } else throw Error('Supported modes: derive, stage, apply-image, verify-inputs.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
