import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const workspace = resolve(import.meta.dirname, ".."),
  evidence = resolve(workspace, "../../.agent/signup-postgres");
await mkdir(evidence, { recursive: true });
const directory = await mkdtemp(resolve(evidence, "fixture-")),
  ownerId = randomUUID(),
  name = "fleet-signup-fixture-" + ownerId.slice(0, 8),
  image =
    "postgres@sha256:4327b9fd295502f326f44153a1045a7170ddbfffed1c3829798328556cfd09e2";
let created = false;
const docker = (args) => {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
  });
  if (r.status !== 0) throw new Error("Fixture Docker operation failed");
  return r.stdout.trim();
};
try {
  const password = randomBytes(32).toString("base64url"),
    passwordFile = resolve(directory, "password");
  await writeFile(passwordFile, password, { mode: 0o600 });
  docker(["pull", image]);
  docker([
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    "fleet.test.owner=" + ownerId,
    "--log-driver",
    "none",
    "--publish",
    "127.0.0.1::5432",
    "--mount",
    `type=bind,src=${passwordFile},dst=/run/secrets/db-password,readonly`,
    "--env",
    "POSTGRES_PASSWORD_FILE=/run/secrets/db-password",
    image,
    "postgres",
    "-c",
    "fleet.test.owner=" + ownerId,
    "-c",
    "log_min_messages=fatal",
    "-c",
    "log_min_error_statement=panic",
    "-c",
    "log_parameter_max_length_on_error=0",
  ]);
  created = true;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const status = spawnSync(
      "docker",
      ["exec", name, "pg_isready", "-U", "postgres"],
      { stdio: "ignore", windowsHide: true, timeout: 3000 },
    );
    if (status.status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error("Owned PostgreSQL fixture did not become ready");
  const port = docker(["port", name, "5432/tcp"]);
  if (!/^127\.0\.0\.1:\d+$/.test(port))
    throw new Error("Fixture port is not loopback-only");
  const config = resolve(directory, "connection.json");
  await writeFile(
    config,
    JSON.stringify({
      purpose: "fleet-first-signup-isolated-fixture",
      ownerId,
      url: `postgresql://postgres:${password}@${port}/postgres`,
    }),
    { mode: 0o600 },
  );
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "test/signup-postgres.test.ts"],
    {
      cwd: workspace,
      env: { ...process.env, FLEET_TEST_PG_FILE: config },
      encoding: "utf8",
      windowsHide: true,
      timeout: 120000,
    },
  );
  if (((result.stdout ?? "") + (result.stderr ?? "")).includes(password))
    throw new Error("Fixture output contained protected connection material");
  await writeFile(
    resolve(evidence, "postgres-tests.log"),
    (result.stdout ?? "") + (result.stderr ?? ""),
    { mode: 0o600 },
  );
  const requiredChecks = [
    "two independent services atomically accept exactly one owner and one initial session",
    "an initial session failure rolls back the owner claim and emits no cookie",
    "legacy password login and one-time username adoption preserve credentials, identity, sessions and scope",
    "signup input, origin and claimed-state responses expose no setup code requirement",
    "concurrent legacy identity initialization preserves stable identities",
    "password bytes remain unchanged and username adoption requires CSRF",
  ];
  const completeDiscovery = requiredChecks.every((name) =>
    (result.stdout ?? "").includes(name),
  );
  const summary = {
    image,
    ownedFixture: true,
    loopbackOnly: true,
    testExitCode: result.status,
    testsPassed: result.status === 0 && completeDiscovery,
    completeDiscovery,
    liveControllerTouched: false,
  };
  await writeFile(
    resolve(evidence, "postgres-receipt.json"),
    JSON.stringify(summary, null, 2),
    { mode: 0o600 },
  );
  process.stdout.write(JSON.stringify(summary) + "\n");
  if (result.status !== 0 || !completeDiscovery) process.exitCode = 1;
} catch {
  process.stdout.write(
    JSON.stringify({
      code: "OWNED_POSTGRES_FIXTURE_FAILED",
      liveControllerTouched: false,
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  if (created) {
    const actual = docker([
      "inspect",
      name,
      "--format",
      '{{index .Config.Labels "fleet.test.owner"}}',
    ]);
    if (actual !== ownerId)
      throw new Error("Refusing teardown without matching fixture ownership");
    docker(["rm", "--force", name]);
  }
  if (
    !directory.startsWith(evidence + "\\") &&
    !directory.startsWith(evidence + "/")
  )
    throw new Error("Refusing cleanup outside owned fixture root");
  await rm(directory, { recursive: true, force: true });
}
