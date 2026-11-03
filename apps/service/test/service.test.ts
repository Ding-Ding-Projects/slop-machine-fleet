import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { newDb } from "pg-mem";
import { createService } from "../src/app.js";
import { Store } from "../src/db.js";
async function fixture(pricing = true) {
  const memory = newDb(),
    pg = memory.adapters.createPg(),
    db = new pg.Pool();
  const directory = await mkdtemp(join(tmpdir(), "fleet-test-"));
  const file = join(directory, "setup");
  await writeFile(file, "test-only-setup-authorization");
  let launches = 0,
    dispatches = 0;
  const app = await createService({
    db,
    origin: "https://fleet.test",
    setupCodeFile: file,
    provisioner: { reconcile: async (w) => w, reset: async () => {} },
    cloud: {
      dataVolume: async () => "vol-ab12",
      identity: async () => "123456789012",
      discovery: async () => ({}),
      estimate: async () => ({
        available: pricing,
        currency: "USD",
        hourly: 1,
        monthly: 730,
        source: "test double",
        retrievedAt: new Date().toISOString(),
        exclusions: [],
      }),
      launch: async (_s, _k, ids) => {
        launches++;
        return ids.map(() => `i-test`);
      },
      action: async () => {},
    },
    transport: {
      ready: async () => true,
      request: async (_w, method, path) => {
        if (method === "POST" && path === "/tasks") dispatches++;
        return { state: "running" };
      },
    },
  });
  await app.ready();
  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    headers: { origin: "https://fleet.test" },
    payload: {
      setupCode: "test-only-setup-authorization",
      password: "test-only-password-long",
    },
  });
  assert.equal(setup.statusCode, 200);
  const cookie = setup.cookies[0].name + "=" + setup.cookies[0].value,
    csrf = setup.json().csrfToken;
  return {
    app,
    store: new Store(db),
    headers: { cookie, origin: "https://fleet.test", "x-csrf-token": csrf },
    launches: () => launches,
    dispatches: () => dispatches,
    close: async () => {
      await app.close();
      await db.end();
      await rm(directory, { recursive: true });
    },
  };
}
const spec = {
  count: 1,
  region: "us-east-1",
  instanceType: "m7i.large",
  subnetId: "subnet-ab12",
  securityGroupId: "sg-ab12",
  instanceProfile: "FleetWorker",
  bootGiB: 80,
  dataGiB: 100,
};
test("authentication, CSRF and origin protect mutations and setup is one-time", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.app.inject({ url: "/api/workers" })).statusCode, 401);
    assert.equal(
      (
        await f.app.inject({
          method: "PUT",
          url: "/api/settings",
          headers: { cookie: f.headers.cookie, origin: f.headers.origin },
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: { ...f.headers, origin: "https://evil.test" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/auth/setup",
          headers: { origin: f.headers.origin },
          payload: {},
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await f.app.inject({ url: "/api/auth/session", headers: f.headers }))
        .headers["cache-control"],
      "no-store",
    );
  } finally {
    await f.close();
  }
});
test("launch binds exact expiring review, requires prices, preserves idempotency and cap", async () => {
  const f = await fixture();
  try {
    const r = await f.app.inject({
      method: "POST",
      url: "/api/cloud/reviews",
      headers: f.headers,
      payload: spec,
    });
    assert.equal(r.statusCode, 200);
    const payload = {
      reviewId: r.json().id,
      spec,
      idempotencyKey: randomUUID(),
    };
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/workers",
          headers: f.headers,
          payload: { ...payload, spec: { ...spec, count: 2 } },
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/workers",
          headers: f.headers,
          payload,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/workers",
          headers: f.headers,
          payload,
        })
      ).statusCode,
      200,
    );
    assert.equal(f.launches(), 1);
    assert.equal((await f.store.all("workers"))[0].transport, "unenrolled");
    const review = await f.store.get("reviews", r.json().id);
    review.expiresAt = "2000-01-01T00:00:00.000Z";
    await f.store.put("reviews", review.id, review);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/workers",
          headers: f.headers,
          payload: { ...payload, idempotencyKey: randomUUID() },
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.close();
  }
  const unavailable = await fixture(false);
  try {
    const r = await unavailable.app.inject({
      method: "POST",
      url: "/api/cloud/reviews",
      headers: unavailable.headers,
      payload: spec,
    });
    assert.equal(
      (
        await unavailable.app.inject({
          method: "POST",
          url: "/api/workers",
          headers: unavailable.headers,
          payload: {
            reviewId: r.json().id,
            spec,
            idempotencyKey: randomUUID(),
          },
        })
      ).statusCode,
      409,
    );
    assert.equal(unavailable.launches(), 0);
  } finally {
    await unavailable.close();
  }
});
test("FIFO dispatch keeps one active task and rejects credential-bearing repository URLs", async () => {
  const f = await fixture();
  try {
    const id = randomUUID();
    await f.store.put("workers", id, {
      id,
      name: "test",
      state: "ready",
      transport: "ready",
      region: "us-east-1",
      createdAt: new Date().toISOString(),
    });
    const payload = {
      workerId: id,
      repository: "https://github.com/example/project.git",
      prompt: "Build the project",
    };
    const a = await f.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: f.headers,
      payload,
    });
    const b = await f.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: f.headers,
      payload,
    });
    assert.equal(a.json().state, "running");
    assert.equal(b.json().state, "queued");
    assert.equal(f.dispatches(), 1);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/tasks",
          headers: f.headers,
          payload: {
            ...payload,
            repository: "https://user:password@github.com/example/project.git",
          },
        })
      ).statusCode,
      400,
    );
    await f.app.inject({
      method: "POST",
      url: `/api/tasks/${a.json().id}/cancel`,
      headers: f.headers,
    });
    assert.equal(f.dispatches(), 1);
  } finally {
    await f.close();
  }
});
test("an established event stream closes after logout or session expiry", async () => {
  for (const expire of [false, true]) {
    const f = await fixture();
    try {
      const address = await f.app.listen({ host: "127.0.0.1", port: 0 });
      const response = await fetch(address + "/api/events", {
        headers: { cookie: f.headers.cookie },
      });
      assert.equal(response.status, 200);
      const reader = response.body!.getReader();
      assert.equal((await reader.read()).done, false);
      if (expire) {
        const raw = f.headers.cookie.slice(f.headers.cookie.indexOf("=") + 1);
        const { createHash } = await import("node:crypto");
        const key = createHash("sha256")
          .update(JSON.stringify(raw))
          .digest("hex");
        const session = await f.store.get("sessions", key);
        session.expiresAt = Date.now() - 1;
        await f.store.put("sessions", key, session);
      } else {
        await f.app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: f.headers,
        });
      }
      const closed = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Stream did not close after revocation")),
            4000,
          ),
        ),
      ]);
      assert.equal(closed.done, true);
    } finally {
      await f.close();
    }
  }
});
