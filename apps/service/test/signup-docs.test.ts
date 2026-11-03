import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
test("owner Postman examples are bounded username/password templates with no setup-code handoff", async () => {
  const collection = JSON.parse(
    await readFile(
      resolve(root, "docs/api/fleet.postman_collection.json"),
      "utf8",
    ),
  );
  const access = collection.item.find(
    (group: any) => group.name === "Access",
  ).item;
  const signup = access.find((item: any) =>
    item.request.url.raw.endsWith("/api/auth/signup"),
  );
  assert.deepEqual(JSON.parse(signup.request.body.raw), {
    username: "{{ownerUsername}}",
    password: "{{ownerPassword}}",
  });
  const adopt = access.find((item: any) =>
    item.request.url.raw.endsWith("/api/auth/username"),
  );
  assert.equal(adopt.request.method, "PUT");
  assert.ok(
    adopt.request.header.some((item: any) => item.key === "x-csrf-token"),
  );
  for (const variable of collection.variable.filter((item: any) =>
    ["ownerUsername", "ownerPassword"].includes(item.key),
  ))
    assert.equal(variable.value, "");
  assert.equal(
    access.some((item: any) =>
      item.request.url.raw.endsWith("/api/auth/setup"),
    ),
    false,
  );
});
test("prepared signup wiki retains the owning article and code-free API contract", async () => {
  assert.equal(
    await readFile(resolve(root, "docs/wiki/pending/Owner-signup.md"), "utf8"),
    await readFile(
      resolve(root, "docs/features/fleet/owner-signup.md"),
      "utf8",
    ),
  );
  for (const path of ["docs/API.md", "docs/wiki/pending/API.md"]) {
    const text = await readFile(resolve(root, path), "utf8");
    assert.ok(text.includes("/api/auth/signup"));
    assert.ok(text.includes("/api/auth/username"));
    assert.equal(
      text.includes(
        "create first owner, once, using host-provided setup authorization",
      ),
      false,
    );
  }
});
