import { Base64Error, blobChunks } from "./codec.mjs";
export const TEMP_DIRECTORY = "fleet-base64-v1";
export function storageBudget(size, mode, wrap = 0) {
  if (!Number.isSafeInteger(size) || size < 0) throw new Base64Error("size");
  const encoded = 4 * Math.ceil(size / 3);
  const estimate =
    mode === "encode"
      ? encoded + (wrap ? 2 * Math.floor(encoded / wrap) : 0)
      : Math.ceil((size * 3) / 4);
  if (!Number.isSafeInteger(estimate)) throw new Base64Error("size");
  return estimate + 1024 * 1024;
}
export async function createTemporarySink({
  consent,
  expectedBytes,
  storage = globalThis.navigator?.storage,
  id = crypto.randomUUID(),
}) {
  if (consent !== true) throw new Base64Error("storage-consent");
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0)
    throw new Base64Error("size");
  if (!storage?.getDirectory || !storage?.estimate)
    throw new Base64Error("storage-unavailable");
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Base64Error("storage-id");
  const estimate = await storage.estimate();
  if (
    !Number.isFinite(estimate.quota) ||
    !Number.isFinite(estimate.usage) ||
    estimate.quota - estimate.usage < expectedBytes
  )
    throw new Base64Error("storage-quota");
  const root = await storage.getDirectory(),
    directory = await root.getDirectoryHandle(TEMP_DIRECTORY, { create: true });
  try {
    await directory.getFileHandle(id + ".tmp");
    throw new Base64Error("storage-collision");
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
  const handle = await directory.getFileHandle(id + ".tmp", { create: true });
  let writer,
    committed = false,
    sealed = false,
    total = 0;
  try {
    writer = await handle.createWritable({ keepExistingData: false });
  } catch (error) {
    await directory.removeEntry(id + ".tmp").catch(() => {});
    throw new Base64Error("storage-write");
  }
  return {
    id,
    async write(bytes) {
      if (sealed) throw new Base64Error("storage-write");
      total += bytes.length;
      if (total > expectedBytes) throw new Base64Error("storage-quota");
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
      await directory.removeEntry(id + ".tmp").catch(() => {});
    },
  };
}
export async function removeTemporary(
  id,
  storage = globalThis.navigator?.storage,
) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Base64Error("storage-id");
  const root = await storage.getDirectory();
  try {
    const directory = await root.getDirectoryHandle(TEMP_DIRECTORY);
    await directory.removeEntry(id + ".tmp");
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
}
