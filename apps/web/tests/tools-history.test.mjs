import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  openHistory,
  metadataOnly,
} from "../../../packages/shared/local-base64/history.mjs";
const require = createRequire(
  new URL(
    "../../../packages/shared/local-base64/package.json",
    import.meta.url,
  ),
);
const { IDBFactory } = require("fake-indexeddb");
const record = (name) => ({
  name,
  mode: "encode",
  inputSize: 3,
  outputSize: 4,
  inputSha256: "a".repeat(64),
  outputSha256: "b".repeat(64),
  options: { url: false, padding: true, strict: true, wrap: 0 },
});
test("durable metadata transactions preserve undo/redo over reopening and new work forks safely", async () => {
  const factory = new IDBFactory();
  let db = await openHistory(factory);
  await db.append(record("one"));
  await db.append(record("two"));
  assert.deepEqual(
    (await db.page()).entries.map((x) => x.metadata.name),
    ["two", "one"],
  );
  await db.undo();
  db.close();
  db = await openHistory(factory);
  assert.equal((await db.page()).entries[0].metadata.name, "one");
  assert.equal((await db.page()).canRedo, true);
  await db.redo();
  assert.equal((await db.page()).entries[0].metadata.name, "two");
  await db.undo();
  await db.append(record("three"));
  assert.equal((await db.page()).canRedo, false);
  assert.deepEqual(
    (await db.page()).entries.map((x) => x.metadata.name),
    ["three", "one"],
  );
  await assert.rejects(db.clear(false));
  assert.equal((await db.page()).entries.length, 2);
  await db.clear(true);
  assert.equal((await db.page()).entries.length, 0);
  db.close();
});
test("payload-shaped fields are rejected before durable storage and paging is bounded", async () => {
  for (const addition of [
    { text: "payload" },
    { bytes: new Uint8Array([1]) },
    { file: new Blob(["payload"]) },
    { options: { payload: "content" } },
  ])
    assert.throws(() => metadataOnly({ ...record("safe"), ...addition }));
  const db = await openHistory(new IDBFactory());
  await assert.rejects(db.append({ ...record("safe"), text: "not metadata" }));
  assert.equal((await db.page()).entries.length, 0);
  for (let i = 0; i < 45; i++) await db.append(record(String(i)));
  const page = await db.page(null, 20);
  assert.equal(page.entries.length, 20);
  const older = await db.page(page.next, 20);
  assert.equal(older.entries[0].metadata.name, "24");
  assert.equal(Object.hasOwn(older.entries[0].metadata, "text"), false);
  db.close();
});
