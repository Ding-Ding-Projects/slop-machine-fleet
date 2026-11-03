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
if (!/^    if: github\.event_name == 'release'$/m.test(job('refresh-main')) || !/^    if: github\.event_name != 'release'$/m.test(job('build'))) throw Error('Release parents must dispatch once and skip build/deploy; manual children cannot dispatch recursively.');
if (!/^      actions: write$/m.test(job('refresh-main')) || /^  actions: write$/m.test(workflow)) throw Error('Dispatch permission must remain scoped to the dispatcher job.');
const resolver = step('resolve', 'Resolve immutable main-channel documentation source');
const dispatcher = step('refresh-main', 'Request a main-ref deployment with the reviewed immutable source');
const parent = await fs.realpath(os.tmpdir());
const directory = await fs.mkdtemp(path.join(parent, 'fleet-pages-source-check-'));
const main = 'a'.repeat(40), reviewed = 'b'.repeat(40), other = 'c'.repeat(40);
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
  if (result.error || (accepted ? result.status !== 0 || emitted.trim() !== `sha=${input || main}` : result.status === 0 || emitted || !diagnostic.test(text))) throw Error(`${name}: production resolver status or immutable source propagation was incorrect.\n${text}`);
  const api = JSON.parse(await fs.readFile(calls, 'utf8'));
  if (api.filter(value => value.endsWith('/git/ref/heads/main')).length !== 1) throw Error('Main must be resolved exactly once before immutable propagation.');
  console.log(`${name}: production resolver ${accepted ? 'accepted exact immutable source' : 'rejected without emitting a source'}.`);
}
try {
  // API transports are explicit local fixtures; these checks do not prove provider deployment.
  await run('normal-manual', '', 'ahead', true);
  await run('reviewed-ancestor', reviewed, 'ahead', true);
  await run('malformed-reviewed-source', 'not-a-full-sha', 'ahead', false, /must be a full immutable commit SHA/);
  await run('source-outside-main', reviewed, 'diverged', false, /not an ancestor of authenticated main/);
  await run('commit-readback-mismatch', reviewed, 'ahead', false, /readback differs/, true);
  const file = path.join(directory, 'dispatch.ps1'), argsFile = path.join(directory, 'dispatch-args.json');
  await fs.writeFile(file, `function gh { $global:LASTEXITCODE=0; $args | ConvertTo-Json -AsArray | Set-Content $env:FLEET_TEST_ARGUMENTS }\n${dispatcher}`);
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', file], { env: { ...process.env, REVIEWED_SOURCE: reviewed, FLEET_TEST_ARGUMENTS: argsFile }, encoding: 'utf8', timeout: 15000, windowsHide: true });
  const args = JSON.parse(await fs.readFile(argsFile, 'utf8'));
  if (result.status !== 0 || args[args.indexOf('--ref') + 1] !== 'main' || !args.includes(`reviewed_source=${reviewed}`)) throw Error('Release refresh did not dispatch main with the exact reviewed immutable source.');
  console.log('PASS: reviewed source propagation, main-only dispatch, no-recursion conditions and malformed/non-main/readback rejection. Provider deployment remains unverified.');
} finally {
  const resolved = await fs.realpath(directory);
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('fleet-pages-source-check-')) throw Error('Test temporary-directory identity changed.');
  await fs.rm(resolved, { recursive: true });
}
