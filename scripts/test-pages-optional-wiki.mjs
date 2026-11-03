import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await fs.readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8');
function step(name) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex(line => line === `      - name: ${name}`);
  if (start < 0) throw Error(`Missing production workflow step: ${name}`);
  let index = start + 1;
  while (index < lines.length && lines[index] !== '        run: |') {
    if (/^      - /.test(lines[index])) throw Error('Workflow step has no executable body.');
    index++;
  }
  const body = [];
  for (index++; index < lines.length && (/^          /.test(lines[index]) || !lines[index]); index++) body.push(lines[index].slice(10));
  if (!body.length) throw Error('Production workflow script extraction was empty.');
  return body.join('\n');
}
const wiki = step('Include complete available public wiki articles and assets');
const downloads = step('Verify published downloads against source-bound payload hashes');
const parent = await fs.realpath(os.tmpdir());
const directory = await fs.mkdtemp(path.join(parent, 'fleet-pages-exit-check-'));
const wrapper = '\nif (Test-Path -LiteralPath variable:\\LASTEXITCODE) { exit $LASTEXITCODE }\n';
async function run(name, prefix, body, expectedStatus, expectedOutput) {
  const file = path.join(directory, `${name}.ps1`);
  await fs.writeFile(file, `$ErrorActionPreference = 'Stop'\n${prefix}\n${body}${wrapper}`);
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', file], { cwd: directory, env: { ...process.env, RUNNER_TEMP: directory, FLEET_TEST_ROOT: root }, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.error || (expectedStatus === 0 ? result.status !== 0 : !Number.isInteger(result.status) || result.status === 0) || !expectedOutput.test(output)) throw Error(`${name}: expected status ${expectedStatus === 0 ? 'zero' : 'nonzero'} and its production diagnostic; actual ${result.status}.\n${output}`);
  console.log(`${name}: expected ${expectedStatus === 0 ? 'zero' : 'nonzero'} wrapper exit verified (${result.status}).`);
}
try {
  // Real native Git errors exercise the extracted production branches; no release is published.
  await run('optional-wiki-unavailable', `
$gitBinary = (Get-Command git -CommandType Application | Select-Object -First 1).Source
function git { & $gitBinary ls-remote (Join-Path $env:RUNNER_TEMP 'absent-wiki.git') HEAD }
`, wiki, 0, /published wiki synchronization is unverified/);
  await run('required-wiki-clone-failure', `
$gitBinary = (Get-Command git -CommandType Application | Select-Object -First 1).Source
function git {
  if ($args[0] -eq 'ls-remote') { & $gitBinary ls-remote $env:FLEET_TEST_ROOT HEAD }
  elseif ($args[0] -eq 'clone') { & $gitBinary clone (Join-Path $env:RUNNER_TEMP 'absent-required-source.git') (Join-Path $env:RUNNER_TEMP 'clone-target') }
  else { throw 'Unexpected test transport command.' }
}
`, wiki, 1, /Available public wiki could not be imported completely/);
  // Explicit test-only discovery fixtures reach a real failing native download command.
  await run('required-download-failure', `
function gh {
  if ($args[0] -eq 'release' -and $args[1] -eq 'list') { $global:LASTEXITCODE = 0; '[{"tagName":"fixture","isDraft":false,"isPrerelease":false}]' }
  elseif ($args[0] -eq 'api') { $global:LASTEXITCODE = 0; '{"assets":[{"name":"source-manifest.json","size":10}]}' }
  elseif ($args[0] -eq 'release' -and $args[1] -eq 'download') { & $env:COMSPEC /d /c 'exit 23' }
  else { throw 'Unexpected test transport command.' }
}
`, downloads, 1, /Published source manifest download failed/);
  console.log('PASS: extracted workflow optional probe is handled; required native clone and download failures remain nonzero.');
} finally {
  const resolved = await fs.realpath(directory);
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('fleet-pages-exit-check-')) throw Error('Test temporary-directory identity changed.');
  await fs.rm(resolved, { recursive: true });
}
