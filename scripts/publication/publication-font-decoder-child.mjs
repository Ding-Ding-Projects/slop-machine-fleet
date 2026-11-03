/** Trusted child entrypoint. Candidate bytes are data, never module source. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const MAX = 16777216;
try {
  if (process.argv.length !== 5) throw new Error();
  const source = readFileSync(process.argv[2]);
  if (source.length > 1048576 || createHash('sha256').update(source).digest('hex') !== 'cac9cfed06484c4bf77a97aed556c028a5df0d897e95d437db00daaf8aafe9cd') throw new Error();
  const input = readFileSync(process.argv[3]); if (input.length > MAX) throw new Error();
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  // Allocation accounting limits known pinned decoder operations. A VM is not a security sandbox.
  vm.runInContext(`{
    let allocated = 0;
    for (const name of ['Uint8Array', 'Int16Array', 'Uint16Array']) {
      const Native = globalThis[name];
      globalThis[name] = new Proxy(Native, { construct(target, args) {
        const length = typeof args[0] === 'number' ? args[0] : args[0]?.length ?? args[2] ?? 0;
        if (!Number.isSafeInteger(length) || length < 0 || length * Native.BYTES_PER_ELEMENT > 16777216) throw Error('allocation-bound');
        allocated += length * Native.BYTES_PER_ELEMENT;
        if (allocated > 67108864) throw Error('allocation-bound');
        return Reflect.construct(target, args);
      }});
    }
  }`, context, { timeout: 1000 });
  for (const name of ['process', 'require', 'fetch', 'WebSocket', 'XMLHttpRequest', 'Buffer']) if (vm.runInContext('typeof ' + name, context) !== 'undefined') throw new Error();
  const module = new vm.SourceTextModule(source.toString('utf8'), { context });
  await module.link(() => { throw new Error('imports-prohibited'); });
  await module.evaluate({ timeout: 10000 });
  let warnings = 0;
  const output = module.namespace.eotToTtf(new Uint8Array(input), { onWarn() { warnings++; } });
  if (warnings || !ArrayBuffer.isView(output) || output.byteLength < 12 || output.byteLength > MAX) throw new Error();
  writeFileSync(process.argv[4], output, { flag: 'wx', mode: 0o600 });
} catch { process.stderr.write('font-decode-failed\n'); process.exitCode = 1; }
