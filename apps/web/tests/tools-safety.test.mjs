import test from "node:test";
import assert from "node:assert/strict";
import {
  createSafetyRegistry,
  deriveToolSafety,
} from "../src/tools/safety.mjs";
test("draft processing cancellation and output remain unsafe until explicit reset", () => {
  const registry = createSafetyRegistry(["base64", "converter"]);
  let cancellations = 0;
  assert.equal(registry.canLeave(), false);
  const base = registry.register("base64", () => cancellations++),
    converter = registry.register("converter", () => cancellations++);
  base.update(deriveToolSafety());
  converter.update(deriveToolSafety());
  assert.equal(registry.canLeave(), true);
  base.update(deriveToolSafety({ hasDraft: true }));
  assert.equal(registry.canLeave(), false);
  base.update(deriveToolSafety({ hasDraft: true, busy: true }));
  assert.deepEqual(registry.snapshot(), {
    known: true,
    dirty: true,
    pendingWrites: true,
  });
  base.update(deriveToolSafety({ hasDraft: true, busy: false }));
  assert.equal(
    registry.canLeave(),
    false,
    "cancellation must not discard the draft",
  );
  base.update(deriveToolSafety({ hasOutput: true }));
  assert.equal(
    registry.canLeave(),
    false,
    "a completed download attempt is not a verified save",
  );
  assert.equal(cancellations, 0, "safety inspection must not cancel work");
  registry.discard();
  assert.equal(cancellations, 2);
  assert.equal(
    registry.snapshot().known,
    false,
    "reset waits for replacement panel registration",
  );
  base.update(deriveToolSafety());
  converter.update(deriveToolSafety());
  assert.equal(registry.canLeave(), true);
});
test("inactive files and option edits retain ownership and obsolete cleanup cannot remove replacements", () => {
  const registry = createSafetyRegistry(["base64", "converter"]);
  const first = registry.register("base64", () => {}),
    other = registry.register("converter", () => {});
  first.update(deriveToolSafety());
  other.update(deriveToolSafety({ hasFiles: true }));
  assert.equal(registry.canLeave(), false);
  const replacement = registry.register("base64", () => {});
  replacement.update(deriveToolSafety({ optionsChanged: true }));
  first.unregister();
  first.update(deriveToolSafety());
  other.update(deriveToolSafety());
  assert.deepEqual(registry.snapshot(), {
    known: true,
    dirty: true,
    pendingWrites: false,
  });
  replacement.unregister();
  assert.equal(registry.snapshot().known, false);
});
test("safety emission contains only validated booleans and fails closed on invalid state", () => {
  const registry = createSafetyRegistry(["base64"]);
  const emitted = [];
  const stop = registry.subscribe((value) => emitted.push(value));
  const panel = registry.register("base64", () => {});
  panel.update({ ...deriveToolSafety(), payload: "must not escape" });
  assert.deepEqual(Object.keys(emitted.at(-1)).sort(), [
    "dirty",
    "known",
    "pendingWrites",
  ]);
  panel.update({ known: true, dirty: "no", pendingWrites: false });
  assert.equal(registry.canLeave(), false);
  assert.equal(deriveToolSafety({ busy: "unknown" }).known, false);
  stop();
});
