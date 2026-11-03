import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8');
function job(name) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex(line => line === `  ${name}:`);
  if (start < 0) throw Error(`Missing production job: ${name}`);
  let end = start + 1;
  while (end < lines.length && !/^  [a-z][a-z-]*:$/.test(lines[end])) end++;
  return lines.slice(start + 1, end).join('\n');
}
function step(jobName, name) {
  const lines = job(jobName).split(/\r?\n/);
  const start = lines.findIndex(line => line === `      - name: ${name}`);
  if (start < 0) throw Error(`Missing production step: ${name}`);
  let index = start + 1;
  while (index < lines.length && lines[index] !== '        run: |') index++;
  const body = [];
  for (index++; index < lines.length && (/^          /.test(lines[index]) || !lines[index]); index++) body.push(lines[index].slice(10));
  if (!body.length) throw Error('Production resolver extraction was empty.');
  return body.join('\n');
}
if (!/^    if: github\.event_name == 'release' && needs\.resolve\.outputs\.eligible == 'true'$/m.test(job('refresh-main')) || !/^    if: github\.event_name != 'release' && needs\.resolve\.outputs\.eligible == 'true'$/m.test(job('build')) || !/^    if: github\.event_name != 'release' && needs\.resolve\.outputs\.eligible == 'true'$/m.test(job('deploy'))) throw Error('Only eligible sources may dispatch or deploy; release parents must skip deployment and manual children cannot dispatch recursively.');
if (!/^      actions: write$/m.test(job('refresh-main')) || /^  actions: write$/m.test(workflow)) throw Error('Dispatch permission must remain scoped to the dispatcher job.');
const resolver = step('resolve', 'Resolve immutable main-channel documentation source');
const dispatcher = step('refresh-main', 'Request a main-ref deployment with the reviewed immutable source');
const parent = await fs.realpath(os.tmpdir());
const directory = await fs.mkdtemp(path.join(parent, 'fleet-pages-source-check-'));
const main = 'a'.repeat(40), reviewed = 'b'.repeat(40), other = 'c'.repeat(40);
const outputs = text => Object.fromEntries(text.trim().split(/\r?\n/).filter(Boolean).map(line => { const separator = line.indexOf('='); return [line.slice(0,separator),line.slice(separator+1)]; }));
const fixture = `
$global:apiCalls = @()
function gh {
  $global:LASTEXITCODE = 0
  $route = $args[1]
  $global:apiCalls += $route
  $global:apiCalls | ConvertTo-Json -AsArray | Set-Content $env:FLEET_TEST_CALLS
  if ($route -like '*/git/ref/heads/main') { @{object=@{type='commit';sha='${main}'}} | ConvertTo-Json -Depth 4 }
  elseif ($route -like '*/compare/*') { @{status=$env:FLEET_TEST_COMPARISON;merge_base_commit=@{sha=$(if($env:FLEET_TEST_COMPARISON -eq 'ahead'){'${reviewed}'}else{'${other}'})}} | ConvertTo-Json -Depth 4 }
  elseif ($route -like '*/commits/*') { @{sha=$(if($env:FLEET_TEST_MISMATCH -eq '1'){'${other}'}else{($route -split '/')[-1]})} | ConvertTo-Json }
  else { throw 'Unexpected fixture API route.' }
}
`;
async function run(name, input, comparison, accepted, diagnostic, mismatch = false) {
  const file = path.join(directory, `${name}.ps1`), output = path.join(directory, `${name}.output`), calls = path.join(directory, `${name}.calls`);
  await fs.writeFile(file, fixture + '\n' + resolver);
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', file], { env: { ...process.env, EVENT_NAME: 'workflow_dispatch', REVIEWED_SOURCE: input, GITHUB_OUTPUT: output, FLEET_TEST_CALLS: calls, FLEET_TEST_COMPARISON: comparison, FLEET_TEST_MISMATCH: mismatch ? '1' : '0' }, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
  const text = (result.stdout ?? '') + (result.stderr ?? '');
  const emitted = await fs.readFile(output, 'utf8').catch(() => '');
  const fields = outputs(emitted);
  if (result.error || (accepted ? result.status !== 0 || fields.sha !== (input || main) || fields.eligible !== 'true' : result.status === 0 || emitted || !diagnostic.test(text))) throw Error(`${name}: production resolver status or immutable source propagation was incorrect.\n${text}`);
  const api = JSON.parse(await fs.readFile(calls, 'utf8'));
  if (api.filter(value => value.endsWith('/git/ref/heads/main')).length !== 1) throw Error('Main must be resolved exactly once before immutable propagation.');
  console.log(`${name}: production resolver ${accepted ? 'accepted exact immutable source' : 'rejected without emitting a source'}.`);
}
async function release(name, channel, branch, expected, diagnostic, mismatch = false, arrayChannel = false) {
  const file = path.join(directory, `${name}.ps1`), output = path.join(directory, `${name}.output`);
  const transport = `
function gh {
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'release') { $channel=$env:FLEET_TEST_CHANNEL; if($env:FLEET_TEST_ARRAY_CHANNEL -eq '1'){$channel=@($channel)}; @{updateChannel=$channel;sourceBranch=$env:FLEET_TEST_BRANCH;source='${reviewed}'} | ConvertTo-Json; return }
  $route = $args[1]
  if ($route -like '*/git/ref/heads/main') { @{object=@{type='commit';sha='${main}'}} | ConvertTo-Json -Depth 4 }
  elseif ($route -like '*/releases/tags/fixture') { @{draft=$false;prerelease=$false;tag_name='fixture'} | ConvertTo-Json }
  elseif ($route -like '*/git/ref/tags/fixture') { @{object=@{type='commit';sha=$(if($env:FLEET_TEST_MISMATCH -eq '1'){'${other}'}else{'${reviewed}'})}} | ConvertTo-Json -Depth 4 }
  elseif ($route -like '*/compare/*') { if($env:FLEET_TEST_CHANNEL -eq 'preservation'){throw 'Preservation source must not be accepted through main ancestry.'}; @{status='ahead';merge_base_commit=@{sha='${reviewed}'}} | ConvertTo-Json -Depth 4 }
  elseif ($route -like '*/commits/*') { @{sha=($route -split '/')[-1]} | ConvertTo-Json }
  else { throw 'Unexpected release fixture API route.' }
}
`;
  await fs.writeFile(file, transport + '\n' + resolver);
  const result = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-File',file], { env: { ...process.env, EVENT_NAME:'release', RELEASE_TAG:'fixture', REVIEWED_SOURCE:'', GITHUB_OUTPUT:output, FLEET_TEST_CHANNEL:channel, FLEET_TEST_BRANCH:branch, FLEET_TEST_MISMATCH:mismatch?'1':'0', FLEET_TEST_ARRAY_CHANNEL:arrayChannel?'1':'0' }, encoding:'utf8', timeout:15000, maxBuffer:1024*1024, windowsHide:true });
  const text = (result.stdout ?? '') + (result.stderr ?? '');
  const emitted = await fs.readFile(output,'utf8').catch(()=>'');
  const fields = outputs(emitted);
  if (result.error || (expected === 'invalid' ? result.status === 0 || emitted || !diagnostic.test(text) : result.status !== 0 || fields.eligible !== String(expected === 'eligible') || (expected === 'eligible' ? fields.sha !== main : fields.sha || fields.reason !== 'preservation-channel' || !/No deployment source was accepted/.test(text)))) throw Error(`${name}: release eligibility was incorrect.\n${text}`);
  console.log(`${name}: production resolver result ${expected}.`);
}
try {
  // API transports are explicit local fixtures; these checks do not prove provider deployment.
  await run('normal-manual', '', 'ahead', true);
  await run('reviewed-ancestor', reviewed, 'ahead', true);
  await run('malformed-reviewed-source', 'not-a-full-sha', 'ahead', false, /must be a full immutable commit SHA/);
  await run('source-outside-main', reviewed, 'diverged', false, /not an ancestor of authenticated main/);
  await run('commit-readback-mismatch', reviewed, 'ahead', false, /readback differs/, true);
  await release('stable-main-release','stable','main','eligible');
  await release('valid-preservation-release','preservation','ai/feature/preserved','ineligible');
  await release('contradictory-preservation-main','preservation','main','invalid',/malformed or contradictory/);
  await release('contradictory-stable-feature','stable','ai/feature/preserved','invalid',/malformed or contradictory/);
  await release('missing-channel','','main','invalid',/malformed or contradictory/);
  await release('channel-case-mismatch','Stable','main','invalid',/malformed or contradictory/);
  await release('stable-branch-case-mismatch','stable','MAIN','invalid',/malformed or contradictory/);
  await release('array-channel-metadata','stable','main','invalid',/malformed or contradictory/,false,true);
  await release('malformed-preservation-branch','preservation','bad..branch','invalid',/branch metadata is invalid/);
  await release('preservation-tag-mismatch','preservation','ai/feature/preserved','invalid',/tag and source manifest differ/,true);
  const file = path.join(directory, 'dispatch.ps1'), argsFile = path.join(directory, 'dispatch-args.json');
  await fs.writeFile(file, `function gh { $global:LASTEXITCODE=0; $args | ConvertTo-Json -AsArray | Set-Content $env:FLEET_TEST_ARGUMENTS }\n${dispatcher}`);
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', file], { env: { ...process.env, REVIEWED_SOURCE: reviewed, FLEET_TEST_ARGUMENTS: argsFile }, encoding: 'utf8', timeout: 15000, windowsHide: true });
  const args = JSON.parse(await fs.readFile(argsFile, 'utf8'));
  if (result.status !== 0 || args[args.indexOf('--ref') + 1] !== 'main' || !args.includes(`reviewed_source=${reviewed}`)) throw Error('Release refresh did not dispatch main with the exact reviewed immutable source.');
  console.log('PASS: immutable propagation, main-only dispatch, deliberate preservation ineligibility and contradictory/malformed/tag/source rejection. Provider deployment remains unverified.');
} finally {
  const resolved = await fs.realpath(directory);
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('fleet-pages-source-check-')) throw Error('Test temporary-directory identity changed.');
  await fs.rm(resolved, { recursive: true });
}
