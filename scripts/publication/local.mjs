import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

// Locate only the maintainer-managed installation. Candidate code is never a policy producer.
let documents = path.join(homedir(), 'Documents');
try {
  if (process.platform === 'win32') documents = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('MyDocuments')"], { encoding: 'utf8', windowsHide: true }).trim() || documents;
  const installed = path.join(homedir(), '.agents', 'skills', 'agent-global-memory');
  const primary = path.join(documents, 'GitHub', 'agent-global-memory');
  if (!existsSync(installed) && !existsSync(primary)) {
    console.log('Publication policy skipped: maintainer private source is not installed on this computer.');
  } else {
    const runner = path.join(installed, 'scripts', 'run-publication-language-local.mjs');
    const lockCheck = path.resolve('scripts', 'check-vocabulary.mjs');
    if (!existsSync(runner) || !existsSync(lockCheck)) throw new Error();
    const lock = spawnSync(process.execPath, [lockCheck], { stdio: 'inherit', windowsHide: true });
    if (lock.status !== 0 || lock.error || lock.signal) throw new Error();
    const result = spawnSync(process.execPath, [runner, '--root', process.cwd(), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
    process.exitCode = Number.isInteger(result.status) ? result.status : 2;
  }
} catch {
  console.error('Publication policy incomplete: installed validator or current private source lock could not be verified.');
  process.exitCode = 2;
}
