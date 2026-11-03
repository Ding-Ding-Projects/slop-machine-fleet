import { Zip, ZipPassThrough, Unzip, UnzipPassThrough } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  CHUNK_BYTES,
  Base64Error,
  blobChunks,
  createControl,
} from "./codec.mjs";
const hex = (bytes) =>
  Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
export function zipPlan(files) {
  if (!files.length || files.length > 65535) throw new Base64Error("zip-limit");
  let size = 22;
  const entries = files.map((entry, index) => {
    if (
      !Number.isSafeInteger(entry.file.size) ||
      entry.file.size < 0 ||
      entry.file.size > 0xffffffff
    )
      throw new Base64Error("zip-limit");
    const name =
      String(index + 1).padStart(5, "0") +
      "-" +
      entry.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 160);
    const length = new TextEncoder().encode(name).length;
    size += entry.file.size + 2 * length + 128;
    if (size > 0xffffffff) throw new Base64Error("zip-limit");
    return { ...entry, name };
  });
  return { entries, expectedBytes: size + 1024 * 1024 };
}
export async function createVerifiedZip({
  files,
  sink,
  control = createControl(),
  onProgress = () => {},
}) {
  const { entries } = zipPlan(files),
    expected = new Map(),
    inputHash = sha256.create(),
    outputHash = sha256.create();
  let queued = [],
    outputSize = 0,
    inputSize = 0,
    zipError = null,
    finished = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      zipError = error;
      return;
    }
    queued.push(chunk);
    if (final) finished = true;
  });
  const flush = async () => {
    if (zipError) throw new Base64Error("zip");
    for (const chunk of queued)
      for (let i = 0; i < chunk.length; i += CHUNK_BYTES) {
        await control.checkpoint();
        const part = chunk.subarray(i, i + CHUNK_BYTES);
        await sink.write(part);
        outputHash.update(part);
        outputSize += part.length;
      }
    queued = [];
  };
  try {
    for (const entry of entries) {
      await control.checkpoint();
      const hash = sha256.create(),
        file = new ZipPassThrough(entry.name);
      zip.add(file);
      await flush();
      for await (const chunk of blobChunks(entry.file)) {
        await control.checkpoint();
        hash.update(chunk);
        inputHash.update(chunk);
        inputSize += chunk.length;
        file.push(chunk, false);
        await flush();
        onProgress({ phase: "archive", inputSize, outputSize });
      }
      file.push(new Uint8Array(), true);
      await flush();
      expected.set(entry.name, {
        hash: hex(hash.digest()),
        size: entry.file.size,
      });
    }
    zip.end();
    await flush();
    if (!finished) throw new Base64Error("zip");
    await sink.seal();
    const observed = new Map(),
      readHash = sha256.create();
    let parseError = null;
    const unzip = new Unzip((file) => {
      if (!expected.has(file.name) || observed.has(file.name)) {
        parseError = new Base64Error("verification");
        return;
      }
      const hash = sha256.create(),
        record = { size: 0, hash: "", done: false };
      observed.set(file.name, record);
      file.ondata = (error, chunk, final) => {
        if (error) {
          parseError = new Base64Error("verification");
          return;
        }
        record.size += chunk.length;
        if (record.size > expected.get(file.name).size) {
          parseError = new Base64Error("verification");
          return;
        }
        hash.update(chunk);
        if (final) {
          record.hash = hex(hash.digest());
          record.done = true;
        }
      };
      file.start();
    });
    unzip.register(UnzipPassThrough);
    for await (const chunk of sink.chunks()) {
      await control.checkpoint();
      readHash.update(chunk);
      unzip.push(chunk, false);
      if (parseError) throw parseError;
    }
    unzip.push(new Uint8Array(), true);
    const outputSha256 = hex(outputHash.digest());
    if (
      parseError ||
      observed.size !== expected.size ||
      hex(readHash.digest()) !== outputSha256
    )
      throw new Base64Error("verification");
    for (const [name, value] of expected) {
      const actual = observed.get(name);
      if (
        !actual?.done ||
        actual.hash !== value.hash ||
        actual.size !== value.size
      )
        throw new Base64Error("verification");
    }
    await control.checkpoint();
    await sink.commit();
    return {
      mode: "zip",
      inputSize,
      outputSize,
      inputSha256: hex(inputHash.digest()),
      outputSha256,
      verified: true,
      options: { compression: "store", entries: entries.length },
    };
  } catch (error) {
    zip.terminate();
    await sink.abort();
    throw error;
  } finally {
    inputHash.destroy();
    outputHash.destroy();
  }
}
