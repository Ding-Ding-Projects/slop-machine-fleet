#!/usr/bin/env node
/** Acquire the pinned self-contained decoder before protected policy ingestion. */
import https from 'node:https';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, lstatSync, realpathSync, mkdtempSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_DECODER, verifyFontDecoderRoot } from './publication-font-decoder.mjs';
function download(url) { return new Promise((resolve, reject) => {
  const request = https.get(url, { timeout: 30000 }, response => {
    if (response.statusCode !== 200) { response.resume(); reject(new Error('font-package-download-failed')); return; }
    const chunks = []; let bytes = 0;
    response.on('data', chunk => { bytes += chunk.length; if (bytes > 1048576) response.destroy(new Error('font-package-oversized')); else chunks.push(chunk); });
    response.on('error', reject); response.on('end', () => resolve(Buffer.concat(chunks)));
  }); const deadline = setTimeout(() => request.destroy(new Error('font-package-timeout')), 30000); request.on('close', () => clearTimeout(deadline)); request.on('timeout', () => request.destroy(new Error('font-package-timeout'))); request.on('error', reject);
}); }
export function unpackFontDecoder(bytes) {
  if (bytes.length > 1048576 || createHash('sha256').update(bytes).digest('hex') !== FONT_DECODER.archive) throw new Error('font-package-hash-mismatch');
  const tar = gunzipSync(bytes, { maxOutputLength: 2097152 }); const selected = new Map(); let offset = 0; let entries = 0;
  const field = b => b.toString('utf8').replace(/\0.*$/su, '');
  const octal = b => { const value = field(b).trim(); if (!/^[0-7]+$/u.test(value)) throw new Error('font-archive-invalid'); return parseInt(value, 8); };
  while (offset + 512 <= tar.length) {
    const h = tar.subarray(offset, offset + 512); if (h.every(byte => byte === 0)) { if (!tar.subarray(offset).every(byte => byte === 0)) throw new Error('font-archive-invalid'); break; }
    if (++entries > 64) throw new Error('font-archive-invalid');
    const expected = octal(h.subarray(148, 156)); let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i]; if (sum !== expected) throw new Error('font-archive-invalid');
    const name = field(h.subarray(0, 100)); const prefix = field(h.subarray(345, 500)); const size = octal(h.subarray(124, 136)); const end = offset + 512 + size;
    if (prefix || !Number.isSafeInteger(end) || end > tar.length || ![0, 48].includes(h[156])) throw new Error('font-archive-invalid');
    if (['package/dist/index.mjs', 'package/LICENSE'].includes(name)) { if (selected.has(name)) throw new Error('font-archive-invalid'); selected.set(name, tar.subarray(offset + 512, end)); }
    offset = offset + 512 + Math.ceil(size / 512) * 512;
  }
  const runtime = selected.get('package/dist/index.mjs'); const license = selected.get('package/LICENSE');
  if (!runtime || !license || createHash('sha256').update(runtime).digest('hex') !== FONT_DECODER.runtime) throw new Error('font-runtime-hash-mismatch');
  return { runtime, license };
}
export async function prepareFontDecoder(destination) {
  const target = path.resolve(destination); const parent = path.dirname(target); let current = path.parse(parent).root;
  for (const part of parent.slice(current.length).split(path.sep).filter(Boolean)) { current = path.join(current, part); if (!existsSync(current)) mkdirSync(current, { mode: 0o700 }); if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new Error('font-cache-path-invalid'); }
  if (realpathSync(parent) !== parent) throw new Error('font-cache-path-invalid');
  if (existsSync(target)) { verifyFontDecoderRoot(target); return target; }
  const scratch = mkdtempSync(path.join(parent, '.font-acquire-'));
  try {
    const { runtime, license } = unpackFontDecoder(await download(FONT_DECODER.url));
    const root = path.join(scratch, 'root'); mkdirSync(path.join(root, 'dist'), { recursive: true, mode: 0o700 });
    writeFileSync(path.join(root, 'dist/index.mjs'), runtime, { flag: 'wx', mode: 0o600 }); writeFileSync(path.join(root, 'LICENSE'), license, { flag: 'wx', mode: 0o600 });
    verifyFontDecoderRoot(root); renameSync(root, target); verifyFontDecoderRoot(target); return target;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--destination') { process.stderr.write('font-decoder-arguments-invalid\n'); process.exitCode = 1; }
  else prepareFontDecoder(process.argv[3]).then(() => process.stdout.write('Font decoder prepared and verified.\n')).catch(() => { process.stderr.write('font-decoder-preparation-failed\n'); process.exitCode = 1; });
}
