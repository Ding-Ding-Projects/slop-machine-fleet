const unknown = () => ({ known: false, dirty: false, pendingWrites: false });
export function deriveToolSafety({
  hasDraft = false,
  hasFiles = false,
  hasOutput = false,
  optionsChanged = false,
  busy = false,
} = {}) {
  if (
    ![hasDraft, hasFiles, hasOutput, optionsChanged, busy].every(
      (value) => typeof value === "boolean",
    )
  )
    return unknown();
  return {
    known: true,
    dirty: hasDraft || hasFiles || hasOutput || optionsChanged,
    pendingWrites: busy,
  };
}
export function createSafetyRegistry(requiredKeys) {
  const required = new Set(requiredKeys),
    records = new Map(),
    listeners = new Set();
  function snapshot() {
    const values = [...required].map(
      (key) => records.get(key)?.state || unknown(),
    );
    return {
      known: values.every((value) => value.known),
      dirty: values.some((value) => value.dirty),
      pendingWrites: values.some((value) => value.pendingWrites),
    };
  }
  const emit = () => {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  };
  return {
    snapshot,
    canLeave() {
      const state = snapshot();
      return state.known && !state.dirty && !state.pendingWrites;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    register(key, discard) {
      if (!required.has(key)) throw Error("Unknown tool safety scope");
      const owner = Symbol(key);
      records.set(key, { owner, discard, state: unknown() });
      emit();
      return {
        update(value) {
          if (records.get(key)?.owner !== owner) return;
          const valid =
            value &&
            ["known", "dirty", "pendingWrites"].every(
              (field) => typeof value[field] === "boolean",
            );
          records.get(key).state = valid
            ? {
                known: value.known,
                dirty: value.dirty,
                pendingWrites: value.pendingWrites,
              }
            : unknown();
          emit();
        },
        unregister() {
          if (records.get(key)?.owner === owner) {
            records.delete(key);
            emit();
          }
        },
      };
    },
    discard() {
      // Only the owner calls this after an explicit discard decision.
      for (const entry of records.values()) entry.discard();
      for (const entry of records.values()) entry.state = unknown();
      emit();
    },
  };
}
