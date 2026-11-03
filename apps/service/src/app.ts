import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Worker, Task } from "@fleet/shared";
import { Store, migrate, type Database } from "./db.js";
import type { CloudProvider } from "./cloud.js";
import type { Provisioner } from "./provisioning.js";
import type { WorkerTransport } from "./transport.js";
const uuid = z.string().uuid(),
  time = () => new Date().toISOString(),
  hash = (v: unknown) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const specSchema = z
  .object({
    count: z.number().int().min(1).max(5),
    region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
    instanceType: z.enum(["m7i.large", "m7i.xlarge", "m7i.2xlarge"]),
    subnetId: z.string().regex(/^subnet-[a-f0-9]+$/),
    securityGroupId: z.string().regex(/^sg-[a-f0-9]+$/),
    instanceProfile: z.string().regex(/^[\w+=,.@-]{1,128}$/),
    bootGiB: z.number().int().min(40).max(2048),
    dataGiB: z.number().int().min(20).max(16384),
  })
  .strict();
const actionSchema = z.enum([
  "start",
  "stop",
  "restart",
  "repair",
  "update",
  "drain",
  "terminate",
]);
const defaults = {
  region: "us-east-1",
  maxWorkers: 5,
  theme: "system",
  language: "en",
  soundEnabled: true,
};
export interface ServiceOptions {
  db: Database;
  cloud: CloudProvider;
  transport: WorkerTransport;
  origin: string;
  setupCodeFile?: string;
  secureCookies?: boolean;
  provisioner?: Provisioner;
  featureManifestFile?: string;
}
export async function createService(o: ServiceOptions) {
  const app = Fastify({ logger: false, bodyLimit: 65536, trustProxy: false }),
    store = new Store(o.db);
  await migrate(o.db);
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  let serial = Promise.resolve();
  function lock<T>(f: () => Promise<T>) {
    const p = serial.then(f, f);
    serial = p.then(
      () => {},
      () => {},
    );
    return p;
  }
  const fail = (statusCode: number, code: string, message: string) =>
    Object.assign(new Error(message), { statusCode, code });
  app.setErrorHandler((e: any, _req, res) => {
    const status = e instanceof z.ZodError ? 400 : (e.statusCode ?? 500);
    res.code(status).send({
      error: {
        code:
          e instanceof z.ZodError
            ? "INVALID_INPUT"
            : status >= 500
              ? "SERVICE_UNAVAILABLE"
              : (e.code ?? "REQUEST_FAILED"),
        message:
          e instanceof z.ZodError
            ? "Request fields are invalid."
            : status >= 500
              ? "Operation unavailable. Check provider access and worker certificate enrollment."
              : e.message,
      },
    });
  });
  app.addHook("onRequest", async (req, res) => {
    res
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    if (!req.url.startsWith("/api/")) return;
    const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (write && req.headers.origin !== o.origin)
      throw fail(403, "ORIGIN_REQUIRED", "A matching origin is required.");
    if (
      [
        "/api/health",
        "/api/auth/status",
        "/api/auth/setup",
        "/api/auth/login",
      ].includes(req.url.split("?")[0])
    )
      return;
    const raw = req.cookies.fleet_session,
      s = raw ? await store.get("sessions", hash(raw)) : undefined;
    if (!s || s.expiresAt < Date.now())
      throw fail(401, "AUTH_REQUIRED", "Sign in to continue.");
    if (write && !same(String(req.headers["x-csrf-token"] ?? ""), s.csrfToken))
      throw fail(403, "CSRF_REQUIRED", "A valid CSRF token is required.");
    (req as any).session = s;
  });
  const signIn = async (res: any) => {
    const raw = randomBytes(32).toString("base64url"),
      s = {
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: Date.now() + 8 * 3600000,
      };
    await store.put("sessions", hash(raw), s);
    res.setCookie("fleet_session", raw, {
      httpOnly: true,
      secure: o.secureCookies !== false,
      sameSite: "strict",
      path: "/",
      maxAge: 28800,
    });
    return { authenticated: true, csrfToken: s.csrfToken };
  };
  app.get("/api/health", async () => {
    await o.db.query("SELECT 1");
    return { status: "ok" };
  });
  app.get("/api/auth/status", async (req) => {
    const s = req.cookies.fleet_session
      ? await store.get("sessions", hash(req.cookies.fleet_session))
      : undefined;
    return {
      authenticated: Boolean(s && s.expiresAt > Date.now()),
      setupAvailable:
        !(await store.get("state", "owner")) && Boolean(o.setupCodeFile),
    };
  });
  app.post(
    "/api/auth/setup",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, res) =>
      lock(async () => {
        if (await store.get("state", "owner"))
          throw fail(409, "ALREADY_CONFIGURED", "Owner setup is complete.");
        const b = z
          .object({
            setupCode: z.string().min(20).max(1024),
            password: z.string().min(14).max(256),
          })
          .strict()
          .parse(req.body);
        let expected = "";
        try {
          expected = (await readFile(o.setupCodeFile ?? "", "utf8")).trim();
        } catch {
          throw fail(
            503,
            "SETUP_UNAVAILABLE",
            "Mount the host setup authorization file.",
          );
        }
        if (!expected || !same(b.setupCode, expected))
          throw fail(
            403,
            "INVALID_SETUP_CODE",
            "Setup authorization is invalid.",
          );
        const salt = randomBytes(16).toString("hex");
        await store.put("state", "owner", {
          salt,
          digest: scryptSync(b.password, salt, 64).toString("hex"),
        });
        return signIn(res);
      }),
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, res) => {
      const b = z
          .object({ password: z.string().max(256) })
          .strict()
          .parse(req.body),
        owner = await store.get("state", "owner");
      const digest = scryptSync(
        b.password,
        owner?.salt ?? "unconfigured",
        64,
      ).toString("hex");
      if (!owner || !same(digest, owner.digest))
        throw fail(401, "INVALID_CREDENTIALS", "Credentials are invalid.");
      return signIn(res);
    },
  );
  app.get("/api/auth/session", async (req) => ({
    authenticated: true,
    csrfToken: (req as any).session.csrfToken,
  }));
  app.post("/api/auth/logout", async (req, res) => {
    if (req.cookies.fleet_session)
      await store.remove("sessions", hash(req.cookies.fleet_session));
    res.clearCookie("fleet_session", { path: "/" });
    return { authenticated: false };
  });
  app.get(
    "/api/settings",
    async () => (await store.get("state", "settings")) ?? defaults,
  );
  app.put("/api/settings", async (req) => {
    const v = z
      .object({
        region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
        maxWorkers: z.number().int().min(1).max(5),
        theme: z.enum(["system", "light", "dark"]),
        language: z.enum(["en", "yue", "bilingual"]),
        soundEnabled: z.boolean(),
      })
      .strict()
      .parse(req.body);
    await store.put("state", "settings", v);
    return v;
  });
  app.get("/api/cloud/discovery", async () =>
    o.cloud.discovery(
      ((await store.get("state", "settings")) ?? defaults).region,
    ),
  );
  app.post("/api/cloud/reviews", async (req) => {
    const spec = specSchema.parse(req.body),
      review = {
        id: randomUUID(),
        spec,
        specificationHash: hash(spec),
        providerAccount: await o.cloud.identity(spec.region),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        estimate: await o.cloud.estimate(spec),
      };
    await store.put("reviews", review.id, review);
    return review;
  });
  const worker = async (id: string) => {
    uuid.parse(id);
    const w = await store.get<Worker>("workers", id);
    if (!w) throw fail(404, "NOT_FOUND", "Worker was not found.");
    return w;
  };
  app.get("/api/workers", async () => ({
    workers: await store.all("workers"),
  }));
  app.get<{ Params: { id: string } }>("/api/workers/:id", async (req) =>
    worker(req.params.id),
  );
  app.patch<{ Params: { id: string } }>("/api/workers/:id", async (req) => {
    const b = z
        .object({ name: z.string().trim().min(1).max(80) })
        .strict()
        .parse(req.body),
      w = await worker(req.params.id);
    w.name = b.name;
    await store.put("workers", w.id, w);
    return w;
  });
  app.post("/api/workers", async (req) =>
    lock(async () => {
      const b = z
          .object({ reviewId: uuid, spec: specSchema, idempotencyKey: uuid })
          .strict()
          .parse(req.body),
        old = await store.get("operations", b.idempotencyKey);
      if (old) {
        if (old.specificationHash !== hash(b.spec))
          throw fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Key already used for another request.",
          );
        return old;
      }
      if (!o.provisioner)
        throw fail(
          503,
          "BOOTSTRAP_UNCONFIGURED",
          "Mount a verified worker release manifest and writable protected controller PKI volume before launching.",
        );
      const r = await store.get("reviews", b.reviewId);
      if (!r || r.expiresAt < time() || r.specificationHash !== hash(b.spec))
        throw fail(
          409,
          "REVIEW_REQUIRED",
          "A current exact specification review is required.",
        );
      if (r.providerAccount !== (await o.cloud.identity(b.spec.region)))
        throw fail(
          409,
          "PROVIDER_CHANGED",
          "Provider identity changed after review. Create a new review.",
        );
      if (
        !r.estimate.available ||
        !Number.isFinite(r.estimate.monthly) ||
        r.estimate.monthly <= 0
      )
        throw fail(
          409,
          "PRICING_UNAVAILABLE",
          "Known provider pricing is required.",
        );
      if (
        (await store.all<Worker>("workers")).filter(
          (w) => w.state !== "terminated",
        ).length +
          b.spec.count >
        Math.min(
          5,
          ((await store.get("state", "settings")) ?? defaults).maxWorkers,
        )
      )
        throw fail(
          409,
          "CAPACITY_LIMIT",
          "Fleet capacity is limited to five workers.",
        );
      const ids = Array.from({ length: b.spec.count }, () => randomUUID()),
        op: any = {
          id: b.idempotencyKey,
          action: "launch",
          specificationHash: hash(b.spec),
          state: "running",
          targets: ids.map((id) => ({ id, state: "launching" })),
          createdAt: time(),
        };
      await store.put("operations", op.id, op);
      for (const id of ids)
        await store.put("workers", id, {
          id,
          name: `Worker ${id.slice(0, 8)}`,
          region: b.spec.region,
          state: "launching",
          transport: "unenrolled",
          createdAt: time(),
        });
      try {
        for (let i = 0; i < ids.length; i++) {
          const instances = await o.cloud.launch(
            { ...b.spec, count: 1 },
            `${op.id}-${i}`,
            [ids[i]],
          );
          const w = await worker(ids[i]);
          w.instanceId = instances[0];
          w.state = o.provisioner ? "bootstrapping" : "enrollment-required";
          await store.put("workers", w.id, w);
          op.targets[i].state = w.state;
          await store.put("operations", op.id, op);
        }
        op.state = "incomplete";
      } catch {
        op.state = "incomplete";
        op.targets.forEach((t: any) => {
          if (t.state === "launching") t.state = "reconciliation-required";
          t.message =
            "Inspect provider resources by operation id before retrying.";
        });
      }
      await store.put("operations", op.id, op);
      await store.event("operation.updated", { id: op.id, state: op.state });
      return op;
    }),
  );
  async function action(w: Worker, a: any) {
    if (
      (await store.all<Task>("tasks")).some(
        (t) =>
          t.workerId === w.id && ["running", "dispatching"].includes(t.state),
      ) &&
      ["stop", "restart", "terminate"].includes(a)
    )
      throw fail(409, "ACTIVE_TASK", "Drain or cancel the active task first.");
    if (["repair", "update"].includes(a)) {
      if (!o.provisioner)
        throw fail(
          503,
          "BOOTSTRAP_UNCONFIGURED",
          "Mount a verified worker release manifest and protected PKI volume.",
        );
      if (
        (await store.all<Task>("tasks")).some(
          (t) =>
            t.workerId === w.id && ["running", "dispatching"].includes(t.state),
        )
      )
        throw fail(
          409,
          "ACTIVE_TASK",
          "Wait for the active task to finish before updating.",
        );
      if (await o.transport.ready(w))
        await o.transport.request(w, "POST", "/drain");
      await o.provisioner.reset(w, a);
      w.state = "bootstrapping";
      w.transport = "unenrolled";
    } else if (a === "drain") {
      await o.transport.request(w, "POST", "/drain");
      w.state = "draining";
    } else {
      await o.cloud.action(w, a);
      w.state = `${a}-requested`;
    }
    await store.put("workers", w.id, w);
    return w;
  }
  app.post<{ Params: { id: string } }>(
    "/api/workers/:id/actions",
    async (req) =>
      lock(async () =>
        action(
          await worker(req.params.id),
          z.object({ action: actionSchema }).strict().parse(req.body).action,
        ),
      ),
  );
  app.post("/api/bulk", async (req) =>
    lock(async () => {
      const b = z
          .object({
            workerIds: z.array(uuid).min(1).max(5),
            action: actionSchema,
            idempotencyKey: uuid,
          })
          .strict()
          .parse(req.body),
        old = await store.get("operations", b.idempotencyKey);
      if (old) {
        if (old.requestHash !== hash(b))
          throw fail(409, "IDEMPOTENCY_CONFLICT", "Key already used.");
        return old;
      }
      const op: any = {
        id: b.idempotencyKey,
        requestHash: hash(b),
        action: b.action,
        state: "running",
        targets: [...new Set(b.workerIds)].map((id) => ({
          id,
          state: "pending",
        })),
        createdAt: time(),
      };
      await store.put("operations", op.id, op);
      for (const t of op.targets) {
        try {
          await action(await worker(t.id), b.action);
          t.state = "requested";
        } catch {
          t.state = "failed";
          t.message = "Inspect worker state before retrying.";
        }
        await store.put("operations", op.id, op);
      }
      op.state = op.targets.some((t: any) => t.state === "failed")
        ? "incomplete"
        : "completed";
      await store.put("operations", op.id, op);
      return op;
    }),
  );
  app.get("/api/operations", async () => ({
    operations: await store.all("operations"),
  }));
  app.get<{ Params: { id: string } }>("/api/operations/:id", async (req) => {
    uuid.parse(req.params.id);
    const v = await store.get("operations", req.params.id);
    if (!v) throw fail(404, "NOT_FOUND", "Operation was not found.");
    return v;
  });
  for (const method of ["GET", "POST", "DELETE"] as const)
    app.route<{ Params: { id: string; provider: string } }>({
      method,
      url:
        "/api/workers/:id/auth/:provider" + (method === "POST" ? "/start" : ""),
      handler: async (req) => {
        z.enum(["codex", "github", "pairing"]).parse(req.params.provider);
        return o.transport.request(
          await worker(req.params.id),
          method,
          `/auth/${req.params.provider}${method === "POST" ? "/start" : ""}`,
        );
      },
    });
  app.post<{ Params: { id: string; provider: string } }>(
    "/api/workers/:id/auth/:provider/input",
    async (req) => {
      z.enum(["codex", "github", "pairing"]).parse(req.params.provider);
      return o.transport.request(
        await worker(req.params.id),
        "POST",
        `/auth/${req.params.provider}/input`,
        z
          .object({ input: z.string().min(1).max(8192) })
          .strict()
          .parse(req.body),
      );
    },
  );
  const task = async (id: string) => {
    uuid.parse(id);
    const t = await store.get<Task>("tasks", id);
    if (!t) throw fail(404, "NOT_FOUND", "Task was not found.");
    return t;
  };
  async function dispatch(id: string) {
    const tasks = (await store.all<Task>("tasks")).filter(
      (t) => t.workerId === id,
    );
    if (tasks.some((t) => ["running", "dispatching"].includes(t.state))) return;
    const t = tasks.find((t) => t.state === "queued");
    if (!t) return;
    const w = await worker(id);
    if (w.state !== "ready" || !(await o.transport.ready(w))) return;
    t.state = "dispatching";
    await store.put("tasks", t.id, t);
    try {
      await o.transport.request(w, "POST", "/tasks", {
        id: t.id,
        repositoryUrl: t.repository,
        prompt: t.prompt,
        model: t.model,
      });
      t.state = "running";
    } catch {
      t.result = {
        code: "DISPATCH_UNCERTAIN",
        message: "Reconcile worker task status before starting another task.",
      };
    }
    await store.put("tasks", t.id, t);
    await store.event("task.updated", { id: t.id, state: t.state });
  }
  app.get("/api/tasks", async () => ({
    tasks: await store.all<Task>("tasks"),
  }));
  app.post("/api/tasks", async (req) =>
    lock(async () => {
      const b = z
        .object({
          workerId: uuid,
          repository: z
            .string()
            .url()
            .max(2048)
            .refine((v) => {
              const u = new URL(v);
              return (
                u.protocol === "https:" &&
                !u.username &&
                !u.password &&
                !u.search &&
                !u.hash
              );
            }),
          prompt: z.string().trim().min(1).max(32000),
          model: z
            .string()
            .regex(/^[\w.-]{1,100}$/)
            .optional(),
        })
        .strict()
        .parse(req.body);
      const w = await worker(b.workerId);
      if (["draining", "terminated"].includes(w.state))
        throw fail(409, "WORKER_UNAVAILABLE", "Worker is not accepting tasks.");
      const t: Task = {
        ...b,
        id: randomUUID(),
        state: "queued",
        createdAt: time(),
      };
      await store.put("tasks", t.id, t);
      await dispatch(w.id);
      return task(t.id);
    }),
  );
  app.get<{ Params: { id: string } }>("/api/tasks/:id", async (req) => {
    const current = await task(req.params.id);
    if (["running", "dispatching"].includes(current.state)) {
      try {
        const value = await o.transport.request(
          await worker(current.workerId),
          "GET",
          `/tasks/${current.id}`,
        );
        const workerTask = z
          .object({
            id: uuid,
            state: z.string().max(80),
            threadId: z.string().max(256).nullable().optional(),
            turnId: z.string().max(256).nullable().optional(),
            errorCode: z.string().max(160).nullable().optional(),
            approvalRequestIds: z
              .array(z.string().max(128))
              .max(100)
              .optional(),
          })
          .parse(value);
        return { ...current, workerTask };
      } catch {
        return { ...current, workerDetailUnavailable: true };
      }
    }
    return current;
  });
  app.post<{ Params: { id: string } }>("/api/tasks/:id/cancel", async (req) =>
    lock(async () => {
      const t = await task(req.params.id);
      if (["running", "dispatching"].includes(t.state))
        await o.transport.request(
          await worker(t.workerId),
          "POST",
          `/tasks/${t.id}/cancel`,
        );
      if (t.state === "queued") {
        t.state = "cancelled";
        await store.put("tasks", t.id, t);
        await dispatch(t.workerId);
      } else if (["running", "dispatching"].includes(t.state)) {
        t.result = { cancellationRequested: true };
        await store.put("tasks", t.id, t);
      }
      return t;
    }),
  );
  app.post<{ Params: { id: string } }>("/api/tasks/:id/input", async (req) => {
    const t = await task(req.params.id);
    if (t.state !== "running")
      throw fail(409, "TASK_NOT_RUNNING", "Task is not running.");
    return o.transport.request(
      await worker(t.workerId),
      "POST",
      `/tasks/${t.id}/input`,
      z
        .object({ input: z.string().min(1).max(32000) })
        .strict()
        .parse(req.body),
    );
  });
  app.post<{ Params: { id: string; requestId: string } }>(
    "/api/tasks/:id/approvals/:requestId",
    async (req) => {
      const t = await task(req.params.id);
      if (t.state !== "running")
        throw fail(409, "TASK_NOT_RUNNING", "Task is not running.");
      const id = z
        .string()
        .regex(/^[\w.-]{1,128}$/)
        .parse(req.params.requestId);
      return o.transport.request(
        await worker(t.workerId),
        "POST",
        `/tasks/${t.id}/approvals/${id}`,
        z
          .object({ decision: z.enum(["accept", "decline"]) })
          .strict()
          .parse(req.body),
      );
    },
  );
  app.get("/api/events", async (req, res) => {
    const raw = String(req.headers["last-event-id"] ?? "0");
    if (!/^\d{1,10}$/.test(raw))
      throw fail(400, "INVALID_SEQUENCE", "Event sequence is invalid.");
    let cursor = Number(raw),
      busy = false;
    res.hijack();
    res.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    const send = async () => {
      if (busy) return;
      busy = true;
      try {
        const current = req.cookies.fleet_session
          ? await store.get("sessions", hash(req.cookies.fleet_session))
          : undefined;
        if (!current || current.expiresAt < Date.now()) {
          res.raw.end();
          return;
        }
        const rows = (
          await o.db.query(
            "SELECT sequence,value FROM fleet_events WHERE sequence>$1 ORDER BY sequence LIMIT 100",
            [cursor],
          )
        ).rows;
        for (const r of rows) {
          res.raw.write(
            `id: ${r.sequence}\ndata: ${JSON.stringify({ ...r.value, sequence: r.sequence })}\n\n`,
          );
          cursor = r.sequence;
        }
        res.raw.write(": heartbeat\n\n");
      } finally {
        busy = false;
      }
    };
    await send();
    const timer = setInterval(() => {
      void send().catch(() => res.raw.end());
    }, 2000);
    req.raw.on("close", () => clearInterval(timer));
  });
  // Run exactly one controller process per database. Uncertain in-flight tasks remain active after a restart and are reconciled with the worker.
  const timer = setInterval(() => {
    void lock(async () => {
      for (const t of await store.all<Task>("tasks"))
        if (["running", "dispatching"].includes(t.state)) {
          try {
            const s = await o.transport.request(
              await worker(t.workerId),
              "GET",
              `/tasks/${t.id}`,
            );
            if (["completed", "failed", "cancelled"].includes(s.state)) {
              t.state = s.state;
              t.result = { state: s.state, errorCode: s.errorCode };
              await store.put("tasks", t.id, t);
              await store.event("task.updated", { id: t.id, state: t.state });
            }
          } catch {
            /* A transport interruption is not a terminal task result. */
          }
        }
      for (const w of await store.all<Worker>("workers")) {
        if (
          [
            "start-requested",
            "stop-requested",
            "restart-requested",
            "terminate-requested",
          ].includes(w.state)
        ) {
          try {
            const observed = await o.cloud.observe(w);
            if (observed === "terminated") w.state = "terminated";
            else if (observed === "stopped") w.state = "stopped";
            else if (
              observed === "running" &&
              w.state !== "stop-requested" &&
              w.state !== "terminate-requested"
            ) {
              const health = await o.transport.request(w, "GET", "/health");
              if (health.workerId === w.id && health.ready === true)
                w.state = "ready";
            }
            await store.put("workers", w.id, w);
          } catch {
            /* Provider acceptance is not terminal-state proof. */
          }
        }

        if (
          o.provisioner &&
          ["bootstrapping", "enrollment-required"].includes(w.state)
        ) {
          try {
            const updated = await o.provisioner.reconcile(w);
            await store.put("workers", w.id, updated);
          } catch {
            /* Retry only bounded durable bootstrap phases. */
          }
        }
        await dispatch(w.id);
      }
      for (const operation of await store.all<any>("operations")) {
        if (operation.action !== "launch" || operation.state === "completed")
          continue;
        for (const target of operation.targets) {
          const current = await store.get<Worker>("workers", target.id);
          if (current) target.state = current.state;
        }
        if (operation.targets.every((target: any) => target.state === "ready"))
          operation.state = "completed";
        await store.put("operations", operation.id, operation);
      }
    }).catch(() => {});
  }, 5000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
  return app;
}
