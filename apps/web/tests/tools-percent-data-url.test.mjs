import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { convertStream } from "../../../packages/shared/local-base64/stream.mjs";
import {
  PercentOctetDecoder,
  DataURLStripper,
} from "../../../packages/shared/local-base64/data-url.mjs";
import { storageBudget } from "../../../packages/shared/local-base64/storage.mjs";
import { parseDataURL } from "../src/tools/core.mjs";
const ascii = (value) => Uint8Array.from(value, (char) => char.charCodeAt(0));
function sink() {
  const parts = [];
  let committed = false,
    aborted = false;
  return {
    async write(bytes) {
      assert.ok(bytes.length <= 65536);
      parts.push(bytes.slice());
    },
    async seal() {},
    async *chunks() {
      for (const bytes of parts) yield bytes;
    },
    async commit() {
      committed = true;
    },
    async abort() {
      aborted = true;
      parts.length = 0;
    },
    get bytes() {
      return Buffer.concat(parts);
    },
    get committed() {
      return committed;
    },
    get aborted() {
      return aborted;
    },
  };
}
async function decode(uri, split) {
  const bytes = ascii(uri),
    out = sink();
  const result = await convertStream({
    source: async function* () {
      for (let at = 0; at < bytes.length; at += split)
        yield bytes.subarray(at, at + split);
    },
    sink: out,
    mode: "decode",
  });
  return { result, out };
}
const vectors = [
  [
    "data:,Hello%20World!",
    [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33],
    "text/plain",
    ["charset=US-ASCII"],
  ],
  [
    "data:;charset=iso-8859-1,%E9+%ff%00",
    [233, 43, 255, 0],
    "text/plain",
    ["charset=iso-8859-1"],
  ],
  [
    "data:application/octet-stream,%00%FF%80%2b+%25%2520",
    [0, 255, 128, 43, 43, 37, 37, 50, 48],
    "application/octet-stream",
    [],
  ],
  [
    "data:text/plain;name=a%3Bb%3Dc;note=a+b,A?B/C:,@&=+$",
    [65, 63, 66, 47, 67, 58, 44, 64, 38, 61, 43, 36],
    "text/plain",
    ["name=a;b=c", "note=a+b"],
  ],
  [
    "data:text/plain;base64=not-a-flag,QQ==",
    [81, 81, 61, 61],
    "text/plain",
    ["base64=not-a-flag"],
  ],
  ["DATA:,", [], "text/plain", ["charset=US-ASCII"]],
];
test("plain data URLs preserve independent byte vectors, MIME and parameters across chunk splits", async () => {
  for (const [uri, expected, mime, parameters] of vectors)
    for (const split of [1, 2, 3, 7, 65536]) {
      const { result, out } = await decode(uri, split);
      assert.deepEqual([...out.bytes], expected);
      assert.deepEqual(result.dataURL, { mime, parameters });
      assert.equal(
        result.outputSha256,
        createHash("sha256").update(Uint8Array.from(expected)).digest("hex"),
      );
      assert.equal(out.committed, true);
      const editor = parseDataURL(uri);
      assert.deepEqual([...editor.bytes], expected);
      assert.equal(editor.mime, mime);
      assert.deepEqual(editor.parameters, parameters);
    }
});
test("every percent-encoded octet roundtrips without UTF-8 normalization or plus conversion", () => {
  const expected = Uint8Array.from({ length: 256 }, (_, i) => i),
    source = ascii(
      Array.from(
        expected,
        (byte) => "%" + byte.toString(16).padStart(2, "0"),
      ).join(""),
    );
  for (const split of [1, 2, 3, 4, 17, 257]) {
    const decoder = new PercentOctetDecoder(),
      parts = [];
    for (let at = 0; at < source.length; at += split)
      parts.push(decoder.push(source.subarray(at, at + split)));
    parts.push(decoder.push(new Uint8Array(), true));
    assert.deepEqual(Buffer.concat(parts), Buffer.from(expected));
  }
  assert.deepEqual(
    [...new PercentOctetDecoder().push(ascii("+%2B%20%2520"), true)],
    [43, 43, 32, 37, 50, 48],
  );
});
test("malformed percent escapes report the exact absolute percent offset and abort partial output", async () => {
  for (const [uri, offset] of [
    ["data:,%", 6],
    ["data:,a%2", 7],
    ["data:,a%2G", 7],
    ["data:;name=%Q0,abc", 11],
    ["data:text/plain,x%0z", 17],
  ])
    for (const split of [1, 2, 7, 65536]) {
      const out = sink(),
        bytes = ascii(uri);
      await assert.rejects(
        convertStream({
          source: async function* () {
            for (let at = 0; at < bytes.length; at += split)
              yield bytes.subarray(at, at + split);
          },
          sink: out,
          mode: "decode",
        }),
        (error) => error.code === "data-url-percent" && error.offset === offset,
      );
      assert.equal(out.aborted, true);
      assert.equal(out.committed, false);
      assert.equal(out.bytes.length, 0);
      assert.throws(
        () => parseDataURL(uri),
        (error) => error.code === "data-url-percent" && error.offset === offset,
      );
    }
});
test("raw unsafe bytes are rejected and encoded delimiters decode only once", () => {
  for (const [value, offset] of [
    ["data:,a b", 7],
    ["data:,a#b", 7],
    ["data:,a\nb", 7],
  ])
    assert.throws(
      () => parseDataURL(value),
      (error) => error.code === "data-url-character" && error.offset === offset,
    );
  assert.deepEqual(
    [...parseDataURL("data:,%3Cscript%3E%252F").bytes],
    [60, 115, 99, 114, 105, 112, 116, 62, 37, 50, 70],
  );
});
test("existing Base64 data URLs retain their byte semantics and parameter inventory", async () => {
  const uri = "data:application/octet-stream;base64,+/8=",
    { result, out } = await decode(uri, 1);
  assert.deepEqual([...out.bytes], [251, 255]);
  assert.deepEqual(result.dataURL, {
    mime: "application/octet-stream",
    parameters: [],
  });
  assert.deepEqual([...parseDataURL(uri).bytes], [251, 255]);
  assert.throws(() => parseDataURL("data:text/plain;base64,%2B/8="));
});
test("conservative decode quota accommodates a large mostly literal URI without whole-file reads", async () => {
  const count = 80,
    chunk = new Uint8Array(65536).fill(65),
    header = ascii("data:,"),
    out = sink();
  const result = await convertStream({
    source: async function* () {
      yield header;
      for (let i = 0; i < count; i++) yield chunk;
    },
    sink: out,
    mode: "decode",
  });
  assert.equal(result.outputSize, count * 65536);
  assert.ok(storageBudget(result.inputSize, "decode") >= result.outputSize);
  const expected = createHash("sha256");
  for (let i = 0; i < count; i++) expected.update(chunk);
  assert.equal(result.outputSha256, expected.digest("hex"));
  assert.equal(out.committed, true);
});
