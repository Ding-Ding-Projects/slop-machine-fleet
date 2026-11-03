export function fakeStorage(quota = 1024) {
  const files = new Map(),
    tails = new Map();
  const locks = {
    request(key, options, action) {
      const next = (tails.get(key) || Promise.resolve())
        .catch(() => {})
        .then(action);
      tails.set(key, next);
      return next;
    },
  };
  let accesses = 0;
  const missing = () =>
    Object.assign(Error("missing"), { name: "NotFoundError" });
  const directory = {
    async getFileHandle(name, options = {}) {
      if (!files.has(name) && !options.create) throw missing();
      if (!files.has(name)) files.set(name, []);
      return {
        async createWritable() {
          files.set(name, []);
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
    locks,
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
