export function createRunLifecycle({
  generation,
  worker,
  timer,
  pending,
  activeId,
  retire,
  onReset,
  onPause,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const clear = () => {
    if (timer.current !== null) clearTimer(timer.current);
    timer.current = null;
  };
  const stop = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    clear();
    pending.current?.(Error("cancelled"));
    pending.current = null;
    const id = activeId.current;
    activeId.current = null;
    if (id) void retire(id);
    onReset();
  };
  return {
    stop,
    cancel() {
      worker.current?.postMessage({ type: "cancel" });
      onPause(false);
      clear();
      timer.current = setTimer(stop, 1500);
    },
    finish(owner) {
      if (owner !== generation.current) return false;
      worker.current?.terminate();
      worker.current = null;
      clear();
      pending.current = null;
      onReset();
      return true;
    },
  };
}
