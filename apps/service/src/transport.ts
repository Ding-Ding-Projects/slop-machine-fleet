import https from "node:https";
import { readFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
export interface WorkerTransport {
  request(
    worker: any,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<any>;
  ready(worker: any): Promise<boolean>;
}
export interface Enrollment {
  instanceId: string;
  region: string;
  caFile: string;
  certFile: string;
  keyFile: string;
  serverName: string;
}
// Enrollment must be provisioned by a separate authenticated bootstrap process.
export class SsmTransport implements WorkerTransport {
  constructor(private readonly enrollments: Record<string, Enrollment>) {}
  async ready(worker: any) {
    return Boolean(
      this.enrollments[worker.id] &&
        this.enrollments[worker.id].instanceId === worker.instanceId,
    );
  }
  async request(
    worker: any,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<any> {
    const e = this.enrollments[worker.id];
    if (!e || e.instanceId !== worker.instanceId)
      throw new Error(
        "Worker certificate enrollment is incomplete. Provision an authenticated worker certificate and controller enrollment before dispatch.",
      );
    const port = await new Promise<number>((resolve, reject) => {
      const s = net.createServer();
      s.on("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const p = (s.address() as net.AddressInfo).port;
        s.close(() => resolve(p));
      });
    });
    const child: ChildProcess = spawn(
      "aws",
      [
        "ssm",
        "start-session",
        "--region",
        e.region,
        "--target",
        e.instanceId,
        "--document-name",
        "AWS-StartPortForwardingSession",
        "--parameters",
        JSON.stringify({
          portNumber: ["8765"],
          localPortNumber: [String(port)],
        }),
      ],
      { stdio: "ignore", windowsHide: true },
    );
    let exited = false;
    child.on("error", () => {
      exited = true;
    });
    child.on("exit", () => {
      exited = true;
    });
    try {
      const deadline = Date.now() + 15000;
      while (true) {
        if (exited || Date.now() > deadline)
          throw new Error(
            "SSM tunnel could not be established. Verify AWS CLI, session-manager-plugin, instance role and SSM connectivity.",
          );
        const connected = await new Promise<boolean>((r) => {
          const s = net.connect(port, "127.0.0.1");
          s.once("connect", () => {
            s.destroy();
            r(true);
          });
          s.once("error", () => r(false));
        });
        if (connected) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      const [ca, cert, key] = await Promise.all([
        readFile(e.caFile),
        readFile(e.certFile),
        readFile(e.keyFile),
      ]);
      return await new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: "127.0.0.1",
            port,
            method,
            path,
            ca,
            cert,
            key,
            servername: e.serverName,
            rejectUnauthorized: true,
            timeout: 30000,
            headers: { "content-type": "application/json" },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
              if (data.length > 1024 * 1024)
                req.destroy(new Error("Worker response too large"));
            });
            res.on("end", () => {
              try {
                const parsed = JSON.parse(data || "{}");
                if ((res.statusCode ?? 500) >= 400)
                  reject(new Error("Worker request failed"));
                else resolve(parsed);
              } catch {
                reject(new Error("Invalid worker response"));
              }
            });
          },
        );
        req.on("error", reject);
        req.on("timeout", () =>
          req.destroy(new Error("Worker request timed out")),
        );
        req.end(body === undefined ? undefined : JSON.stringify(body));
      });
    } finally {
      child.kill();
    }
  }
}
