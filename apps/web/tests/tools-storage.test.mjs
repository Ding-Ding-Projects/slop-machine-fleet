import test from "node:test";
import assert from "node:assert/strict";
import {
  createTemporarySink,
  removeTemporary,
  storageBudget,
} from "../../../packages/shared/local-base64/storage.mjs";
import { fakeStorage } from "./tools-storage-fixture.mjs";

test("temporary storage is never accessed without consent or sufficient verified quota", async () => {
  const storage = fakeStorage();
  await assert.rejects(
    createTemporarySink({
      consent: false,
      expectedBytes: 100,
      storage,
      locks: storage.locks,
    }),
    (error) => error.code === "storage-consent",
  );
  await assert.rejects(
    createTemporarySink({
      consent: true,
      expectedBytes: 2048,
      storage,
      locks: storage.locks,
    }),
    (error) => error.code === "storage-quota",
  );
  await assert.rejects(
    createTemporarySink({
      consent: true,
      expectedBytes: NaN,
      storage,
      locks: storage.locks,
    }),
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
      locks: storage.locks,
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
  await removeTemporary(sink.claim, storage, storage.locks);
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
    locks: storage.locks,
    id,
  });
  await assert.rejects(
    sink.write(new Uint8Array(3)),
    (error) => error.code === "storage-quota",
  );
  await assert.rejects(
    createTemporarySink({
      consent: true,
      expectedBytes: 2,
      storage,
      id,
      locks: storage.locks,
    }),
    (error) => error.code === "storage-collision",
  );
  await sink.abort();
  assert.equal(storage.files.size, 0);
  assert.ok(storageBudget(1024, "encode", 76) > 1024);
});
