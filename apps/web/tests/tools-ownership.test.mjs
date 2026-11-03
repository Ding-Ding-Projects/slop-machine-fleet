import test from "node:test";
import assert from "node:assert/strict";
import {
  claimTemporary,
  createTemporarySink,
  removeTemporary,
  acquireAndStart,
} from "../../../packages/shared/local-base64/storage.mjs";
import { fakeStorage } from "./tools-storage-fixture.mjs";
const id = "11111111-1111-1111-1111-111111111111";
test("collision proposal never becomes owned and existing bytes survive the full acquisition consumer", async () => {
  const storage = fakeStorage();
  const original = Uint8Array.of(7, 8, 9);
  storage.files.set(id + ".tmp", [original]);
  let retained = 0,
    retired = 0,
    started = 0;
  await assert.rejects(
    acquireAndStart({
      acquire: () =>
        claimTemporary({
          consent: true,
          expectedBytes: 100,
          storage,
          locks: storage.locks,
          id,
        }),
      retain: () => retained++,
      retire: () => retired++,
      isCurrent: () => true,
      start: () => started++,
    }),
    (error) => error.code === "storage-collision",
  );
  assert.deepEqual(storage.files.get(id + ".tmp"), [original]);
  assert.equal(retained + retired + started, 0);
});
test("termination during acquisition retires its eventual proven claim before any worker starts", async () => {
  const storage = fakeStorage();
  let release,
    current = true,
    retained,
    started = 0;
  const barrier = new Promise((resolve) => (release = resolve));
  const pending = acquireAndStart({
    acquire: async () => {
      const claim = await claimTemporary({
        consent: true,
        expectedBytes: 100,
        storage,
        locks: storage.locks,
      });
      await barrier;
      return claim;
    },
    retain: (claim) => (retained = claim),
    isCurrent: () => current,
    start: () => started++,
    retire: () => removeTemporary(retained, storage, storage.locks),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storage.files.size, 2);
  current = false;
  release();
  await assert.rejects(pending, (error) => error.code === "cancelled");
  assert.equal(started, 0);
  assert.equal(storage.files.size, 0);
});
test("termination before attachment acknowledgement already has exact ownership; competing claim and mismatched cleanup cannot destroy it", async () => {
  const storage = fakeStorage();
  let retained, started;
  await acquireAndStart({
    acquire: () =>
      claimTemporary({
        consent: true,
        expectedBytes: 100,
        storage,
        locks: storage.locks,
        id,
      }),
    retain: (claim) => (retained = claim),
    isCurrent: () => true,
    start: (claim) => (started = claim),
    retire: () => {
      throw Error("not expected");
    },
  });
  assert.equal(started, retained);
  await assert.rejects(
    claimTemporary({
      consent: true,
      expectedBytes: 100,
      storage,
      locks: storage.locks,
      id,
    }),
    (error) => error.code === "storage-collision",
  );
  await assert.rejects(
    removeTemporary(
      { ...retained, owner: "22222222-2222-2222-2222-222222222222" },
      storage,
      storage.locks,
    ),
    (error) => error.code === "storage-ownership",
  );
  assert.equal(storage.files.size, 2);
  await removeTemporary(retained, storage, storage.locks);
  assert.equal(storage.files.size, 0);
});
test("two same-id acquisition attempts serialize to one owner and preserve the winning marker", async () => {
  const storage = fakeStorage();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      claimTemporary({
        consent: true,
        expectedBytes: 100,
        storage,
        locks: storage.locks,
        id,
      }),
    ),
  );
  assert.equal(
    results.filter((value) => value.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter(
      (value) =>
        value.status === "rejected" &&
        value.reason.code === "storage-collision",
    ).length,
    1,
  );
  const claim = results.find((value) => value.status === "fulfilled").value;
  const sink = await createTemporarySink({
    claim,
    storage,
    locks: storage.locks,
  });
  await sink.abort();
  assert.equal(storage.files.size, 0);
});
