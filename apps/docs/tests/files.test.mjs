import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readContainedFile, replaceGenerated } from "../scripts/files.mjs";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
test("negative out-of-root junction fixture is readable by the old path but rejected before bundling; regular source succeeds", async () => {
  const fixture = await fs.mkdtemp(
    path.join(app, ".test-fixtures-containment-"),
  );
  const source = path.join(fixture, "source"),
    outside = path.join(fixture, "outside");
  await fs.mkdir(source);
  await fs.mkdir(outside);
  const outsideBytes = Buffer.from(
    "# External fixture\nNot authorized for publication.\n",
  );
  await fs.writeFile(path.join(outside, "README.md"), outsideBytes);
  await fs.symlink(outside, path.join(source, "deploy"), "junction");
  const selected = path.join(source, "deploy", "README.md");
  assert.equal(
    sha(await fs.readFile(selected)),
    sha(outsideBytes),
    "negative fixture must actually expose bytes through an unchecked read",
  );
  await assert.rejects(readContainedFile(source, selected, 1024), /symlinks/);
  const expected = Buffer.from("# Allowed fixture\nComplete article bytes.\n");
  const allowed = path.join(source, "README.md");
  await fs.writeFile(allowed, expected);
  const actual = await readContainedFile(source, allowed, 1024);
  assert.deepEqual(actual, expected);
  assert.equal(sha(actual), sha(expected));
  await assert.rejects(readContainedFile(source, allowed, 4), /size limit/);
  await fs.mkdir(path.join(source, "directory.md"));
  await assert.rejects(
    readContainedFile(source, path.join(source, "directory.md"), 1024),
  );
});
test("negative stale output is retired outside public; positive replacement bytes match independently", async () => {
  const fixture = await fs.mkdtemp(path.join(app, ".test-fixtures-output-"));
  const generated = path.join(fixture, "public", "generated");
  await fs.mkdir(generated, { recursive: true });
  const stale = Buffer.from("obsolete-image-fixture"),
    current = Buffer.from("replacement-image-fixture");
  await fs.writeFile(path.join(generated, "stale.png"), stale);
  const stage = await fs.mkdtemp(path.join(fixture, ".generated-stage-"));
  await fs.writeFile(path.join(stage, "current.png"), current);
  assert.deepEqual(
    await fs.readdir(generated),
    ["stale.png"],
    "old write-only output exposes the stale asset",
  );
  const retired = await replaceGenerated(fixture, stage);
  assert.deepEqual(await fs.readdir(generated), ["current.png"]);
  await assert.rejects(
    fs.readFile(path.join(generated, "stale.png")),
    (error) => error.code === "ENOENT",
  );
  assert.equal(
    sha(await fs.readFile(path.join(generated, "current.png"))),
    sha(current),
  );
  assert.ok(
    retired && !retired.startsWith(path.join(fixture, "public") + path.sep),
  );
  assert.equal(
    sha(await fs.readFile(path.join(retired, "stale.png"))),
    sha(stale),
    "retirement preserves prior bytes without publishing them",
  );
  const second = await fs.mkdtemp(path.join(fixture, ".generated-stage-"));
  await fs.writeFile(path.join(second, "next.png"), current);
  await replaceGenerated(fixture, second);
  assert.deepEqual(await fs.readdir(generated), ["next.png"]);
});
