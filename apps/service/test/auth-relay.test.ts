import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { newDb } from "pg-mem";
import { createService } from "../src/app.js";
import { migrate, Store } from "../src/db.js";
import { WorkerRequestConflict } from "../src/transport.js";
async function fixture() {
  const pg = newDb({ noAstCoverageCheck: true }).adapters.createPg(),
    db = new pg.Pool(),
    store = new Store(db),
    workerId = randomUUID(),
    ownerId = randomUUID(),
    sessionId = randomUUID(),
    promptId = randomUUID(),
    raw = "test-only-auth-relay-session";
  await migrate(db);
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
  await store.put("workers", workerId, {
    id: workerId,
    instanceId: "i-test",
    name: "test",
    state: "ready",
    transport: "ready",
    region: "us-east-1",
    createdAt: new Date().toISOString(),
  });
  const prompt = {
    promptId,
    kind: "github-credential-helper",
    title: "Use the credential helper?",
    choices: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
    defaultChoice: "yes",
    allowedActions: ["choose", "enter"],
  };
  let state: any = {
    state: "input-required",
    gitSetupState: "not-requested",
    sessionId,
    prompt,
  };
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const app = await createService({
    db,
    origin: "https://fleet.test",
    cloud: {} as any,
    transport: {
      ready: async () => true,
      request: async (_w, method, path, body: any) => {
        calls.push({ method, path, body });
        if (method === "GET") return state;
        if (path.endsWith("/input")) {
          if (body.sessionId !== sessionId || body.promptId !== promptId)
            throw new WorkerRequestConflict();
          return {};
        }
        if (method === "DELETE") {
          if (
            new URL(path, "https://worker.test").searchParams.get(
              "sessionId",
            ) !== sessionId
          )
            throw new WorkerRequestConflict();
          return { ...state, state: "cancelled", prompt: null };
        }
        return state;
      },
    },
  });
  await app.ready();
  const prefix = `/api/workers/${workerId}/auth/github`,
    headers = {
      cookie: `fleet_session=${raw}`,
      origin: "https://fleet.test",
      "x-csrf-token": "test-only-csrf",
    };
  return {
    app,
    store,
    prefix,
    headers,
    sessionId,
    promptId,
    prompt,
    calls,
    setState: (value: any) => {
      state = value;
    },
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}
test("structured auth relays real identities and bounded choices without persisting transient prompt state", async () => {
  const f = await fixture();
  try {
    const status = await f.app.inject({ url: f.prefix, headers: f.headers });
    assert.equal(status.statusCode, 200);
    assert.equal(status.headers["cache-control"], "no-store");
    assert.equal(status.json().sessionId, f.sessionId);
    assert.deepEqual(status.json().prompt, f.prompt);
    const start = await f.app.inject({
      method: "POST",
      url: f.prefix + "/start",
      headers: f.headers,
    });
    assert.equal(start.json().sessionId, f.sessionId);
    for (const input of [
      {
        sessionId: f.sessionId,
        promptId: f.promptId,
        action: "choose",
        choice: "no",
      },
      { sessionId: f.sessionId, promptId: f.promptId, action: "enter" },
    ]) {
      const sent = await f.app.inject({
        method: "POST",
        url: f.prefix + "/input",
        headers: f.headers,
        payload: input,
      });
      assert.equal(sent.statusCode, 200);
      assert.deepEqual(sent.json(), { accepted: true });
      assert.deepEqual(f.calls.at(-1)?.body, input);
    }
    const cancelled = await f.app.inject({
      method: "DELETE",
      url: f.prefix + `?sessionId=${f.sessionId}`,
      headers: f.headers,
    });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().sessionId, f.sessionId);
    assert.equal(cancelled.json().state, "cancelled");
    assert.equal(cancelled.json().prompt, null);
    assert.equal(
      JSON.stringify(await f.store.all("workers")).includes(f.promptId),
      false,
    );
    assert.equal(
      JSON.stringify(
        (await f.store.db.query("SELECT value FROM fleet_events")).rows,
      ).includes(f.promptId),
      false,
    );
  } finally {
    await f.close();
  }
});
test("raw text, CR/LF injection and implicit empty input are rejected before reaching the worker", async () => {
  const f = await fixture();
  try {
    for (const payload of [
      { input: "yes\r\nextra" },
      {
        sessionId: f.sessionId,
        promptId: f.promptId,
        action: "choose",
        choice: "yes\r\n",
      },
      { sessionId: f.sessionId, promptId: f.promptId, action: "choose" },
      {
        sessionId: f.sessionId,
        promptId: f.promptId,
        action: "enter",
        choice: "yes",
      },
      {
        sessionId: f.sessionId,
        promptId: f.promptId,
        action: "enter",
        input: "",
      },
      {},
    ])
      assert.equal(
        (
          await f.app.inject({
            method: "POST",
            url: f.prefix + "/input",
            headers: f.headers,
            payload,
          })
        ).statusCode,
        400,
      );
    assert.equal(
      (
        await f.app.inject({
          method: "DELETE",
          url: f.prefix,
          headers: f.headers,
        })
      ).statusCode,
      400,
    );
    assert.equal(f.calls.length, 0);
    assert.equal((await f.app.inject({ url: f.prefix })).statusCode, 401);
  } finally {
    await f.close();
  }
});
test("stale structured identities reach the worker unchanged and its conflict stays HTTP409", async () => {
  const f = await fixture();
  try {
    const stale = {
      sessionId: randomUUID(),
      promptId: randomUUID(),
      action: "enter",
    };
    const result = await f.app.inject({
      method: "POST",
      url: f.prefix + "/input",
      headers: f.headers,
      payload: stale,
    });
    assert.equal(result.statusCode, 409);
    assert.equal(result.json().error.code, "WORKER_REQUEST_CONFLICT");
    assert.deepEqual(f.calls.at(-1)?.body, stale);
    const cancel = await f.app.inject({
      method: "DELETE",
      url: f.prefix + `?sessionId=${stale.sessionId}`,
      headers: f.headers,
    });
    assert.equal(cancel.statusCode, 409);
    assert.ok(f.calls.at(-1)?.path.endsWith(`?sessionId=${stale.sessionId}`));
  } finally {
    await f.close();
  }
});
test("legacy worker auth is explicitly update-required without synthesized identities or raw-input fallback", async () => {
  const f = await fixture();
  try {
    f.setState({
      state: "code-issued",
      userCode: "test-code-must-not-return",
      verificationUrl: "https://github.com/login/device",
    });
    for (const request of [
      { method: "GET", url: f.prefix },
      { method: "POST", url: f.prefix + "/start" },
      {
        method: "POST",
        url: f.prefix + "/input",
        payload: {
          sessionId: f.sessionId,
          promptId: f.promptId,
          action: "enter",
        },
      },
      { method: "DELETE", url: f.prefix + `?sessionId=${f.sessionId}` },
    ]) {
      const result = await f.app.inject({
        ...request,
        headers: f.headers,
      } as any);
      assert.equal(result.statusCode, 409);
      assert.equal(
        result.json().error.code,
        "WORKER_AUTH_PROTOCOL_UPDATE_REQUIRED",
      );
      assert.equal(result.body.includes("test-code-must-not-return"), false);
    }
    assert.equal(
      f.calls.some((call) => call.method !== "GET"),
      false,
    );
    f.setState({
      state: "unknown",
      gitSetupState: "unknown",
      sessionId: null,
      prompt: null,
    });
    assert.equal(
      (await f.app.inject({ url: f.prefix, headers: f.headers })).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
});
test("auth projection excludes arbitrary transcript fields and terminal code or prompt retention", async () => {
  const f = await fixture();
  try {
    f.setState({
      state: "verified",
      gitSetupState: "declined",
      sessionId: f.sessionId,
      prompt: f.prompt,
      userCode: "terminal-code-must-not-return",
      verificationUrl: "https://github.com/login/device",
      rawTranscript: "raw-must-not-return",
    });
    const result = await f.app.inject({ url: f.prefix, headers: f.headers });
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().prompt, null);
    assert.equal(result.json().state, "verified");
    assert.equal(result.json().gitSetupState, "declined");
    assert.equal(result.json().userCode, undefined);
    assert.equal(result.json().verificationUrl, undefined);
    assert.equal(result.json().rawTranscript, undefined);
    assert.equal(result.body.includes("must-not-return"), false);
  } finally {
    await f.close();
  }
});

test("transport preserves conflict status without exposing worker error bodies", async () => {
  const { workerResponseValue } = await import("../src/transport.js");
  assert.throws(
    () => workerResponseValue(409, "sensitive-test-body-must-not-appear"),
    (error: any) =>
      error.statusCode === 409 &&
      error.code === "WORKER_REQUEST_CONFLICT" &&
      !error.message.includes("sensitive-test-body"),
  );
  assert.throws(
    () => workerResponseValue(500, "sensitive-test-body-must-not-appear"),
    (error: any) => error.message === "Worker request failed",
  );
  assert.throws(
    () => workerResponseValue(200, "sensitive-test-body-must-not-appear"),
    (error: any) => error.message === "Invalid worker response",
  );
  assert.deepEqual(workerResponseValue(202, ""), {});
});
