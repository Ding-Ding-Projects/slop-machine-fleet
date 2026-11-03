import { Base64Error } from "./codec.mjs";
const allowed = [
  "name",
  "mode",
  "inputSize",
  "outputSize",
  "inputSha256",
  "outputSha256",
  "options",
  "at",
];
export function metadataOnly(value) {
  if (!value || Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Base64Error("history-metadata");
  if (
    typeof value.name !== "string" ||
    value.name.length > 255 ||
    !["encode", "decode", "zip"].includes(value.mode) ||
    !["inputSize", "outputSize"].every(
      (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
    ) ||
    !["inputSha256", "outputSha256"].every((key) =>
      /^[a-f0-9]{64}$/.test(value[key]),
    )
  )
    throw new Base64Error("history-metadata");
  const options = value.options || {};
  const keys = [
    "url",
    "padding",
    "strict",
    "wrap",
    "encoding",
    "dataURL",
    "mime",
    "compression",
    "entries",
  ];
  if (
    Object.keys(options).some((key) => !keys.includes(key)) ||
    Object.values(options).some(
      (item) =>
        !["boolean", "number", "string"].includes(typeof item) ||
        (typeof item === "string" && item.length > 255),
    )
  )
    throw new Base64Error("history-metadata");
  return {
    name: value.name.replace(/[\u0000-\u001f]/g, ""),
    mode: value.mode,
    inputSize: value.inputSize,
    outputSize: value.outputSize,
    inputSha256: value.inputSha256,
    outputSha256: value.outputSha256,
    options: { ...options },
    at:
      typeof value.at === "string" &&
      /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value.at)
        ? value.at
        : new Date().toISOString(),
  };
}
const request = (value) =>
  new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(new Base64Error("history-storage"));
  });
export async function openHistory(factory = globalThis.indexedDB) {
  if (!factory) throw new Base64Error("history-storage");
  const opening = factory.open("fleet.base64.history.v1", 1);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
    db.createObjectStore("redo", { keyPath: "id", autoIncrement: true });
    db.createObjectStore("state");
  };
  const db = await request(opening);
  const transact = async (action) => {
    const tx = db.transaction(["entries", "redo", "state"], "readwrite"),
      done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(new Base64Error("history-storage"));
        tx.onabort = () => reject(new Base64Error("history-storage"));
      });
    try {
      const value = await action(tx);
      await done;
      return value;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw error;
    }
  };
  return {
    close: () => db.close(),
    async append(value) {
      const metadata = metadataOnly(value);
      return transact(async (tx) => {
        const stateStore = tx.objectStore("state"),
          state = (await request(stateStore.get("cursor"))) || {
            current: null,
            redo: null,
          };
        const id = await request(
          tx.objectStore("entries").add({ previous: state.current, metadata }),
        );
        await request(stateStore.put({ current: id, redo: null }, "cursor"));
        return id;
      });
    },
    async undo() {
      return transact(async (tx) => {
        const stateStore = tx.objectStore("state"),
          state = await request(stateStore.get("cursor"));
        if (!state?.current) return false;
        const entry = await request(
          tx.objectStore("entries").get(state.current),
        );
        if (!entry) throw new Base64Error("history-storage");
        const redo = await request(
          tx
            .objectStore("redo")
            .add({ entry: state.current, next: state.redo }),
        );
        await request(
          stateStore.put({ current: entry.previous, redo }, "cursor"),
        );
        return true;
      });
    },
    async redo() {
      return transact(async (tx) => {
        const stateStore = tx.objectStore("state"),
          state = await request(stateStore.get("cursor"));
        if (!state?.redo) return false;
        const redo = await request(tx.objectStore("redo").get(state.redo));
        if (!redo) throw new Base64Error("history-storage");
        await request(
          stateStore.put({ current: redo.entry, redo: redo.next }, "cursor"),
        );
        return true;
      });
    },
    async page(before = null, limit = 20) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Base64Error("history-limit");
      return transact(async (tx) => {
        const state = (await request(
          tx.objectStore("state").get("cursor"),
        )) || { current: null, redo: null };
        let cursor = before || state.current;
        const entries = [];
        while (cursor && entries.length < limit) {
          const entry = await request(tx.objectStore("entries").get(cursor));
          if (!entry) throw new Base64Error("history-storage");
          entries.push(entry);
          cursor = entry.previous;
        }
        return {
          entries,
          next: cursor,
          canUndo: !!state.current,
          canRedo: !!state.redo,
        };
      });
    },
    async clear(confirmed) {
      if (confirmed !== true) throw new Base64Error("history-confirmation");
      return transact(async (tx) => {
        for (const name of ["entries", "redo", "state"])
          await request(tx.objectStore(name).clear());
      });
    },
  };
}
