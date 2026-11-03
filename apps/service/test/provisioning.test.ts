import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { newDb } from "pg-mem";
import { Store, migrate } from "../src/db.js";
import { SsmProvisioner } from "../src/provisioning.js";
import {
  DescribeInstanceInformationCommand,
  SendCommandCommand,
} from "@aws-sdk/client-ssm";
test("durable provisioning sends only public material and requires exact authenticated health version", async () => {
  const pg = newDb().adapters.createPg(),
    db = new pg.Pool();
  await migrate(db);
  const store = new Store(db),
    id = randomUUID(),
    commands: string[] = [],
    enrollments: any = {};
  let version = "wrong";
  const release = {
    version: "0.1.0",
    assetUrl: "https://example.com/worker.exe",
    assetSha256: "a".repeat(64),
    bootstrapUrl: "https://example.com/Bootstrap-Worker.ps1",
    bootstrapSha256: "b".repeat(64),
  };
  const worker: any = {
    id,
    instanceId: "i-test",
    region: "us-east-1",
    state: "bootstrapping",
    transport: "unenrolled",
  };
  const client: any = {
    send: async (command: any) => {
      if (command instanceof DescribeInstanceInformationCommand)
        return {
          InstanceInformationList: [
            {
              InstanceId: "i-test",
              PingStatus: "Online",
              PlatformType: "Windows",
            },
          ],
        };
      if (command instanceof SendCommandCommand) {
        commands.push(command.input.Parameters.commands[0]);
        return { Command: { CommandId: String(commands.length) } };
      }
      return {
        Status: "Success",
        StandardOutputContent: JSON.stringify({
          workerId: id,
          csr: "public-test-csr",
        }),
      };
    },
  };
  const ca: any = {
    saveManifest: async () => {},
    enroll: async (w: any, csr: string) => {
      assert.equal(csr, "public-test-csr");
      return {
        enrollment: {
          instanceId: w.instanceId,
          region: w.region,
          caFile: "protected-ca-path",
          certFile: "protected-client-cert-path",
          keyFile: "protected-client-key-path",
          serverName: `worker-${id}`,
        },
        serverCertificate: "public-server-cert",
        controllerCa: "public-ca",
        controllerThumbprint: "c".repeat(64),
      };
    },
  };
  const provisioner = new SsmProvisioner(
    store,
    { dataVolume: async () => "vol-ab12" } as any,
    ca,
    enrollments,
    {
      ready: async () => true,
      request: async () => ({ workerId: id, ready: true, version }),
    },
    release,
    () => client,
  );
  try {
    await provisioner.reconcile(worker);
    assert.equal(commands.length, 1);
    assert.ok(commands[0].includes("-DataVolumeId 'vol-ab12'"));
    await provisioner.reconcile(worker);
    assert.ok(enrollments[id]);
    await provisioner.reconcile(worker);
    assert.equal(commands.length, 2);
    assert.ok(commands[1].includes("-Phase Complete"));
    assert.equal(commands.join("").includes("PRIVATE KEY"), false);
    await provisioner.reconcile(worker);
    await provisioner.reconcile(worker);
    assert.equal(worker.state, "bootstrapping");
    version = "0.1.0";
    await provisioner.reconcile(worker);
    assert.equal(worker.state, "ready");
    assert.equal(worker.transport, "ready");
    await provisioner.reset(worker, "update");
    await provisioner.reconcile(worker);
    assert.ok(commands[2].includes("-Phase Update"));
    assert.equal(commands[2].includes("-Phase Request"), false);
  } finally {
    await db.end();
  }
});
