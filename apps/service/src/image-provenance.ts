import type { Store } from "./db.js";
// Old records lack evidence of their launch resolution. Mark that absence without consulting today's provider image.
export async function initializeImageProvenance(store: Store) {
  for (const worker of await store.all<any>("workers"))
    if (!Object.hasOwn(worker, "imageProvenance")) {
      worker.imageProvenance = null;
      await store.put("workers", worker.id, worker);
    }
  for (const operation of await store.all<any>("operations"))
    if (operation.action === "launch" && Array.isArray(operation.targets)) {
      let changed = false;
      for (const target of operation.targets)
        if (!Object.hasOwn(target, "imageProvenance")) {
          target.imageProvenance = null;
          changed = true;
        }
      if (changed) await store.put("operations", operation.id, operation);
    }
}
