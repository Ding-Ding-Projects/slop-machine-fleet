import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  DescribeInstanceInformationCommand,
} from "@aws-sdk/client-ssm";
import type { ActionAttemptContext } from "./bulk-operations.js";
import type { CloudProvider } from "./cloud.js";
import type { Store } from "./db.js";
import type { Worker } from "@fleet/shared";
import { CertificateAuthority } from "./pki.js";
import type { Enrollment, WorkerTransport } from "./transport.js";
import { z } from "zod";
export const releaseSchema = z
  .object({
    version: z.string().regex(/^[\w.-]{1,80}$/),
    assetUrl: z.string().url(),
    assetSha256: z.string().regex(/^[a-f0-9]{64}$/),
    bootstrapUrl: z.string().url(),
    bootstrapSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const key of ["assetUrl", "bootstrapUrl"] as const) {
      const u = new URL(v[key]);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            "A public HTTPS release URL without credentials is required.",
        });
    }
  });
export interface Provisioner {
  reconcile(worker: Worker): Promise<Worker>;
  reset(
    worker: Worker,
    mode?: "repair" | "update",
    context?: ActionAttemptContext,
  ): Promise<void>;
}
const ps = (v: string) => `'${v.replaceAll("'", "''")}'`,
  b64 = (v: string) => Buffer.from(v).toString("base64");
export class SsmProvisioner implements Provisioner {
  constructor(
    private store: Store,
    private cloud: CloudProvider,
    private ca: CertificateAuthority,
    private enrollments: Record<string, Enrollment>,
    private transport: WorkerTransport,
    private release: z.infer<typeof releaseSchema>,
    private client: (region: string) => Pick<SSMClient, "send"> = (region) =>
      new SSMClient({ region }),
  ) {}
  async reset(
    worker: Worker,
    mode: "repair" | "update" = "repair",
    context?: ActionAttemptContext,
  ) {
    if (!worker.instanceId) throw new Error("Instance identity is unavailable");
    delete this.enrollments[worker.id];
    await this.ca.saveManifest(this.enrollments);
    await this.store.put("state", `bootstrap:${worker.id}`, {
      phase: "request",
      operationId: context?.operationId ?? null,
      attemptId: context?.attemptId ?? null,
      mode,
      version: this.release.version,
      attempts: 0,
      startedAt: Date.now(),
    });
  }
  async send(w: Worker, command: string) {
    const result = await this.client(w.region).send(
      new SendCommandCommand({
        InstanceIds: [w.instanceId!],
        DocumentName: "AWS-RunPowerShellScript",
        Parameters: { commands: [command], executionTimeout: ["900"] },
        TimeoutSeconds: 900,
        Comment:
          "Install and enroll a fleet worker using public certificate material only",
      }),
    );
    if (!result.Command?.CommandId)
      throw new Error("SSM command was not accepted");
    return result.Command.CommandId;
  }
  async reconcile(worker: Worker) {
    if (!worker.instanceId) return worker;
    if (!worker.dataVolumeId) {
      worker.dataVolumeId = await this.cloud.dataVolume(worker);
      if (!/^vol-[a-f0-9]+$/.test(worker.dataVolumeId))
        throw new Error("Invalid provider data volume identity");
    }
    let state = await this.store.get("state", `bootstrap:${worker.id}`);
    if (!state) {
      state = {
        phase: "request",
        version: this.release.version,
        attempts: 0,
        startedAt: Date.now(),
      };
      await this.store.put("state", `bootstrap:${worker.id}`, state);
    }
    if (state.phase === "failed") {
      worker.state = "bootstrap-failed";
      return worker;
    }
    if (Date.now() - state.startedAt > 3600000) {
      state.phase = "failed";
      state.reason =
        "Bootstrap exceeded one hour. Inspect instance and repair explicitly.";
      await this.store.put("state", `bootstrap:${worker.id}`, state);
      worker.state = "bootstrap-failed";
      return worker;
    }
    if (state.phase === "health") {
      try {
        const health = await this.transport.request(worker, "GET", "/health");
        if (
          health.workerId !== worker.id ||
          health.ready !== true ||
          health.version !== this.release.version
        )
          throw new Error("Worker health identity is not ready");
        worker.transport = "ready";
        worker.state = "ready";
      } catch {
        worker.state = "bootstrapping";
      }
      return worker;
    }
    if (!state.commandId) {
      const managed = await this.client(worker.region).send(
        new DescribeInstanceInformationCommand({
          Filters: [{ Key: "InstanceIds", Values: [worker.instanceId] }],
        }),
      );
      if (
        !managed.InstanceInformationList?.some(
          (i) =>
            i.InstanceId === worker.instanceId &&
            i.PingStatus === "Online" &&
            i.PlatformType === "Windows",
        )
      ) {
        worker.state = "bootstrapping";
        return worker;
      }
      try {
        if (state.phase === "request") {
          const command = `$ErrorActionPreference='Stop'; $root='C:\\ProgramData\\SlopMachineFleet'; New-Item -ItemType Directory -Force $root | Out-Null; $script=Join-Path $root 'Bootstrap-Worker.ps1'; Invoke-WebRequest -UseBasicParsing -Uri ${ps(this.release.bootstrapUrl)} -OutFile $script; if((Get-FileHash -Algorithm SHA256 $script).Hash.ToLowerInvariant() -ne ${ps(this.release.bootstrapSha256)}){throw 'Bootstrap digest mismatch'}; & $script -Phase ${state.mode === "repair" ? "Repair" : state.mode === "update" ? "Update" : "Request"} -AssetUrl ${ps(this.release.assetUrl)} -AssetSha256 ${ps(this.release.assetSha256)} -WorkerId ${ps(worker.id)} -InstallRoot $root -DataVolumeId ${ps(worker.dataVolumeId)}; if($LASTEXITCODE -ne 0){throw 'Worker request failed'}`;
          state.commandId = await this.send(worker, command);
        } else if (state.phase === "complete") {
          state.commandId = await this.send(
            worker,
            `$ErrorActionPreference='Stop'; & 'C:\\ProgramData\\SlopMachineFleet\\Bootstrap-Worker.ps1' -Phase Complete -WorkerId ${ps(worker.id)} -InstallRoot 'C:\\ProgramData\\SlopMachineFleet' -DataVolumeId ${ps(worker.dataVolumeId)} -ServerCertificateBase64 ${ps(state.serverCertificateBase64)} -ControllerCaBase64 ${ps(state.controllerCaBase64)} -ControllerThumbprint ${ps(state.controllerThumbprint)}; if($LASTEXITCODE -ne 0){throw 'Worker enrollment failed'}`,
          );
        }
        await this.store.put("state", `bootstrap:${worker.id}`, state);
      } catch {
        state.attempts++;
        if (state.attempts >= 3) {
          state.phase = "failed";
          state.reason =
            "SSM command could not be accepted after three attempts. Verify the worker instance profile and SSM network access.";
        }
        await this.store.put("state", `bootstrap:${worker.id}`, state);
      }
      worker.state = "bootstrapping";
      return worker;
    }
    try {
      const result = await this.client(worker.region).send(
        new GetCommandInvocationCommand({
          CommandId: state.commandId,
          InstanceId: worker.instanceId,
        }),
      );
      if (["Pending", "InProgress", "Delayed"].includes(result.Status ?? ""))
        return worker;
      if (result.Status !== "Success") {
        state.phase = "failed";
        state.reason =
          "Worker bootstrap command did not complete successfully. Inspect SSM invocation status; do not expose authentication data.";
      } else if (state.phase === "request") {
        const output = result.StandardOutputContent ?? "";
        if (output.length > 20000)
          throw new Error("Oversized public CSR response");
        const match = output.match(/\{[^]*\}/);
        const request = JSON.parse(match?.[0] ?? "{}");
        if (request.workerId !== worker.id || typeof request.csr !== "string")
          throw new Error("Invalid public CSR response");
        const signed = await this.ca.enroll(worker, request.csr);
        this.enrollments[worker.id] = signed.enrollment;
        await this.ca.saveManifest(this.enrollments);
        state = {
          ...state,
          phase: "complete",
          commandId: undefined,
          serverCertificateBase64: b64(signed.serverCertificate),
          controllerCaBase64: b64(signed.controllerCa),
          controllerThumbprint: signed.controllerThumbprint,
        };
      } else {
        state = { ...state, phase: "health", commandId: undefined };
      }
      await this.store.put("state", `bootstrap:${worker.id}`, state);
    } catch {
      state.pollErrors = (state.pollErrors ?? 0) + 1;
      if (state.pollErrors >= 3) {
        state.phase = "failed";
        state.reason = "Public enrollment response could not be verified.";
      }
      await this.store.put("state", `bootstrap:${worker.id}`, state);
    }
    worker.state =
      state.phase === "failed" ? "bootstrap-failed" : "bootstrapping";
    return worker;
  }
}
