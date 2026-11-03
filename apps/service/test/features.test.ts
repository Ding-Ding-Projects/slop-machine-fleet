import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  truncate,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { newDb } from "pg-mem";
import { createService } from "../src/app.js";
import { Store, migrate } from "../src/db.js";
const source = JSON.parse(
  await readFile(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "fixtures/required-features.json",
    ),
    "utf8",
  ),
);
async function fixture(configured = true) {
  const directory = await mkdtemp(join(tmpdir(), "fleet-features-test-")),
    docs = join(directory, "docs"),
    articles = join(docs, "features/requirements"),
    manifest = join(docs, "required-features.json");
  await mkdir(articles, { recursive: true });
  await writeFile(manifest, JSON.stringify(source));
  for (const feature of source.features)
    await writeFile(
      join(articles, feature.id + ".md"),
      `# ${feature.title}\n\nFixture article for ${feature.id}.\n`,
    );
  const pg = newDb({ noAstCoverageCheck: true }).adapters.createPg(),
    db = new pg.Pool(),
    store = new Store(db);
  await migrate(db);
  const ownerId = randomUUID(),
    raw = "test-only-feature-session",
    sessionId = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  await store.put("state", "owner", {
    id: ownerId,
    salt: "test-only-salt",
    digest: "test-only-digest",
  });
  await store.put("sessions", sessionId, {
    ownerId,
    csrfToken: "test-only-csrf",
    expiresAt: Date.now() + 60000,
  });
  const app = await createService({
    db,
    origin: "https://fleet.test",
    featureManifestFile: configured ? manifest : undefined,
    cloud: { discovery: async () => ({}) } as any,
    transport: {} as any,
  });
  await app.ready();
  return {
    directory,
    articles,
    manifest,
    app,
    headers: { cookie: `fleet_session=${raw}` },
    close: async () => {
      await app.close();
      await db.end();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
test("the documented feature API serves the complete 115-entry manifest and every complete article", async () => {
  const f = await fixture();
  try {
    const response = await f.app.inject({
      url: "/api/features",
      headers: f.headers,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.json().sourceCount, 115);
    assert.equal(response.json().features.length, 115);
    assert.deepEqual(response.json(), source);
    for (const feature of source.features) {
      const article = await f.app.inject({
        url: `/api/features/${feature.id}`,
        headers: f.headers,
      });
      assert.equal(article.statusCode, 200, feature.id);
      assert.equal(article.headers["cache-control"], "no-store");
      assert.equal(article.json().feature.id, feature.id);
      assert.equal(
        article.json().article,
        `# ${feature.title}\n\nFixture article for ${feature.id}.\n`,
      );
    }
    const missing = await f.app.inject({
      url: "/api/features/unknown-feature",
      headers: f.headers,
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "FEATURE_NOT_FOUND");
  } finally {
    await f.close();
  }
});
test("feature inventory and articles require authentication while a genuine unknown route remains 404", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.app.inject({ url: "/api/features" })).statusCode,
      401,
    );
    assert.equal(
      (await f.app.inject({ url: `/api/features/${source.features[0].id}` }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          url: "/api/genuinely-unknown",
          headers: f.headers,
        })
      ).statusCode,
      404,
    );
    await rm(f.manifest);
    const unavailable = await f.app.inject({
      url: "/api/features",
      headers: f.headers,
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      unavailable.json().error.code,
      "FEATURE_INVENTORY_UNAVAILABLE",
    );
    assert.equal(
      (
        await f.app.inject({
          url: `/api/features/${source.features[0].id}`,
          headers: f.headers,
        })
      ).statusCode,
      503,
    );
  } finally {
    await f.close();
  }
});
test("feature inventory refuses omissions, malformed schema and path traversal instead of serving partial success", async () => {
  const f = await fixture();
  try {
    for (const invalid of [
      { ...source, sourceCount: 114, features: source.features.slice(1) },
      {
        ...source,
        features: source.features.map((entry: any, index: number) =>
          index ? entry : { ...entry, documentation: "../outside.md" },
        ),
      },
      { ...source, unexpected: true },
      {
        ...source,
        features: source.features.map((entry: any, index: number) =>
          index
            ? entry
            : {
                ...entry,
                id: "unknown-replacement",
                documentation:
                  "docs/features/requirements/unknown-replacement.md",
              },
        ),
      },
    ]) {
      await writeFile(f.manifest, JSON.stringify(invalid));
      const result = await f.app.inject({
        url: "/api/features",
        headers: f.headers,
      });
      assert.equal(result.statusCode, 503);
      assert.equal(result.json().error.code, "FEATURE_INVENTORY_UNAVAILABLE");
    }
    await writeFile(f.manifest, "x".repeat(1048577));
    assert.equal(
      (await f.app.inject({ url: "/api/features", headers: f.headers }))
        .statusCode,
      503,
    );
  } finally {
    await f.close();
  }
});
test("article reads are bounded and reject a symlink that escapes the physical article directory", async () => {
  const f = await fixture();
  try {
    const feature = source.features[0],
      file = join(f.articles, feature.id + ".md");
    await truncate(file, 1048577);
    let result = await f.app.inject({
      url: `/api/features/${feature.id}`,
      headers: f.headers,
    });
    assert.equal(result.statusCode, 503);
    assert.equal(result.json().error.code, "FEATURE_ARTICLE_UNAVAILABLE");
    await rm(file);
    const outside = join(f.directory, "outside");
    await mkdir(outside);
    await writeFile(
      join(outside, feature.id + ".md"),
      "This must never be returned.",
    );
    const category = f.articles,
      backup = category + "-original";
    const { rename } = await import("node:fs/promises");
    await rename(category, backup);
    await symlink(
      outside,
      category,
      process.platform === "win32" ? "junction" : "dir",
    );
    result = await f.app.inject({
      url: `/api/features/${feature.id}`,
      headers: f.headers,
    });
    assert.equal(result.statusCode, 503);
    assert.equal(
      JSON.stringify(result.json()).includes("This must never be returned"),
      false,
    );
  } finally {
    await f.close();
  }
});
// This list is handwritten from the documented core API, including both feature consumers.
const documentedRoutes: Array<[string, string]> = [
  ["GET", "/api/health"],
  ["GET", "/api/auth/status"],
  ["POST", "/api/auth/setup"],
  ["POST", "/api/auth/login"],
  ["POST", "/api/auth/logout"],
  ["GET", "/api/auth/session"],
  ["GET", "/api/features"],
  ["GET", "/api/features/:id"],
  ["GET", "/api/settings"],
  ["PUT", "/api/settings"],
  ["GET", "/api/cloud/discovery"],
  ["POST", "/api/cloud/reviews"],
  ["GET", "/api/workers"],
  ["POST", "/api/workers"],
  ["GET", "/api/workers/:id"],
  ["PATCH", "/api/workers/:id"],
  ["POST", "/api/workers/:id/actions"],
  ["POST", "/api/bulk"],
  ["GET", "/api/operations"],
  ["GET", "/api/operations/:id"],
  ["POST", "/api/operations/:id/resume"],
  ["POST", "/api/workers/:id/auth/:provider/start"],
  ["GET", "/api/workers/:id/auth/:provider"],
  ["POST", "/api/workers/:id/auth/:provider/input"],
  ["DELETE", "/api/workers/:id/auth/:provider"],
  ["GET", "/api/tasks"],
  ["POST", "/api/tasks"],
  ["GET", "/api/tasks/:id"],
  ["GET", "/api/tasks/:id/output"],
  ["POST", "/api/tasks/:id/cancel"],
  ["POST", "/api/tasks/:id/input"],
  ["POST", "/api/tasks/:id/approvals/:requestId"],
  ["GET", "/api/events"],
];
test("every documented core route is actually registered on the service instance", async () => {
  const f = await fixture();
  try {
    for (const [method, url] of documentedRoutes)
      assert.equal(
        f.app.hasRoute({ method: method as any, url }),
        true,
        `${method} ${url}`,
      );
    assert.equal(
      f.app.hasRoute({ method: "GET", url: "/api/genuinely-unknown" }),
      false,
    );
  } finally {
    await f.close();
  }
});

test("feature routes remain real and explicitly unavailable when the manifest option is not configured", async () => {
  const f = await fixture(false);
  try {
    assert.equal(f.app.hasRoute({ method: "GET", url: "/api/features" }), true);
    assert.equal(
      f.app.hasRoute({ method: "GET", url: "/api/features/:id" }),
      true,
    );
    const response = await f.app.inject({
      url: "/api/features",
      headers: f.headers,
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "FEATURE_INVENTORY_UNAVAILABLE");
  } finally {
    await f.close();
  }
});
