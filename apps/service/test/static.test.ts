import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { newDb } from "pg-mem";
import { createService } from "../src/app.js";
import { migrate, Store } from "../src/db.js";
import { registerWebAssets } from "../src/web-assets.js";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fleet-static-test-")),
    web = join(root, "web");
  await mkdir(join(web, "assets"), { recursive: true });
  await mkdir(join(web, "directory"), { recursive: true });
  await writeFile(
    join(web, "index.html"),
    "<html><body>public-shell</body></html>",
  );
  await writeFile(join(web, "assets", "safe.js"), 'console.log("safe-asset")');
  await writeFile(
    join(web, "directory", "nested.txt"),
    "private-directory-listing-marker",
  );
  await writeFile(join(web, ".hidden"), "hidden-marker");
  await writeFile(join(root, "outside.txt"), "sibling-sensitive-marker");
  const pg = newDb({ noAstCoverageCheck: true }).adapters.createPg(),
    db = new pg.Pool(),
    store = new Store(db);
  await migrate(db);
  const ownerId = randomUUID(),
    raw = "test-only-static-session";
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
  const app = await createService({
    db,
    origin: "https://fleet.test",
    cloud: {} as any,
    transport: {} as any,
  });
  await registerWebAssets(app, web);
  await app.ready();
  return {
    app,
    headers: { cookie: `fleet_session=${raw}` },
    close: async () => {
      await app.close();
      await db.end();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test("patched Fastify 5 static serving returns safe assets without listing directories or exposing sibling files", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.app.inject({ url: "/assets/safe.js" })).body,
      'console.log("safe-asset")',
    );
    assert.equal(
      (await f.app.inject({ url: "/" })).body,
      "<html><body>public-shell</body></html>",
    );
    for (const url of [
      "/directory/",
      "/.hidden",
      "/../outside.txt",
      "/%2e%2e/outside.txt",
      "/assets/../../outside.txt",
      "//outside.txt",
      "/assets/%2e%2e/%2e%2e/outside.txt",
      "/assets/%2e%2e%5coutside.txt",
    ]) {
      const result = await f.app.inject({ url });
      assert.equal(
        result.body.includes("sibling-sensitive-marker"),
        false,
        url,
      );
      assert.equal(
        result.body.includes("private-directory-listing-marker"),
        false,
        url,
      );
      assert.equal(result.body.includes("hidden-marker"), false, url);
    }
  } finally {
    await f.close();
  }
});
test("matched encoded API routes require authentication and cannot fall through to the public shell", async () => {
  const f = await fixture();
  try {
    for (const url of [
      "/api/settings",
      "/a%70i/settings",
      "/%61pi/settings",
      "/api/%73ettings",
      "/api%2fsettings",
      "//api/settings",
      "/public/../api/settings",
    ]) {
      const response = await f.app.inject({ url });
      assert.ok(
        [400, 401, 403, 404].includes(response.statusCode),
        `${url} returned ${response.statusCode}`,
      );
      assert.equal(response.body.includes("public-shell"), false, url);
      assert.equal(response.body.includes("maxWorkers"), false, url);
    }
    const authenticated = await f.app.inject({
      url: "/a%70i/settings",
      headers: f.headers,
    });
    assert.equal(authenticated.statusCode, 200);
    assert.equal(authenticated.json().maxWorkers, 5);
    for (const url of ["/api/not-a-route", "/api", "/api%2fnot-a-route"]) {
      const response = await f.app.inject({ url, headers: f.headers });
      assert.equal(response.statusCode, 404, url);
      assert.equal(response.body.includes("public-shell"), false, url);
    }
    assert.equal(
      (await f.app.inject({ url: "/a%70i/health" })).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
});
