import test from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CertificateAuthority } from "../src/pki.js";
import { releaseSchema } from "../src/provisioning.js";
test("worker CSR signing verifies identity and persists only protected controller private keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fleet-pki-test-"));
  try {
    const ca = new CertificateAuthority(directory),
      id = randomUUID(),
      worker = { id, instanceId: "i-test", region: "us-east-1" },
      keys = forge.pki.rsa.generateKeyPair(2048),
      csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([{ name: "commonName", value: `worker-${id}` }]);
    csr.sign(keys.privateKey, forge.md.sha256.create());
    const result = await ca.enroll(
      worker,
      forge.pki.certificationRequestToPem(csr),
    );
    const cert = forge.pki.certificateFromPem(result.serverCertificate);
    assert.equal(cert.subject.getField("CN").value, `worker-${id}`);
    assert.ok(
      (cert.getExtension("subjectAltName") as any).altNames.some(
        (a: any) => a.value === `worker-${id}`,
      ),
    );
    const root = forge.pki.certificateFromPem(result.controllerCa);
    assert.equal(root.verify(cert), true);
    assert.match(result.controllerThumbprint, /^[a-f0-9]{64}$/);
    assert.ok(
      (await readFile(result.enrollment.keyFile, "utf8")).includes(
        "PRIVATE KEY",
      ),
    );
    assert.equal(JSON.stringify(result).includes("PRIVATE KEY"), false);
    await assert.rejects(
      ca.enroll(
        { ...worker, id: randomUUID() },
        forge.pki.certificationRequestToPem(csr),
      ),
      /identity/,
    );
    const again = await ca.enroll(
      worker,
      forge.pki.certificationRequestToPem(csr),
    );
    assert.equal(again.controllerThumbprint, result.controllerThumbprint);
  } finally {
    await rm(directory, { recursive: true });
  }
});
test("worker releases reject credential-bearing URLs and unbound hashes", () => {
  const valid = {
    version: "1.0.0",
    assetUrl: "https://example.com/worker.exe",
    assetSha256: "a".repeat(64),
    bootstrapUrl: "https://example.com/bootstrap.ps1",
    bootstrapSha256: "b".repeat(64),
  };
  assert.equal(releaseSchema.safeParse(valid).success, true);
  assert.equal(
    releaseSchema.safeParse({
      ...valid,
      assetUrl: "https://user:password@example.com/worker.exe",
    }).success,
    false,
  );
  assert.equal(
    releaseSchema.safeParse({ ...valid, assetSha256: "unknown" }).success,
    false,
  );
  assert.equal(
    releaseSchema.safeParse({
      ...valid,
      bootstrapUrl: "http://example.com/bootstrap.ps1",
    }).success,
    false,
  );
});
