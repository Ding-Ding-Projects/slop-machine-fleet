/** Explicit, offline, hash-verified portable Node font decoder. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync, readFileSync, mkdtempSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const FONT_DECODER = Object.freeze({
  version: '1.8.0', sourceCommit: 'd818c57f494bd6ba103291a9d706def706992e5a',
  archive: '4c138537193ef97654e9bbcff20a7c782d3fed441f355f3a87b103f6a7aab3eb',
  runtime: 'cac9cfed06484c4bf77a97aed556c028a5df0d897e95d437db00daaf8aafe9cd',
  url: 'https://registry.npmjs.org/mtx-decompressor/-/mtx-decompressor-1.8.0.tgz',
});
const MAX = 16777216;
function invalid(code = 'font-decoder-unavailable') { const error = new Error(code); error.code = code; throw error; }
function safePath(value) {
  const resolved = path.resolve(value); let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) { current = path.join(current, part); if (lstatSync(current).isSymbolicLink()) invalid(); }
  if (realpathSync(resolved) !== resolved) invalid(); return resolved;
}
export function verifyFontDecoderRoot(value) {
  if (Number(process.versions.node.split('.')[0]) < 24) invalid('font-decoder-host-unsupported');
  const root = safePath(value); const runtime = path.join(root, 'dist/index.mjs');
  safePath(runtime); const state = lstatSync(runtime);
  if (!state.isFile() || state.size > 1048576 || createHash('sha256').update(readFileSync(runtime)).digest('hex') !== FONT_DECODER.runtime) invalid();
  return { root, runtime };
}
export function createFontDecoder(value, candidateRoot) {
  const context = verifyFontDecoderRoot(value);
  if (candidateRoot && (context.root === candidateRoot || context.root.startsWith(candidateRoot + path.sep))) invalid();
  const child = safePath(fileURLToPath(new URL('./publication-font-decoder-child.mjs', import.meta.url)));
  let calls = 0; let inputBytes = 0; let outputBytes = 0;
  return bytes => {
    if (!Buffer.isBuffer(bytes) || bytes.length > MAX) invalid();
    calls++; inputBytes += bytes.length; if (calls > 32 || inputBytes > 67108864) invalid('font-decoder-budget-exceeded');
    const current = verifyFontDecoderRoot(context.root);
    const scratchParent = safePath(tmpdir()); const scratch = mkdtempSync(path.join(scratchParent, 'publication-font-'));
    try {
      const input = path.join(scratch, 'input.eot'); const output = path.join(scratch, 'output.ttf');
      writeFileSync(input, bytes, { flag: 'wx', mode: 0o600 });
      const result = spawnSync(process.execPath, ['--max-old-space-size=128', '--max-semi-space-size=16', '--stack-size=512', '--experimental-vm-modules', '--disable-warning=ExperimentalWarning', '--permission', '--allow-fs-read=' + child, '--allow-fs-read=' + current.runtime, '--allow-fs-read=' + input, '--allow-fs-write=' + output, child, current.runtime, input, output], {
        cwd: scratch, env: {}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 65536,
      });
      if (result.error || result.status !== 0 || result.signal || result.stdout?.length || result.stderr?.length) invalid();
      safePath(output); const state = statSync(output); if (!state.isFile() || state.size < 12 || state.size > MAX) invalid();
      outputBytes += state.size; if (outputBytes > 67108864) invalid('font-decoder-budget-exceeded');
      return readFileSync(output);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  };
}
