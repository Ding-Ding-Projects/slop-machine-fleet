import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
test("generated inventory retains every docs article byte-for-byte with provenance", async () => {
  const content = JSON.parse(
    await fs.readFile(
      path.join(project, "apps/docs/src/content.generated.json"),
      "utf8",
    ),
  );
  const articles = new Map(content.articles.map((a) => [a.source, a]));
  assert.equal(articles.size, content.articles.length);
  async function visit(dir) {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.name.toLowerCase().endsWith(".md")) {
        const source = path.relative(project, file).replaceAll("\\", "/");
        const bytes = await fs.readFile(file);
        assert.ok(articles.has(source), source);
        assert.equal(articles.get(source).body, bytes.toString("utf8"));
        assert.equal(
          articles.get(source).sha256,
          crypto.createHash("sha256").update(bytes).digest("hex"),
        );
      }
    }
  }
  await visit(path.join(project, "docs"));
  assert.ok(articles.has("README.md"));
  if (await fs.stat(path.join(project, "deploy/README.md")).catch(() => null))
    assert.ok(articles.has("deploy/README.md"));
});
