import test from "node:test";
import assert from "node:assert/strict";
import {
  createTemporarySink,
  removeTemporary,
  storageBudget,
} from "../../../packages/shared/local-base64/storage.mjs";
function fakeStorage(quota = 1024) {
  const files = new Map();
  let accesses = 0;
  const missing = () =>
    Object.assign(Error("missing"), { name: "NotFoundError" });
  const directory = {
    async getFileHandle(name, options = {}) {
      if (!files.has(name) && !options.create) throw missing();
      if (!files.has(name)) files.set(name, []);
      return {
        async createWritable() {
          return {
            async write(bytes) {
              files.get(name).push(bytes.slice());
            },
            async close() {},
            async abort() {},
          };
        },
        async getFile() {
          return new Blob(files.get(name));
        },
      };
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw missing();
    },
  };
  return {
    files,
    get accesses() {
      return accesses;
    },
    async estimate() {
      return { quota, usage: 0 };
    },
    async getDirectory() {
      accesses++;
      return {
        async getDirectoryHandle() {
          return directory;
        },
      };
    },
  };
}
test("temporary storage is never accessed without consent or sufficient verified quota", async () => {
  const storage = fakeStorage();
  await assert.rejects(
    createTemporarySink({ consent: false, expectedBytes: 100, storage }),
    (error) => error.code === "storage-consent",
  );
  await assert.rejects(
    createTemporarySink({ consent: true, expectedBytes: 2048, storage }),
    (error) => error.code === "storage-quota",
  );
  await assert.rejects(
    createTemporarySink({ consent: true, expectedBytes: NaN, storage }),
    (error) => error.code === "size",
  );
  assert.equal(storage.accesses, 0);
});
test("owned output cannot be offered before commit and cleanup affects only its exact file", async () => {
  const storage = fakeStorage(),
    sink = await createTemporarySink({
      consent: true,
      expectedBytes: 100,
      storage,
    });
  storage.files.set("unrelated.tmp", [new Uint8Array([99])]);
  await sink.write(new Uint8Array([1, 2, 3]));
  await sink.seal();
  await assert.rejects(sink.file(), (error) => error.code === "unverified");
  await sink.commit();
  assert.deepEqual(
    new Uint8Array(await (await sink.file()).arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );
  await removeTemporary(sink.id, storage);
  assert.equal(storage.files.size, 1);
  assert.ok(storage.files.has("unrelated.tmp"));
});
test("quota bounds and identifier collisions abort without overwriting an existing output", async () => {
  const storage = fakeStorage(),
    id = "12345678-1234-1234-1234-123456789abc";
  const sink = await createTemporarySink({
    consent: true,
    expectedBytes: 2,
    storage,
    id,
  });
  await assert.rejects(
    sink.write(new Uint8Array(3)),
    (error) => error.code === "storage-quota",
  );
  await assert.rejects(
    createTemporarySink({ consent: true, expectedBytes: 2, storage, id }),
    (error) => error.code === "storage-collision",
  );
  await sink.abort();
  assert.equal(storage.files.size, 0);
  assert.ok(storageBudget(1024, "encode", 76) > 1024);
});
