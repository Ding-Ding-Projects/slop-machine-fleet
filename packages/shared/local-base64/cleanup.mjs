export function createCleanupQueue({
  remove,
  attempts = 3,
  wait = () => new Promise((resolve) => setTimeout(resolve, 100)),
}) {
  const claims = new Map(),
    jobs = new Map(),
    failures = new Set(),
    listeners = new Set();
  let tail = Promise.resolve(),
    acquiring = 0;
  const snapshot = () => ({
    pending: jobs.size + acquiring,
    failed: failures.size,
    owned: claims.size,
  });
  const emit = () => {
    for (const listener of listeners) listener(snapshot());
  };
  const retire = (id) => {
    if (jobs.has(id)) return jobs.get(id);
    const claim = claims.get(id);
    if (!claim) return Promise.resolve(true);
    let resolve;
    const promise = new Promise((done) => (resolve = done));
    jobs.set(id, promise);
    emit();
    tail = tail
      .catch(() => {})
      .then(async () => {
        let success = false;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            await remove(claim);
            success = true;
            break;
          } catch {
            if (attempt + 1 < attempts) await wait();
          }
        }
        if (success) {
          claims.delete(id);
          failures.delete(id);
        } else failures.add(id);
        jobs.delete(id);
        emit();
        resolve(success);
      });
    return promise;
  };
  return {
    snapshot,
    async trackAcquisition(action) {
      acquiring++;
      emit();
      try {
        return await action();
      } finally {
        acquiring--;
        emit();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    retain(claim) {
      const old = claims.get(claim.id);
      if (old && old.owner !== claim.owner) throw Error("storage-ownership");
      claims.set(claim.id, claim);
      emit();
    },
    retire,
    retryFailed() {
      return Promise.all([...failures].map(retire));
    },
  };
}
export function streamingSafety({
  hasFiles,
  hasOutputs,
  running,
  busy,
  cleanupPending,
  cleanupError,
}) {
  return {
    known: !cleanupPending && !cleanupError,
    dirty: !!hasFiles || !!hasOutputs,
    pendingWrites: !!running || !!busy || !!cleanupPending,
  };
}
