import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { structuredAuthInput } from "../src/auth-relay.js";
const root = resolve(import.meta.dirname, "../../..");
function requests(items: any[]): any[] {
  return items.flatMap((item) => (item.item ? requests(item.item) : [item]));
}
test("tracked Postman worker auth examples use actual identity variables and explicit actions only", async () => {
  const collection = JSON.parse(
    await readFile(
      resolve(root, "docs/api/fleet.postman_collection.json"),
      "utf8",
    ),
  );
  const auth = requests(collection.item).filter((item) =>
    item.request?.url?.raw?.includes("/workers/{{workerId}}/auth/"),
  );
  assert.equal(auth.length, 5);
  const inputs = auth.filter((item) => item.request.url.raw.endsWith("/input"));
  assert.equal(inputs.length, 2);
  for (const item of inputs) {
    const body = JSON.parse(item.request.body.raw);
    assert.equal(body.sessionId, "{{workerAuthSessionId}}");
    assert.equal(body.promptId, "{{workerAuthPromptId}}");
    assert.equal(Object.hasOwn(body, "input"), false);
    const sample = {
      ...body,
      sessionId: "11111111-1111-4111-8111-111111111111",
      promptId: "22222222-2222-4222-8222-222222222222",
    };
    assert.equal(structuredAuthInput.safeParse(sample).success, true);
    if (body.action === "enter") assert.equal(body.choice, undefined);
  }
  const cancelled = auth.find((item) => item.request.method === "DELETE");
  assert.ok(
    cancelled.request.url.raw.endsWith("?sessionId={{workerAuthSessionId}}"),
  );
  assert.deepEqual(cancelled.request.url.query, [
    { key: "sessionId", value: "{{workerAuthSessionId}}" },
  ]);
  for (const variable of collection.variable.filter((entry: any) =>
    ["workerAuthSessionId", "workerAuthPromptId"].includes(entry.key),
  ))
    assert.equal(variable.value, "");
});
test("tracked API and prepared wiki authentication articles reject legacy text and preserve helper consent semantics", async () => {
  for (const path of ["docs/API.md", "docs/wiki/pending/API.md"]) {
    const text = await readFile(resolve(root, path), "utf8");
    assert.equal(text.includes("Input uses `{ input }`"), false);
    assert.ok(text.includes("promptId"));
    assert.ok(text.includes("sessionId=<uuid>"));
    assert.ok(text.includes("WORKER_AUTH_PROTOCOL_UPDATE_REQUIRED"));
    assert.ok(text.includes("gitSetupState"));
    assert.ok(text.includes("declined"));
  }
  const workers = await readFile(
    resolve(root, "docs/wiki/pending/Workers.md"),
    "utf8",
  );
  assert.equal(workers.includes("Send bounded keyboard input"), false);
  assert.ok(workers.includes("](Worker-authentication.md)"));
  const auth = await readFile(
    resolve(root, "docs/wiki/pending/Worker-authentication.md"),
    "utf8",
  );
  assert.ok(auth.includes("gitSetupState"));
  assert.ok(auth.includes("never runs `gh auth setup-git`"));
  assert.ok(auth.includes("sessionId"));
});
