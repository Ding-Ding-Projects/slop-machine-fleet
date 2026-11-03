import test from "node:test";
import assert from "node:assert/strict";
import { createRunLifecycle } from "../../../packages/shared/local-base64/lifecycle.mjs";
function consumer() {
  const generation = { current: 1 },
    worker = { current: null },
    timer = { current: null },
    pending = { current: null },
    activeId = { current: null },
    retired = [],
    timers = new Map();
  let busy = true,
    paused = true,
    rejected = 0,
    next = 0;
  pending.current = () => rejected++;
  const lifecycle = createRunLifecycle({
    generation,
    worker,
    timer,
    pending,
    activeId,
    retire: (id) => retired.push(id),
    onReset() {
      busy = false;
      paused = false;
    },
    onPause(value) {
      paused = value;
    },
    setTimer(callback) {
      timers.set(++next, callback);
      return next;
    },
    clearTimer(id) {
      timers.delete(id);
    },
  });
  return {
    lifecycle,
    generation,
    worker,
    timer,
    pending,
    activeId,
    retired,
    timers,
    get busy() {
      return busy;
    },
    get paused() {
      return paused;
    },
    get rejected() {
      return rejected;
    },
    begin() {
      busy = true;
      paused = false;
    },
  };
}
test("actual run lifecycle cancels then clears a delayed worker without locking the mounted consumer", () => {
  const state = consumer();
  let terminated = 0,
    cancelled = 0;
  state.worker.current = {
    terminate() {
      terminated++;
    },
    postMessage() {
      cancelled++;
    },
  };
  state.activeId.current = "owned";
  state.lifecycle.cancel();
  assert.equal(state.busy, true);
  assert.equal(state.timers.size, 1);
  state.lifecycle.stop();
  assert.equal(state.busy, false);
  assert.equal(state.paused, false);
  assert.equal(state.timer.current, null);
  assert.equal(state.timers.size, 0);
  assert.equal(state.rejected, 1);
  assert.deepEqual(state.retired, ["owned"]);
  assert.equal(terminated, 1);
  assert.equal(cancelled, 1);
  state.begin();
  assert.equal(state.busy, true, "same consumer can start again");
});
test("late worker completion cannot reset a newer operation after cancel and clear", () => {
  const state = consumer(),
    old = state.generation.current;
  state.lifecycle.stop();
  state.begin();
  let terminated = 0;
  const replacement = {
    terminate() {
      terminated++;
    },
    postMessage() {},
  };
  state.worker.current = replacement;
  assert.equal(state.lifecycle.finish(old), false);
  assert.equal(state.worker.current, replacement);
  assert.equal(state.busy, true);
  assert.equal(terminated, 0);
  assert.equal(state.lifecycle.finish(state.generation.current), true);
  assert.equal(state.busy, false);
  assert.equal(terminated, 1);
});
