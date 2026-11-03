import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { newDb } from "pg-mem";
import { createService, type ServiceOptions } from "../src/app.js";
import { Store, migrate, type Database } from "../src/db.js";
async function fixture(count = 1) {
  const pg = newDb({ noAstCoverageCheck: true }).adapters.createPg(),
    base = new pg.Pool();
  let fault: null | { when: (value: any) => boolean; after: boolean } = null;
  const db: Database = {
    query: async (text, values) => {
      const value =
        text.startsWith("INSERT INTO fleet_operations") &&
        typeof values?.[1] === "string"
          ? JSON.parse(values[1])
          : null;
      if (fault && value && fault.when(value)) {
        const selected = fault;
        fault = null;
        if (selected.after) await base.query(text, values);
        throw new Error("Test crash boundary");
      }
      return base.query(text, values);
    },
  };
  await migrate(db);
  const store = new Store(db),
    ownerId = randomUUID(),
    raw = "test-only-bulk-session";
  await store.put("state", "owner", {
    id: ownerId,
    salt: "test-only-salt",
    digest: "test-only-digest",
  });
  await store.put(
    "sessions",
    createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
    { ownerId, csrfToken: "test-only-csrf", expiresAt: Date.now() + 60000 },
  );
  const ids = Array.from({ length: count }, () => randomUUID()),
    provider = new Map<string, string>(),
    actions: Array<{ id: string; action: string }> = [];
  for (const id of ids) {
    provider.set(id, "running");
    await store.put("workers", id, {
      id,
      instanceId: "i-" + id,
      region: "us-east-1",
      name: "test",
      state: "ready",
      transport: "ready",
      createdAt: new Date().toISOString(),
    });
  }
  let loseReply = false;
  const options: ServiceOptions = {
    db,
    origin: "https://fleet.test",
    cloud: {
      action: async (w: any, action: string) => {
        actions.push({ id: w.id, action });
        provider.set(
          w.id,
          action === "stop"
            ? "stopped"
            : action === "terminate"
              ? "terminated"
              : "running",
        );
        if (loseReply) throw new Error("Test lost acknowledgement");
      },
      observe: async (w: any) => provider.get(w.id),
    } as any,
    transport: {
      ready: async () => true,
      request: async (w: any, method: string, path: string) => {
        if (path === "/health")
          return {
            workerId: w.id,
            ready: true,
            state: "ready",
            version: "0.1.2",
          };
        return {};
      },
    },
  };
  let app = await createService(options);
  await app.ready();
  const headers = {
    cookie: `fleet_session=${raw}`,
    origin: "https://fleet.test",
    "x-csrf-token": "test-only-csrf",
  };
  return {
    get app() {
      return app;
    },
    store,
    ids,
    actions,
    provider,
    ownerId,
    headers,
    fault: (when: (value: any) => boolean, after = false) => {
      fault = { when, after };
    },
    loseReply: () => {
      loseReply = true;
    },
    restart: async () => {
      await app.close();
      app = await createService(options);
      await app.ready();
    },
    close: async () => {
      await app.close();
      await base.end();
    },
  };
}
async function submit(f: any, action = "stop") {
  const body = { workerIds: f.ids, action, idempotencyKey: randomUUID() };
  return {
    body,
    response: await f.app.inject({
      method: "POST",
      url: "/api/bulk",
      headers: f.headers,
      payload: body,
    }),
  };
}
const resume = (
  f: any,
  op: any,
  workerIds = op.targets.map((target: any) => target.id),
) =>
  f.app.inject({
    method: "POST",
    url: `/api/operations/${op.id}/resume`,
    headers: f.headers,
    payload: { workerIds, requestHash: op.requestHash },
  });
test("crash before durable dispatch leaves a resumable untouched target without replaying on restart", async () => {
  const f = await fixture();
  try {
    f.fault((op) => op.targets[0].state === "dispatching");
    const { body, response } = await submit(f);
    assert.equal(response.statusCode, 500);
    assert.equal(f.actions.length, 0);
    let op = await f.store.get("operations", body.idempotencyKey);
    assert.equal(op.targets[0].state, "pending");
    assert.equal(op.targets[0].attempt, null);
    await f.restart();
    assert.equal(f.actions.length, 0);
    op = await f.store.get("operations", body.idempotencyKey);
    assert.equal(op.state, "incomplete");
    const repeated = await f.app.inject({
      method: "POST",
      url: "/api/bulk",
      headers: f.headers,
      payload: body,
    });
    assert.equal(repeated.statusCode, 200);
    assert.equal(f.actions.length, 0);
    const continued = await resume(f, op);
    assert.equal(continued.statusCode, 200);
    assert.equal(f.actions.length, 1);
    assert.equal(continued.json().targets[0].state, "requested");
    assert.ok(continued.json().targets[0].attempt.id);
    assert.equal(continued.json().state, "incomplete");
    await f.restart();
    assert.equal(f.actions.length, 1);
    assert.equal((await f.store.get("operations", op.id)).state, "completed");
  } finally {
    await f.close();
  }
});
test("crash after the marker but before the external call stays ambiguous rather than claiming untouched", async () => {
  const f = await fixture();
  try {
    f.fault((op) => op.targets[0].state === "dispatching", true);
    const { body, response } = await submit(f, "restart");
    assert.equal(response.statusCode, 500);
    assert.equal(f.actions.length, 0);
    await f.restart();
    const op = await f.store.get("operations", body.idempotencyKey);
    assert.equal(op.targets[0].state, "reconciliation-required");
    assert.equal(op.targets[0].attempt.phase, "uncertain");
    assert.equal((await resume(f, op)).statusCode, 409);
    assert.equal(f.actions.length, 0);
  } finally {
    await f.close();
  }
});
test("lost restart acknowledgement never replays and running readiness is not restart proof", async () => {
  const f = await fixture();
  try {
    f.loseReply();
    const { body, response } = await submit(f, "restart");
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().targets[0].state, "reconciliation-required");
    assert.equal(f.actions.length, 1);
    await f.restart();
    const op = await f.store.get("operations", body.idempotencyKey);
    assert.equal(op.state, "incomplete");
    assert.equal(op.targets[0].state, "reconciliation-required");
    assert.equal(op.targets[0].observation.state, "running");
    assert.equal((await resume(f, op)).statusCode, 409);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/bulk",
          headers: f.headers,
          payload: body,
        })
      ).statusCode,
      200,
    );
    assert.equal((await submit(f, "restart")).response.statusCode, 409);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/workers/${f.ids[0]}/actions`,
          headers: f.headers,
          payload: { action: "stop" },
        })
      ).statusCode,
      409,
    );
    assert.equal(f.actions.length, 1);
  } finally {
    await f.close();
  }
});
test("provider acceptance before a lost receipt reconciles only from actual terminal provider evidence", async () => {
  const f = await fixture();
  try {
    f.fault((op) => op.targets[0].state === "requested");
    const { body, response } = await submit(f);
    assert.equal(response.statusCode, 500);
    assert.equal(f.actions.length, 1);
    const before = await f.store.get("operations", body.idempotencyKey);
    assert.equal(before.targets[0].state, "dispatching");
    assert.equal(before.targets[0].attempt.acknowledgedAt, undefined);
    await f.restart();
    const after = await f.store.get("operations", body.idempotencyKey);
    assert.equal(after.state, "completed");
    assert.equal(after.targets[0].state, "completed");
    assert.equal(after.targets[0].dispatchState, "uncertain");
    assert.equal(after.targets[0].attempt.acknowledgedAt, undefined);
    assert.equal(after.targets[0].observation.source, "provider-observation");
    assert.equal(after.targets[0].observation.state, "stopped");
    assert.equal(f.actions.length, 1);
    assert.equal((await resume(f, after)).statusCode, 409);
  } finally {
    await f.close();
  }
});
test("crash between targets preserves the first receipt and explicitly resumes only the original untouched member", async () => {
  const f = await fixture(2);
  try {
    f.fault(
      (op) =>
        op.targets[0].state === "requested" &&
        op.targets[1].state === "dispatching",
    );
    const { body, response } = await submit(f);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(
      f.actions.map((item) => item.id),
      [f.ids[0]],
    );
    await f.restart();
    const op = await f.store.get("operations", body.idempotencyKey),
      first = JSON.parse(JSON.stringify(op.targets[0]));
    assert.equal(first.state, "completed");
    assert.equal(op.targets[1].state, "pending");
    assert.equal((await resume(f, op, [randomUUID()])).statusCode, 409);
    assert.equal((await resume(f, op, [f.ids[1], f.ids[1]])).statusCode, 409);
    assert.equal((await resume(f, op, [f.ids[0]])).statusCode, 409);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/operations/${op.id}/resume`,
          headers: f.headers,
          payload: { workerIds: [f.ids[1]], requestHash: "a".repeat(64) },
        })
      ).statusCode,
      409,
    );
    const continued = await resume(f, op, [f.ids[1]]);
    assert.equal(continued.statusCode, 200);
    assert.deepEqual(continued.json().targets[0], first);
    assert.deepEqual(
      continued.json().targets.map((target: any) => target.id),
      f.ids,
    );
    assert.equal(continued.json().requestHash, op.requestHash);
    assert.deepEqual(
      f.actions.map((item) => item.id),
      f.ids,
    );
    assert.equal(
      (await resume(f, continued.json(), [f.ids[1]])).statusCode,
      409,
    );
  } finally {
    await f.close();
  }
});
test("resume rechecks active tasks, owner identity and credentials before dispatch", async () => {
  const f = await fixture();
  try {
    const taskId = randomUUID();
    await f.store.put("tasks", taskId, {
      id: taskId,
      workerId: f.ids[0],
      state: "running",
      createdAt: new Date().toISOString(),
    });
    const { response } = await submit(f);
    const op = response.json();
    assert.equal(op.targets[0].state, "blocked");
    assert.equal(op.targets[0].attempt, null);
    assert.equal((await resume(f, op)).json().targets[0].state, "blocked");
    assert.equal(f.actions.length, 0);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/operations/${op.id}/resume`,
          headers: { origin: f.headers.origin },
          payload: { workerIds: f.ids, requestHash: op.requestHash },
        })
      ).statusCode,
      401,
    );
    await f.store.put("operations", op.id, { ...op, ownerId: randomUUID() });
    assert.equal((await resume(f, op)).statusCode, 409);
    await f.store.put("operations", op.id, op);
    await f.store.put("tasks", taskId, {
      id: taskId,
      workerId: f.ids[0],
      state: "completed",
      createdAt: new Date().toISOString(),
    });
    assert.equal((await resume(f, op)).statusCode, 200);
    assert.equal(f.actions.length, 1);
  } finally {
    await f.close();
  }
});
test("legacy pending targets are unknown, never upgraded to safe replay eligibility", async () => {
  const f = await fixture();
  try {
    const id = randomUUID();
    await f.store.put("operations", id, {
      id,
      action: "restart",
      requestHash: "a".repeat(64),
      state: "running",
      targets: [{ id: f.ids[0], state: "pending" }],
      createdAt: new Date().toISOString(),
    });
    await f.restart();
    const op = await f.store.get("operations", id);
    assert.equal(op.legacy, true);
    assert.equal(op.ownerId, null);
    assert.equal(op.targets[0].legacyState, "pending");
    assert.equal(op.targets[0].state, "reconciliation-required");
    assert.equal((await resume(f, op)).statusCode, 409);
    assert.equal(f.actions.length, 0);
  } finally {
    await f.close();
  }
});
