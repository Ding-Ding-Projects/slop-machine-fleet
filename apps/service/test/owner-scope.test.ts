import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { newDb } from "pg-mem";
import { Store, migrate } from "../src/db.js";
import {
  initializeOwnerIdentity,
  currentOwnerScope,
  ownerScopeKey,
} from "../src/owner-scope.js";
test("owner migration preserves credentials and legacy sessions while scope survives initialization and credential changes", async () => {
  const pg = newDb().adapters.createPg(),
    db = new pg.Pool(),
    store = new Store(db);
  try {
    await migrate(db);
    const credential = {
      salt: "test-only-existing-salt",
      digest: "test-only-existing-digest",
    };
    await store.put("state", "owner", credential);
    await store.put("sessions", "legacy-session", {
      csrfToken: "test-only-existing-csrf",
      expiresAt: Date.now() + 60000,
    });
    await initializeOwnerIdentity(store);
    const firstOwner = await store.get("state", "owner"),
      firstController = await store.get("state", "controller-identity"),
      scope = await currentOwnerScope(store, "https://fleet.test");
    assert.equal(firstOwner.salt, credential.salt);
    assert.equal(firstOwner.digest, credential.digest);
    assert.equal(
      (await store.get("sessions", "legacy-session")).ownerId,
      firstOwner.id,
    );
    assert.match(scope, /^[a-f0-9]{64}$/);
    await initializeOwnerIdentity(store);
    assert.equal(await currentOwnerScope(store, "https://fleet.test"), scope);
    assert.equal(
      (await store.get("state", "controller-identity")).id,
      firstController.id,
    );
    assert.equal((await store.get("state", "owner")).id, firstOwner.id);
    await store.put("state", "owner", {
      ...firstOwner,
      salt: "different-test-salt",
      digest: "different-test-digest",
    });
    assert.equal(await currentOwnerScope(store, "https://fleet.test"), scope);
    await store.put("state", "owner", credential);
    await initializeOwnerIdentity(store);
    const replacement = await store.get("state", "owner");
    assert.notEqual(replacement.id, firstOwner.id);
    assert.notEqual(
      await currentOwnerScope(store, "https://fleet.test"),
      scope,
    );
    assert.equal(
      (await store.get("sessions", "legacy-session")).ownerId,
      firstOwner.id,
    );
  } finally {
    await db.end();
  }
});
test("scope is domain-separated by controller, owner and canonical origin, never credentials", () => {
  const controller = randomUUID(),
    owner = randomUUID(),
    scope = ownerScopeKey(controller, owner, "https://FLEET.test:443/");
  assert.equal(scope, ownerScopeKey(controller, owner, "https://fleet.test"));
  assert.notEqual(
    scope,
    ownerScopeKey(randomUUID(), owner, "https://fleet.test"),
  );
  assert.notEqual(
    scope,
    ownerScopeKey(controller, randomUUID(), "https://fleet.test"),
  );
  assert.notEqual(
    scope,
    ownerScopeKey(controller, owner, "https://fleet.test:8443"),
  );
  assert.equal(scope.includes(controller), false);
  assert.equal(scope.includes(owner), false);
  assert.throws(() =>
    ownerScopeKey("credential-shaped-input", owner, "https://fleet.test"),
  );
  assert.throws(() =>
    ownerScopeKey(controller, owner, "https://user:password@fleet.test"),
  );
});

test("authenticated scope survives a real service instance restart on the same database", async () => {
  const pg = newDb({ noAstCoverageCheck: true }).adapters.createPg(),
    db = new pg.Pool(),
    store = new Store(db);
  await migrate(db);
  const { createHash } = await import("node:crypto");
  const { createService } = await import("../src/app.js");
  await store.put("state", "owner", {
    salt: "test-only-salt",
    digest: "test-only-digest",
  });
  const raw = "test-only-existing-session-cookie",
    key = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  await store.put("sessions", key, {
    csrfToken: "test-only-csrf",
    expiresAt: Date.now() + 60000,
  });
  const options: any = {
    db,
    origin: "https://fleet.test",
    cloud: {},
    transport: {},
  };
  let app = await createService(options);
  try {
    const first = await app.inject({
      url: "/api/auth/session",
      headers: { cookie: `fleet_session=${raw}` },
    });
    assert.equal(first.statusCode, 200);
    const scope = first.json().scopeKey;
    await app.close();
    app = await createService(options);
    const second = await app.inject({
      url: "/api/auth/session",
      headers: { cookie: `fleet_session=${raw}` },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().scopeKey, scope);
    assert.equal(second.json().csrfToken, first.json().csrfToken);
  } finally {
    await app.close();
    await db.end();
  }
});
