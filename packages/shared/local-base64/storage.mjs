import { Base64Error, blobChunks } from "./codec.mjs";
export const TEMP_DIRECTORY = "fleet-base64-v1";
const valid = (value) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
async function directoryFor(storage) {
  return (await storage.getDirectory()).getDirectoryHandle(TEMP_DIRECTORY, {
    create: true,
  });
}
async function exists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error.name === "NotFoundError") return false;
    throw error;
  }
}
async function exclusive(locks, id, action) {
  if (!locks?.request) throw new Base64Error("storage-unavailable");
  return locks.request(
    TEMP_DIRECTORY + ":" + id,
    { mode: "exclusive" },
    action,
  );
}
async function verifyOwner(directory, claim) {
  if (!valid(claim?.id) || !valid(claim?.owner))
    throw new Base64Error("storage-ownership");
  const marker = await directory.getFileHandle(claim.id + ".owner");
  const file = await marker.getFile();
  if (file.size > 128 || (await file.text()) !== claim.owner)
    throw new Base64Error("storage-ownership");
}
export function storageBudget(size, mode, wrap = 0) {
  if (!Number.isSafeInteger(size) || size < 0) throw new Base64Error("size");
  const encoded = 4 * Math.ceil(size / 3),
    estimate =
      mode === "encode"
        ? encoded + (wrap ? 2 * Math.floor(encoded / wrap) : 0)
        : size;
  if (!Number.isSafeInteger(estimate + 1048576)) throw new Base64Error("size");
  return estimate + 1048576;
}
export async function claimTemporary({
  consent,
  expectedBytes,
  storage = globalThis.navigator?.storage,
  locks = globalThis.navigator?.locks,
  id = crypto.randomUUID(),
  owner = crypto.randomUUID(),
}) {
  if (consent !== true) throw new Base64Error("storage-consent");
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0)
    throw new Base64Error("size");
  if (!storage?.getDirectory || !storage?.estimate)
    throw new Base64Error("storage-unavailable");
  if (!valid(id) || !valid(owner)) throw new Base64Error("storage-id");
  const estimate = await storage.estimate();
  if (
    !Number.isFinite(estimate.quota) ||
    !Number.isFinite(estimate.usage) ||
    estimate.quota - estimate.usage < expectedBytes
  )
    throw new Base64Error("storage-quota");
  return exclusive(locks, id, async () => {
    const directory = await directoryFor(storage);
    if (
      (await exists(directory, id + ".tmp")) ||
      (await exists(directory, id + ".owner"))
    )
      throw new Base64Error("storage-collision");
    let markerCreated = false,
      payloadCreated = false;
    try {
      const marker = await directory.getFileHandle(id + ".owner", {
        create: true,
      });
      markerCreated = true;
      const writer = await marker.createWritable({ keepExistingData: false });
      await writer.write(new TextEncoder().encode(owner));
      await writer.close();
      await directory.getFileHandle(id + ".tmp", { create: true });
      payloadCreated = true;
      return { id, owner, expectedBytes };
    } catch (error) {
      if (payloadCreated)
        await directory.removeEntry(id + ".tmp").catch(() => {});
      if (markerCreated)
        await directory.removeEntry(id + ".owner").catch(() => {});
      throw error;
    }
  });
}
export async function createTemporarySink({
  claim,
  storage = globalThis.navigator?.storage,
  locks = globalThis.navigator?.locks,
  ...options
}) {
  // Direct callers acquire their own claim; worker callers only attach a parent-held claim.
  const owned = claim || (await claimTemporary({ ...options, storage, locks }));
  let directory, handle, writer;
  await exclusive(locks, owned.id, async () => {
    directory = await directoryFor(storage);
    await verifyOwner(directory, owned);
    handle = await directory.getFileHandle(owned.id + ".tmp");
    writer = await handle.createWritable({ keepExistingData: false });
  });
  let committed = false,
    sealed = false,
    total = 0;
  return {
    id: owned.id,
    claim: owned,
    async write(bytes) {
      if (sealed) throw new Base64Error("storage-write");
      total += bytes.length;
      if (total > owned.expectedBytes) throw new Base64Error("storage-quota");
      try {
        await writer.write(bytes);
      } catch {
        throw new Base64Error("storage-write");
      }
    },
    async seal() {
      try {
        await writer.close();
        sealed = true;
      } catch {
        throw new Base64Error("storage-write");
      }
    },
    async *chunks() {
      if (!sealed) throw new Base64Error("storage-write");
      yield* blobChunks(await handle.getFile());
    },
    async commit() {
      if (!sealed) throw new Base64Error("storage-write");
      committed = true;
    },
    async file() {
      if (!committed) throw new Base64Error("unverified");
      return handle.getFile();
    },
    async abort() {
      committed = false;
      if (!sealed) await writer.abort().catch(() => {});
      await removeTemporary(owned, storage, locks);
    },
  };
}
export async function removeTemporary(
  claim,
  storage = globalThis.navigator?.storage,
  locks = globalThis.navigator?.locks,
) {
  if (!valid(claim?.id) || !valid(claim?.owner))
    throw new Base64Error("storage-ownership");
  return exclusive(locks, claim.id, async () => {
    let directory;
    try {
      directory = await (
        await storage.getDirectory()
      ).getDirectoryHandle(TEMP_DIRECTORY);
    } catch (error) {
      if (error.name === "NotFoundError") return;
      throw error;
    }
    const marker = await exists(directory, claim.id + ".owner"),
      payload = await exists(directory, claim.id + ".tmp");
    if (!marker && !payload) return;
    if (!marker) throw new Base64Error("storage-ownership");
    await verifyOwner(directory, claim);
    if (payload) await directory.removeEntry(claim.id + ".tmp");
    await directory.removeEntry(claim.id + ".owner");
  });
}
export async function acquireAndStart({
  acquire,
  retain,
  isCurrent,
  start,
  retire,
}) {
  const claim = await acquire();
  retain(claim);
  if (!isCurrent()) {
    await retire(claim.id);
    throw new Base64Error("cancelled");
  }
  try {
    start(claim);
    return claim;
  } catch (error) {
    await retire(claim.id);
    throw error;
  }
}
