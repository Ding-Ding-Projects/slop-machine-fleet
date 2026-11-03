import test from "node:test";
import assert from "node:assert/strict";
import { decodeTextPreview } from "../../../packages/shared/local-base64/preview.mjs";
function utf16(text, little) {
  const bytes = new Uint8Array(text.length * 2),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++)
    view.setUint16(i * 2, text.charCodeAt(i), little);
  return bytes;
}
test("valid UTF-8 split at the real 65536-byte preview boundary remains text with explicit truncation", () => {
  const original = "a".repeat(65535) + "😺",
    full = new TextEncoder().encode(original),
    prefix = full.subarray(0, 65536);
  assert.equal(full.length, 65539);
  assert.equal(
    new TextDecoder("utf-8", { fatal: true }).decode(full),
    original,
  );
  assert.throws(() => new TextDecoder("utf-8", { fatal: true }).decode(prefix));
  assert.deepEqual(decodeTextPreview(prefix, "utf-8", true), {
    text: "a".repeat(65535),
    truncated: true,
  });
  assert.throws(() => decodeTextPreview(prefix, "utf-8", false));
});
test("UTF-16 LE and BE omit only an incomplete terminal surrogate or byte from truncated prefixes", () => {
  const original = "a".repeat(32767) + "😺";
  for (const [encoding, little] of [
    ["utf-16le", true],
    ["utf-16be", false],
  ]) {
    const full = utf16(original, little);
    assert.equal(full.length, 65538);
    assert.equal(
      new TextDecoder(encoding, { fatal: true }).decode(full),
      original,
    );
    for (const end of [65535, 65536]) {
      const prefix = full.subarray(0, end);
      assert.throws(() =>
        new TextDecoder(encoding, { fatal: true }).decode(prefix),
      );
      assert.deepEqual(decodeTextPreview(prefix, encoding, true), {
        text: "a".repeat(32767),
        truncated: true,
      });
      assert.throws(() => decodeTextPreview(prefix, encoding, false));
    }
  }
});
test("genuinely invalid interior sequences stay fatal even when more bytes exist", () => {
  for (const bytes of [
    Uint8Array.of(97, 255, 98),
    Uint8Array.of(97, 0xe0, 0x80, 0x80, 98),
    Uint8Array.of(97, 0xf0, 0x28, 0x8c, 0xbc, 98),
  ])
    assert.throws(() => decodeTextPreview(bytes, "utf-8", true));
  for (const [encoding, little] of [
    ["utf-16le", true],
    ["utf-16be", false],
  ])
    for (const value of ["a\udc00b", "a\ud800b"])
      assert.throws(() =>
        decodeTextPreview(utf16(value, little), encoding, true),
      );
});
test("complete text and Latin-1 retain exact characters and the preview stays bounded", () => {
  assert.deepEqual(
    decodeTextPreview(new TextEncoder().encode("廣東話 😺"), "utf-8", false),
    { text: "廣東話 😺", truncated: false },
  );
  assert.deepEqual(decodeTextPreview(Uint8Array.of(128, 255), "latin1", true), {
    text: "\u0080ÿ",
    truncated: true,
  });
  assert.throws(() => decodeTextPreview(new Uint8Array(65537), "utf-8", true));
});
