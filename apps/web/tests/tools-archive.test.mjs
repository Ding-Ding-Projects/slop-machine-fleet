import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createVerifiedZip,
  zipPlan,
} from "../../../packages/shared/local-base64/archive.mjs";
import { CHUNK_BYTES } from "../../../packages/shared/local-base64/codec.mjs";
function sink(corrupt = false) {
  const parts = [];
  let committed = false,
    aborted = false,
    active = 0,
    max = 0;
  return {
    async write(bytes) {
      active++;
      max = Math.max(max, active);
      assert.ok(bytes.length <= CHUNK_BYTES);
      await new Promise((resolve) => setTimeout(resolve, 1));
      parts.push(bytes.slice());
      active--;
    },
    async seal() {},
    async *chunks() {
      const all = Buffer.concat(parts);
      if (corrupt) all[35] ^= 1;
      for (let i = 0; i < all.length; i += CHUNK_BYTES)
        yield all.subarray(i, i + CHUNK_BYTES);
    },
    async commit() {
      committed = true;
    },
    async abort() {
      aborted = true;
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
    get max() {
      return max;
    },
  };
}
test("ZIP streams await each output write and actual stored member bytes match independently", async () => {
  const files = [
      { name: "../first.txt", file: new Blob(["first contents"]) },
      { name: "two.txt", file: new Blob(["second contents"]) },
    ],
    out = sink();
  const result = await createVerifiedZip({ files, sink: out });
  assert.equal(out.max, 1);
  assert.equal(out.committed, true);
  assert.equal(
    result.outputSha256,
    createHash("sha256").update(out.bytes).digest("hex"),
  );
  const bytes = out.bytes,
    eocd = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(eocd), 0x06054b50);
  let central = bytes.readUInt32LE(eocd + 16);
  for (const expected of ["first contents", "second contents"]) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    const size = bytes.readUInt32LE(central + 20),
      nameLength = bytes.readUInt16LE(central + 28),
      extra = bytes.readUInt16LE(central + 30),
      comment = bytes.readUInt16LE(central + 32),
      local = bytes.readUInt32LE(central + 42);
    assert.equal(bytes.readUInt16LE(local + 8), 0);
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    assert.equal(bytes.subarray(start, start + size).toString(), expected);
    assert.ok(
      !bytes
        .subarray(central + 46, central + 46 + nameLength)
        .toString()
        .includes("/"),
    );
    central += 46 + nameLength + extra + comment;
  }
});
test("ZIP32 overflow and corrupted archive never produce committed results", async () => {
  assert.throws(() => zipPlan([{ name: "huge", file: { size: 0x100000000 } }]));
  const out = sink(true);
  await assert.rejects(
    createVerifiedZip({
      files: [{ name: "one", file: new Blob(["payload"]) }],
      sink: out,
    }),
  );
  assert.equal(out.committed, false);
  assert.equal(out.aborted, true);
});
