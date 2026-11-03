import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child = fileURLToPath(new URL('./decode-web-font.py', import.meta.url));
export function decodeWebFont(bytes, python) {
  if (!python || bytes.length > 16777216) throw new Error('font-decoder-unavailable');
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key] !== undefined) env[key] = process.env[key];
  const result = spawnSync(python, ['-I', child], { input: bytes, env, timeout: 15000, maxBuffer: 2097152, windowsHide: true });
  if (result.status !== 0 || result.signal || result.error || result.stderr.length) throw new Error('font-decoder-incomplete');
  const strings = JSON.parse(result.stdout.toString('utf8'));
  if (!Array.isArray(strings) || strings.length > 4096 || strings.some(value => typeof value !== 'string' || value.length > 1048576)) throw new Error('font-decoder-invalid');
  return { format: 'web-font', strings: strings.map((text, index) => ({ text, location: 'font-metadata/' + index })) };
}
