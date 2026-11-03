import test from "node:test";
import assert from "node:assert/strict";
import {
  Base64Decoder,
  CHUNK_BYTES,
} from "../../../packages/shared/local-base64/codec.mjs";
import {
  DataURLStripper,
  dataURLPrefix,
  encodeTextChunks,
  textByteLength,
} from "../../../packages/shared/local-base64/data-url.mjs";
import { convertStream } from "../../../packages/shared/local-base64/stream.mjs";
import { detectedMedia } from "../../../packages/shared/local-base64/preview.mjs";
const utf8 = (value) => new TextEncoder().encode(value);
const source = (value) =>
  async function* () {
    for (const byte of value) yield Uint8Array.of(byte);
  };
function sink() {
  const parts = [];
  return {
    async write(bytes) {
      parts.push(bytes.slice());
    },
    async seal() {},
    async *chunks() {
      for (const chunk of parts) yield chunk;
    },
    async commit() {},
    async abort() {
      parts.length = 0;
    },
    get bytes() {
      return Buffer.concat(parts);
    },
  };
}
test("data URL headers cross arbitrary boundaries without changing decoded bytes or MIME parameters", async () => {
  const value = "data:text/plain;charset=utf-8;base64,8J+Yug==";
  const out = sink(),
    result = await convertStream({
      source: source(utf8(value)),
      sink: out,
      mode: "decode",
      options: { url: true },
    });
  assert.equal(out.bytes.toString(), "😺");
  assert.deepEqual(result.dataURL, {
    mime: "text/plain",
    parameters: ["charset=utf-8"],
  });
  assert.equal(result.options.url, false);
  const encoded = sink();
  await convertStream({
    source: source(utf8("😺")),
    sink: encoded,
    mode: "encode",
    options: {
      url: true,
      padding: false,
      wrap: 1,
      dataURL: true,
      mime: "text/plain",
    },
  });
  assert.equal(encoded.bytes.toString(), "data:text/plain;base64,8J+Yug==");
});
test("invalid and oversized data URL headers reject without accepting injected attributes", () => {
  for (const value of [
    "data:text/html;invalid,x",
    "data:text/plain;invalid;base64,AA==",
    "data:text/plain;base64" + "a".repeat(4100),
  ]) {
    const parser = new DataURLStripper();
    assert.throws(() => parser.push(utf8(value), true));
  }
  assert.throws(() => dataURLPrefix('text/html" onclick="x'));
});
test("text streaming preserves surrogate boundaries and selected byte encodings", async () => {
  const text = "a".repeat(16383) + "😺廣東話";
  for (const encoding of ["utf-8", "utf-16le", "utf-16be"]) {
    const parts = [];
    for await (const chunk of encodeTextChunks(text, encoding)) {
      assert.ok(chunk.length <= CHUNK_BYTES);
      parts.push(chunk);
    }
    const actual = Buffer.concat(parts);
    assert.equal(actual.length, textByteLength(text, encoding));
    assert.equal(
      new TextDecoder(encoding, { fatal: true }).decode(actual),
      text,
    );
  }
  const latin = [];
  for await (const chunk of encodeTextChunks("\u0080ÿ", "latin1"))
    latin.push(chunk);
  assert.deepEqual(Buffer.concat(latin), Buffer.from([128, 255]));
  await assert.rejects(async () => {
    for await (const chunk of encodeTextChunks("貓", "latin1")) void chunk;
  });
});
test("preview detection follows bounded signatures rather than HTML or filenames", () => {
  assert.equal(detectedMedia(utf8("<html><script>alert(1)</script>")), null);
  assert.equal(detectedMedia(utf8("RIFF0000WAVE")), "audio/wav");
  assert.equal(detectedMedia(utf8("0000ftypisom")), "video/mp4");
  assert.equal(detectedMedia(utf8("ID3")), "audio/mpeg");
});
