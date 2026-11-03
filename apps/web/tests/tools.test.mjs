import test from "node:test";
import assert from "node:assert/strict";
import {
  encode64,
  decode64,
  encodeText,
  decodeText,
  parseDataURL,
  parseDelimited,
  convertData,
  imageDimensions,
  MAX_BYTES,
} from "../src/tools/core.mjs";
test("Base64 roundtrips every byte, both alphabets and omitted padding", () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (const url of [false, true])
    for (const padding of [false, true])
      assert.deepEqual(
        decode64(encode64(bytes, { url, padding, wrap: 76 }), {
          url,
          strict: false,
        }),
        bytes,
      );
});
test("strict decoder rejects wrong alphabet, malformed padding, whitespace and nonzero pad bits", () => {
  for (const input of ["Zg", "Z g==", "Zh==", "Zg===", "Z=g=", "a", "-_8="])
    assert.throws(() => decode64(input));
  assert.deepEqual(decode64("-_8=", { url: true }), new Uint8Array([251, 255]));
  assert.throws(() => decode64("+/8=", { url: true }));
});
test("text codecs preserve UTF-16 and Latin-1 without Windows-1252 substitution", () => {
  for (const enc of ["utf-8", "utf-16le", "utf-16be"])
    assert.equal(decodeText(encodeText("廣東話 🐈", enc), enc), "廣東話 🐈");
  assert.equal(
    decodeText(encodeText("\u0080ÿ", "latin1"), "latin1"),
    "\u0080ÿ",
  );
  assert.throws(() => encodeText("貓", "latin1"));
  assert.throws(() => decodeText(new Uint8Array([255])));
});
test("Base64 data URL parser preserves its existing bounded behavior and parameters", () => {
  const result = parseDataURL("data:text/plain;charset=utf-8;base64,aGk=");
  assert.equal(decodeText(result.bytes), "hi");
  assert.deepEqual(result.parameters, ["charset=utf-8"]);
  for (const s of [
    "https://x",
    "data:text/html,<script>",
    "data:text/plain;base64,a===",
  ])
    assert.throws(() => parseDataURL(s));
});
test("CSV preserves commas quotes and multiline cells with rectangular validation", () => {
  assert.deepEqual(parseDelimited('a,"b,c"\r\n"d""e","f\ng"', ","), [
    ["a", "b,c"],
    ['d"e', "f\ng"],
  ]);
  for (const s of ['"open', '"x"bad,y', "a,b\nc"])
    assert.throws(() => parseDelimited(s, ","));
  const input = encodeText('[["a,b","<script>"],["x","y"]]');
  const csv = convertData(input, "json", "csv");
  assert.deepEqual(JSON.parse(decodeText(convertData(csv, "csv", "json"))), [
    ["a,b", "<script>"],
    ["x", "y"],
  ]);
});
test("conversion refuses nested objects and excessive inputs", () => {
  assert.throws(() => convertData(encodeText('{"x":1}'), "json", "csv"));
  assert.throws(() => encode64(new Uint8Array(MAX_BYTES + 1)));
  assert.throws(() => convertData(encodeText("hello"), "yaml", "json"));
});
test("image headers are checked before decoding", () => {
  const bytes = new Uint8Array(24),
    v = new DataView(bytes.buffer);
  v.setUint32(16, 100);
  v.setUint32(20, 100);
  assert.deepEqual(imageDimensions(bytes, "image/png"), {
    width: 100,
    height: 100,
  });
  v.setUint32(16, 9000);
  assert.throws(() => imageDimensions(bytes, "image/png"));
  assert.throws(() => imageDimensions(new Uint8Array(4), "image/jpeg"));
});
