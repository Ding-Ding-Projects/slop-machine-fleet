import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { registerWebAssets } from "./web-assets.js";
import { createService } from "./app.js";
import { Store } from "./db.js";
import { CertificateAuthority } from "./pki.js";
import { SsmProvisioner, releaseSchema } from "./provisioning.js";
import { database } from "./db.js";
import { AwsProvider } from "./cloud.js";
import { SsmTransport } from "./transport.js";
const url = process.env.DATABASE_URL_FILE
  ? (await readFile(process.env.DATABASE_URL_FILE, "utf8")).trim()
  : process.env.DATABASE_URL;
if (!url) throw new Error("A database connection configuration is required.");
const origin = process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:3000",
  parsed = new URL(origin);
if (
  parsed.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(parsed.hostname)
)
  throw new Error("Non-loopback hosting requires HTTPS.");
const enrollments = process.env.WORKER_ENROLLMENT_FILE
  ? JSON.parse(await readFile(process.env.WORKER_ENROLLMENT_FILE, "utf8"))
  : {};
if (process.env.CONTROLLER_PKI_DIR) {
  try {
    Object.assign(
      enrollments,
      JSON.parse(
        await readFile(
          resolve(process.env.CONTROLLER_PKI_DIR, "enrollments.json"),
          "utf8",
        ),
      ),
    );
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
}
const transport = new SsmTransport(enrollments);
const cloud = new AwsProvider();
const db = database(url);
const lease = await db.connect();
const locked = await lease.query(
  "SELECT pg_try_advisory_lock(723662801) AS acquired",
);
if (!locked.rows[0]?.acquired) {
  await lease.release();
  await db.end();
  throw new Error("Another controller already owns this database.");
}
const app = await createService({
  db,
  cloud,
  transport,
  provisioner:
    process.env.WORKER_RELEASE_FILE && process.env.CONTROLLER_PKI_DIR
      ? new SsmProvisioner(
          new Store(db),
          cloud,
          new CertificateAuthority(process.env.CONTROLLER_PKI_DIR),
          enrollments,
          transport,
          releaseSchema.parse(
            JSON.parse(await readFile(process.env.WORKER_RELEASE_FILE, "utf8")),
          ),
        )
      : undefined,
  origin,
  featureManifestFile:
    process.env.FEATURE_MANIFEST_FILE ??
    resolve(import.meta.dirname, "../../../docs/required-features.json"),
  setupCodeFile: process.env.SETUP_CODE_FILE,
  secureCookies: parsed.protocol === "https:",
});
lease.on("error", () => {
  void app.close();
});
if (process.env.WEB_ROOT) await registerWebAssets(app, process.env.WEB_ROOT);
app.addHook("onClose", async () => {
  try {
    await lease.query("SELECT pg_advisory_unlock(723662801)");
  } finally {
    lease.release();
    await db.end();
  }
});
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
});
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.once(s, () => {
    void app.close();
  });
