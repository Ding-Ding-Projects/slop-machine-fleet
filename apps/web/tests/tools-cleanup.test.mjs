import test from "node:test";
import assert from "node:assert/strict";
import {
  createCleanupQueue,
  streamingSafety,
} from "../../../packages/shared/local-base64/cleanup.mjs";
import { acquireAndStart } from "../../../packages/shared/local-base64/storage.mjs";
const claim = {
  id: "11111111-1111-1111-1111-111111111111",
  owner: "22222222-2222-2222-2222-222222222222",
  expectedBytes: 100,
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
function consumer(queue) {
  let displayed;
  const unsubscribe = queue.subscribe((state) => {
    displayed = streamingSafety({
      hasFiles: false,
      hasOutputs: false,
      running: false,
      busy: false,
      cleanupPending: state.pending,
      cleanupError: state.failed > 0,
    });
  });
  return {
    get state() {
      return displayed;
    },
    unsubscribe,
  };
}
test("actual cleanup consumer remains unknown and pending after UI clears until delayed removal succeeds", async () => {
  let complete,
    calls = 0;
  const queue = createCleanupQueue({
      remove: () => {
        calls++;
        return new Promise((resolve) => (complete = resolve));
      },
    }),
    view = consumer(queue);
  queue.retain(claim);
  const first = queue.retire(claim.id),
    duplicate = queue.retire(claim.id);
  assert.equal(first, duplicate);
  assert.deepEqual(view.state, {
    known: false,
    dirty: false,
    pendingWrites: true,
  });
  await turn();
  assert.equal(calls, 1);
  complete();
  assert.equal(await first, true);
  assert.deepEqual(view.state, {
    known: true,
    dirty: false,
    pendingWrites: false,
  });
  assert.equal(queue.snapshot().owned, 0);
  view.unsubscribe();
});
test("failed removal stays unknown with ownership retained; explicit retry recovers only after verified success", async () => {
  let fail = true,
    calls = 0;
  const queue = createCleanupQueue({
      attempts: 2,
      wait: async () => {},
      remove: async () => {
        calls++;
        if (fail) throw Error("locked");
      },
    }),
    view = consumer(queue);
  queue.retain(claim);
  assert.equal(await queue.retire(claim.id), false);
  assert.equal(calls, 2);
  assert.deepEqual(view.state, {
    known: false,
    dirty: false,
    pendingWrites: false,
  });
  assert.equal(queue.snapshot().owned, 1);
  fail = false;
  await queue.retryFailed();
  assert.equal(calls, 3);
  assert.deepEqual(view.state, {
    known: true,
    dirty: false,
    pendingWrites: false,
  });
  view.unsubscribe();
});
test("different exact-owned removals serialize and a remounted consumer still sees outstanding cleanup", async () => {
  const releases = [];
  let active = 0,
    maximum = 0;
  const queue = createCleanupQueue({
    remove: () => {
      active++;
      maximum = Math.max(maximum, active);
      return new Promise((resolve) =>
        releases.push(() => {
          active--;
          resolve();
        }),
      );
    },
  });
  queue.retain(claim);
  queue.retain({ ...claim, id: "33333333-3333-3333-3333-333333333333" });
  const first = queue.retire(claim.id),
    second = queue.retire("33333333-3333-3333-3333-333333333333");
  const old = consumer(queue);
  old.unsubscribe();
  const next = consumer(queue);
  assert.equal(next.state.known, false);
  await turn();
  assert.equal(releases.length, 1);
  releases[0]();
  await first;
  await turn();
  assert.equal(next.state.pendingWrites, true);
  releases[1]();
  await second;
  assert.equal(maximum, 1);
  assert.equal(next.state.known, true);
});
test("cancelled acquisition remains pending through eventual claim cleanup even after busy state resets", async () => {
  let acquired,
    removeDone,
    current = true;
  const queue = createCleanupQueue({
      remove: () => new Promise((resolve) => (removeDone = resolve)),
    }),
    view = consumer(queue);
  const barrier = new Promise((resolve) => (acquired = resolve));
  const operation = queue.trackAcquisition(() =>
    acquireAndStart({
      acquire: () => barrier,
      retain: (value) => queue.retain(value),
      isCurrent: () => current,
      start: () => assert.fail("cancelled worker must not start"),
      retire: (id) => queue.retire(id),
    }),
  );
  const rejection = assert.rejects(
    operation,
    (error) => error.code === "cancelled",
  );
  current = false;
  assert.equal(view.state.pendingWrites, true);
  acquired(claim);
  await turn();
  assert.equal(view.state.known, false);
  removeDone();
  await rejection;
  assert.equal(view.state.known, true);
});
