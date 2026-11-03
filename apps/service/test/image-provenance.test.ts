import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { Store, migrate } from "../src/db.js";
import { initializeImageProvenance } from "../src/image-provenance.js";
test("legacy worker and launch records persist explicit unknown provenance without changing known evidence", async () => {
  const pg = newDb().adapters.createPg(),
    db = new pg.Pool(),
    store = new Store(db);
  try {
    await migrate(db);
    const legacy = {
        id: "legacy-worker",
        instanceId: "i-old",
        region: "us-east-1",
        state: "ready",
        historicalField: "preserve-this",
      },
      known = {
        id: "known-worker",
        imageProvenance: {
          imageId: "ami-recorded",
          source: "historical-test-evidence",
        },
      };
    await store.put("workers", legacy.id, legacy);
    await store.put("workers", known.id, known);
    await store.put("operations", "old-launch", {
      id: "old-launch",
      action: "launch",
      targets: [
        { id: legacy.id, state: "ready" },
        {
          id: known.id,
          state: "ready",
          imageProvenance: known.imageProvenance,
        },
      ],
    });
    await initializeImageProvenance(store);
    await initializeImageProvenance(store);
    assert.deepEqual(await store.get("workers", legacy.id), {
      ...legacy,
      imageProvenance: null,
    });
    assert.deepEqual(await store.get("workers", known.id), known);
    const op = await store.get("operations", "old-launch");
    assert.equal(op.targets[0].imageProvenance, null);
    assert.deepEqual(op.targets[1].imageProvenance, known.imageProvenance);
  } finally {
    await db.end();
  }
});
