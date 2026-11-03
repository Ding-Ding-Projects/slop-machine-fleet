import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "fleet-static-override-"));
try {
  const manifest = join(root, "package.json");
  await writeFile(
    manifest,
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { fastify: "5.12.8", "@fastify/static": "10.1.8" },
      overrides: { "@fastify/static": { glob: "14.0.2" } },
    }),
  );
  const installed =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            "npm install --ignore-scripts --no-audit --no-fund",
          ],
          { cwd: root, stdio: "ignore", windowsHide: true, timeout: 120000 },
        )
      : spawnSync(
          "npm",
          ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
          { cwd: root, stdio: "ignore", timeout: 120000 },
        );
  if (installed.status !== 0)
    throw new Error(
      "Isolated compatibility dependencies could not be installed.",
    );
  const require = createRequire(manifest),
    Fastify = require("fastify"),
    plugin = require("@fastify/static"),
    staticRequire = createRequire(
      require.resolve("@fastify/static/package.json"),
    ),
    globFile = staticRequire.resolve("glob/package.json"),
    globRequire = createRequire(globFile);
  const versions = {
    fastify: require("fastify/package.json").version,
    static: require("@fastify/static/package.json").version,
    glob: staticRequire("glob/package.json").version,
    minimatch: globRequire("minimatch/package.json").version,
  };
  assert.equal(versions.static, "10.1.8");
  assert.equal(versions.glob, "14.0.2");
  assert.ok(Number(versions.minimatch.split(".")[0]) >= 11);
  const web = join(root, "web");
  await mkdir(join(web, "nested"), { recursive: true });
  await mkdir(join(web, "private"), { recursive: true });
  await writeFile(join(web, "nested", "safe.txt"), "safe-glob-enumeration");
  await writeFile(
    join(web, "private", "restricted.txt"),
    "restricted-static-marker",
  );
  for (const wildcard of [false, true]) {
    const app = Fastify();
    try {
      await app.register(plugin, {
        root: web,
        wildcard,
        list: false,
        allowedPath: (path) => !path.includes("/private/"),
      });
      await app.ready();
      assert.equal(
        (await app.inject({ url: "/nested/safe.txt" })).body,
        "safe-glob-enumeration",
      );
      for (const url of [
        "/private/restricted.txt",
        "//private/restricted.txt",
        "/nested/../private/restricted.txt",
        "/./private/restricted.txt",
      ]) {
        const result = await app.inject({ url });
        assert.equal(
          result.body.includes("restricted-static-marker"),
          false,
          `wildcard=${wildcard} ${url}`,
        );
      }
      assert.equal((await app.inject({ url: "/not-a-file" })).statusCode, 404);
    } finally {
      await app.close();
    }
  }
  process.stdout.write(
    JSON.stringify({
      status: "passed",
      versions,
      wildcardAndGlobEnumeration: true,
      directoryListing: false,
    }) + "\n",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
