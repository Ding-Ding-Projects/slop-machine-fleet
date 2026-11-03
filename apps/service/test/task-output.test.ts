import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateTaskOutput, outputQuerySchema } from "../src/task-output.js";
test("output rejects cross-task content, oversized pages and inconsistent replay", () => {
  const id = randomUUID(),
    event = {
      sequence: 1,
      kind: "assistant",
      content: "Task result",
      at: new Date().toISOString(),
      truncated: false,
      redacted: false,
    },
    page = {
      taskId: id,
      events: [event],
      nextCursor: 1,
      oldestSequence: 1,
      latestSequence: 1,
      gap: false,
      truncated: false,
    };
  assert.equal(validateTaskOutput(page, id, 0, 100).events.length, 1);
  assert.throws(() =>
    validateTaskOutput({ ...page, taskId: randomUUID() }, id, 0, 100),
  );
  assert.throws(() =>
    validateTaskOutput(
      { ...page, events: [{ ...event, content: "x".repeat(2049) }] },
      id,
      0,
      100,
    ),
  );
  assert.throws(() =>
    validateTaskOutput({ ...page, events: [event, event] }, id, 0, 100),
  );
  assert.throws(() =>
    validateTaskOutput({ ...page, nextCursor: 0 }, id, 0, 100),
  );
  assert.throws(() =>
    validateTaskOutput(
      { ...page, events: [{ ...event, userCode: "not-an-output-field" }] },
      id,
      0,
      100,
    ),
  );
  assert.equal(outputQuerySchema.safeParse({ limit: "0" }).success, false);
  assert.equal(
    outputQuerySchema.safeParse({ after: "9007199254740992" }).success,
    false,
  );
});
test("reset and retained-buffer gaps stay explicit instead of fabricating a complete transcript", () => {
  const id = randomUUID(),
    event = {
      sequence: 10,
      kind: "command-output",
      content: "Retained tail",
      at: new Date().toISOString(),
      stream: "combined",
      truncated: true,
      redacted: false,
    };
  const page = {
    taskId: id,
    events: [event],
    nextCursor: 10,
    oldestSequence: 10,
    latestSequence: 10,
    gap: true,
    truncated: true,
  };
  assert.equal(validateTaskOutput(page, id, 0, 200).gap, true);
  const reset = {
    taskId: id,
    events: [],
    nextCursor: 0,
    oldestSequence: 0,
    latestSequence: 0,
    gap: true,
    truncated: false,
    resetReason: "worker-restarted",
  };
  assert.equal(
    validateTaskOutput(reset, id, 50, 200).resetReason,
    "worker-restarted",
  );
  assert.throws(() =>
    validateTaskOutput({ ...reset, gap: false }, id, 50, 200),
  );
});
