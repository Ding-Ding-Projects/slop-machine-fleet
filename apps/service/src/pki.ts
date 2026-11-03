import forge from "node-forge";
import { mkdir, readFile, writeFile, chmod, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import type { Enrollment } from "./transport.js";
const pki = forge.pki;
async function exists(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (e: any) {
    if (e.code === "ENOENT") return undefined;
    throw e;
  }
}
async function privateWrite(path: string, value: string) {
  await writeFile(path, value, { mode: 0o600, flag: "wx" });
  await chmod(path, 0o600);
}
function certificate(
  publicKey: forge.pki.PublicKey,
  commonName: string,
  issuer: any,
  key: forge.pki.rsa.PrivateKey,
  server: boolean,
  ca = false,
) {
  const c = pki.createCertificate();
  c.publicKey = publicKey;
  c.serialNumber = "01" + randomBytes(19).toString("hex");
  c.validity.notBefore = new Date(Date.now() - 60000);
  c.validity.notAfter = new Date(Date.now() + (ca ? 3650 : 365) * 86400000);
  c.setSubject([{ name: "commonName", value: commonName }]);
  c.setIssuer(issuer);
  c.setExtensions([
    { name: "basicConstraints", cA: ca, critical: true },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
      keyCertSign: ca,
      cRLSign: ca,
      critical: true,
    },
    ...(ca
      ? []
      : [
          { name: "extKeyUsage", serverAuth: server, clientAuth: !server },
          ...(server
            ? [
                {
                  name: "subjectAltName",
                  altNames: [{ type: 2, value: commonName }],
                },
              ]
            : []),
        ]),
  ]);
  c.sign(key, forge.md.sha256.create());
  return c;
}
export class CertificateAuthority {
  constructor(readonly directory: string) {}
  async material() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const keyFile = join(this.directory, "ca.key"),
      certFile = join(this.directory, "ca.pem");
    let key = await exists(keyFile),
      pem = await exists(certFile);
    if (!key && !pem) {
      const keys = pki.rsa.generateKeyPair(3072),
        subject = [
          { name: "commonName", value: "Slop Machine Fleet worker authority" },
        ];
      const cert = certificate(
        keys.publicKey,
        "Slop Machine Fleet worker authority",
        subject,
        keys.privateKey,
        false,
        true,
      );
      await privateWrite(keyFile, pki.privateKeyToPem(keys.privateKey));
      await privateWrite(certFile, pki.certificateToPem(cert));
      key = await exists(keyFile);
      pem = await exists(certFile);
    }
    if (!key || !pem)
      throw new Error(
        "Incomplete certificate authority state; restore the protected volume.",
      );
    return {
      key: pki.privateKeyFromPem(key),
      cert: pki.certificateFromPem(pem),
      pem,
      certFile,
    };
  }
  async enroll(
    worker: any,
    csrPem: string,
  ): Promise<{
    enrollment: Enrollment;
    serverCertificate: string;
    controllerCa: string;
    controllerThumbprint: string;
  }> {
    if (!/^[a-f0-9-]{36}$/.test(worker.id) || csrPem.length > 16384)
      throw new Error("Invalid worker certificate request");
    const csr = pki.certificationRequestFromPem(csrPem);
    if (
      !csr.publicKey ||
      !csr.verify() ||
      csr.subject.getField("CN")?.value !== `worker-${worker.id}`
    )
      throw new Error("Worker certificate identity is invalid");
    const ca = await this.material(),
      directory = join(this.directory, worker.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const clientKeyFile = join(directory, "client.key"),
      clientCertFile = join(directory, "client.pem");
    let clientPem = await exists(clientCertFile),
      clientKey = await exists(clientKeyFile);
    if (!clientPem && !clientKey) {
      const keys = pki.rsa.generateKeyPair(2048),
        cert = certificate(
          keys.publicKey,
          `controller-${worker.id}`,
          ca.cert.subject.attributes,
          ca.key,
          false,
        );
      await privateWrite(clientKeyFile, pki.privateKeyToPem(keys.privateKey));
      await privateWrite(clientCertFile, pki.certificateToPem(cert));
      clientPem = await exists(clientCertFile);
      clientKey = await exists(clientKeyFile);
    }
    if (!clientPem || !clientKey)
      throw new Error("Incomplete worker controller certificate state");
    const server = certificate(
      csr.publicKey,
      `worker-${worker.id}`,
      ca.cert.subject.attributes,
      ca.key,
      true,
    );
    const der = Buffer.from(
      forge.asn1
        .toDer(pki.certificateToAsn1(pki.certificateFromPem(clientPem)))
        .getBytes(),
      "binary",
    );
    return {
      enrollment: {
        instanceId: worker.instanceId,
        region: worker.region,
        caFile: ca.certFile,
        certFile: clientCertFile,
        keyFile: clientKeyFile,
        serverName: `worker-${worker.id}`,
      },
      serverCertificate: pki.certificateToPem(server),
      controllerCa: ca.pem,
      controllerThumbprint: createHash("sha256").update(der).digest("hex"),
    };
  }
  async saveManifest(enrollments: Record<string, Enrollment>) {
    const file = join(this.directory, "enrollments.json"),
      temporary = file + ".pending";
    await writeFile(temporary, JSON.stringify(enrollments), { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, file);
  }
}
