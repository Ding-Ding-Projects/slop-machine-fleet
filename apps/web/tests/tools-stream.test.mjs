import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  Base64Encoder,
  Base64Decoder,
  CHUNK_BYTES,
  createControl,
} from "../../../packages/shared/local-base64/codec.mjs";
import { convertStream } from "../../../packages/shared/local-base64/stream.mjs";
const bytes = (value) => new TextEncoder().encode(value),
  text = (value) => new TextDecoder().decode(value);
function memorySink({ corrupt = false, onWrite = () => {} } = {}) {
  let parts = [],
    sealed = false,
    committed = false,
    aborted = false;
  return {
    async write(chunk) {
      assert.ok(chunk.length <= CHUNK_BYTES);
      parts.push(chunk.slice());
      onWrite();
    },
    async seal() {
      sealed = true;
    },
    async *chunks() {
      assert.ok(sealed);
      for (const part of parts) {
        const value = part.slice();
        if (corrupt && value.length) value[0] ^= 1;
        yield value;
      }
    },
    async commit() {
      committed = true;
    },
    async abort() {
      aborted = true;
      parts = [];
    },
    get committed() {
      return committed;
    },
    get aborted() {
      return aborted;
    },
    get value() {
      return Buffer.concat(parts);
    },
  };
}
test("streaming codec matches independent Base64 across every split and wrapped alphabets", () => {
  const input = Uint8Array.from({ length: 259 }, (_, i) => i % 256);
  for (let split = 1; split < 9; split++)
    for (const url of [false, true])
      for (const padding of [false, true]) {
        const encoder = new Base64Encoder({ url, padding, wrap: 7 });
        const output = [];
        for (let i = 0; i < input.length; i += split)
          output.push(encoder.push(input.subarray(i, i + split)));
        output.push(encoder.push(new Uint8Array(), true));
        const actual = Buffer.concat(output).toString();
        let expected = Buffer.from(input)
          .toString(url ? "base64url" : "base64")
          .replace(/=+$/, "");
        if (padding)
          expected = expected.padEnd(Math.ceil(expected.length / 4) * 4, "=");
        assert.equal(actual.replaceAll("\r\n", ""), expected);
        const decoder = new Base64Decoder({ url, strict: false }),
          decoded = [];
        for (const byte of bytes(actual))
          decoded.push(decoder.push(Uint8Array.of(byte)));
        decoded.push(decoder.push(new Uint8Array(), true));
        assert.deepEqual(Buffer.concat(decoded), Buffer.from(input));
      }
});
test("strict streaming rejection retains absolute offset across chunks and rejects trailing bits", () => {
  const decoder = new Base64Decoder();
  decoder.push(bytes("YWJj"));
  assert.throws(
    () => decoder.push(bytes("!")),
    (error) => error.code === "alphabet" && error.offset === 4,
  );
  for (const value of ["Zh==", "Zg=", "A===", "Zg==Zg==", "Z g=="]) {
    const d = new Base64Decoder();
    assert.throws(() => {
      for (const byte of bytes(value)) d.push(Uint8Array.of(byte));
      d.push(new Uint8Array(), true);
    });
  }
});
test("stream commit waits for readback and cryptographic round-trip; corruption aborts", async () => {
  const source = async function* () {
    yield bytes("hello");
    yield bytes(" world");
  };
  const sink = memorySink();
  const result = await convertStream({ source, sink, mode: "encode" });
  assert.equal(sink.value.toString(), "aGVsbG8gd29ybGQ=");
  assert.equal(
    result.inputSha256,
    createHash("sha256").update("hello world").digest("hex"),
  );
  assert.equal(sink.committed, true);
  const corrupt = memorySink({ corrupt: true });
  await assert.rejects(
    convertStream({ source, sink: corrupt, mode: "encode" }),
    (error) => ["verification", "alphabet", "padding"].includes(error.code),
  );
  assert.equal(corrupt.committed, false);
  assert.equal(corrupt.aborted, true);
});
test("pause stops source advancement; resume continues; cancellation aborts without committing", async () => {
  const control = createControl();
  let read = 0;
  let paused;
  const reached = new Promise((resolve) => (paused = resolve));
  const source = async function* () {
    for (let i = 0; i < 4; i++) {
      read++;
      yield bytes("abc");
    }
  };
  const sink = memorySink({
    onWrite: () => {
      if (read === 1) {
        control.pause();
        paused();
      }
    },
  });
  const pending = convertStream({ source, sink, mode: "encode", control });
  await reached;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const parked = read;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(read, parked);
  control.resume();
  await pending;
  assert.equal(sink.committed, true);
  const cancel = createControl(),
    cancelSink = memorySink({ onWrite: () => cancel.cancel() });
  await assert.rejects(
    convertStream({
      source,
      sink: cancelSink,
      mode: "encode",
      control: cancel,
    }),
    (error) => error.code === "cancelled",
  );
  assert.equal(cancelSink.aborted, true);
  assert.equal(cancelSink.committed, false);
});
test("decoded output also receives independent readback and round-trip verification", async () => {
  const sink = memorySink();
  const result = await convertStream({
    source: async function* () {
      yield bytes("8J");
      yield bytes("+Yug==");
    },
    sink,
    mode: "decode",
  });
  assert.equal(sink.value.toString(), "😺");
  assert.equal(
    result.outputSha256,
    createHash("sha256").update("😺").digest("hex"),
  );
});
test("a file larger than the former cap is verified through bounded disk-backed chunks", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const base = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../node_modules",
  );
  const folder = await fs.mkdtemp(path.join(base, ".base64-stream-test-"));
  const file = path.join(folder, "result.b64");
  let handle = await fs.open(file, "w"),
    written = 0,
    maxWrite = 0,
    committed = false;
  const expected = createHash("sha256"),
    chunk = new Uint8Array(CHUNK_BYTES).fill(173);
  const source = async function* () {
    for (let i = 0; i < 257; i++) {
      expected.update(chunk);
      yield chunk;
    }
  };
  const sink = {
    async write(bytes) {
      maxWrite = Math.max(maxWrite, bytes.length);
      await handle.write(bytes);
      written += bytes.length;
    },
    async seal() {
      await handle.close();
      handle = null;
    },
    async *chunks() {
      const reader = await fs.open(file, "r");
      try {
        const buffer = new Uint8Array(CHUNK_BYTES);
        let result;
        do {
          result = await reader.read(buffer, 0, buffer.length, null);
          if (result.bytesRead) yield buffer.slice(0, result.bytesRead);
        } while (result.bytesRead);
      } finally {
        await reader.close();
      }
    },
    async commit() {
      committed = true;
    },
    async abort() {
      if (handle) await handle.close();
    },
  };
  const result = await convertStream({ source, sink, mode: "encode" });
  assert.ok(result.inputSize > 8 * 1024 * 1024);
  assert.ok(maxWrite <= CHUNK_BYTES);
  assert.equal(result.outputSize, written);
  assert.equal(result.inputSha256, expected.digest("hex"));
  assert.equal(committed, true);
});
