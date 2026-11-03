import { randomUUID } from "node:crypto";
import type { Worker, WorkerAction } from "@fleet/shared";
import type { Store } from "./db.js";
export interface ActionAttemptContext {
  operationId: string;
  attemptId: string;
}
interface Attempt {
  id: string;
  startedAt: string;
  phase: "dispatching" | "acknowledged" | "uncertain";
  acknowledgedAt?: string;
}
interface Target {
  id: string;
  state: string;
  dispatchState: "never-dispatched" | "acknowledged" | "uncertain";
  attempt: Attempt | null;
  workerIdentity?: { instanceId: string | null; region: string };
  message?: string;
  blockedAt?: string;
  observation?: { source: string; state: string; observedAt: string };
  legacyState?: string;
}
interface BulkRecord {
  id: string;
  kind: "bulk";
  durabilityVersion: 1;
  ownerId: string | null;
  requestHash: string;
  action: WorkerAction;
  state: string;
  targets: Target[];
  createdAt: string;
  legacy?: boolean;
}
interface Options {
  store: Store;
  worker: (id: string) => Promise<Worker>;
  preflight: (
    worker: Worker,
    action: WorkerAction,
    context?: ActionAttemptContext,
  ) => Promise<void>;
  dispatch: (
    worker: Worker,
    action: WorkerAction,
    context: ActionAttemptContext,
  ) => Promise<Worker>;
  observe: (worker: Worker) => Promise<string>;
  health: (worker: Worker) => Promise<any>;
}
const now = () => new Date().toISOString();
function fail(code: string, message: string) {
  return Object.assign(new Error(message), { statusCode: 409, code });
}
const accepted = new Set([
  "start",
  "stop",
  "restart",
  "repair",
  "update",
  "drain",
  "terminate",
]);
export class BulkOperations {
  constructor(private o: Options) {}
  private async save(op: BulkRecord) {
    op.state = op.targets.every((target) => target.state === "completed")
      ? "completed"
      : "incomplete";
    await this.o.store.put("operations", op.id, op);
  }
  async assertWorkerAvailable(id: string, exceptOperationId?: string) {
    for (const op of await this.o.store.all<any>("operations")) {
      if (op.id === exceptOperationId || op.action === "launch") continue;
      const target = op.targets?.find((item: any) => item.id === id);
      if (target && !["completed"].includes(target.state))
        throw fail(
          "WORKER_OPERATION_PENDING",
          "Resolve or explicitly resume the existing worker operation before another action.",
        );
    }
  }
  async create(
    body: { workerIds: string[]; action: WorkerAction; idempotencyKey: string },
    requestHash: string,
    ownerId: string,
  ) {
    const old = await this.o.store.get<any>("operations", body.idempotencyKey);
    if (old) {
      if (old.requestHash !== requestHash)
        throw fail("IDEMPOTENCY_CONFLICT", "Key already used.");
      if (old.ownerId && old.ownerId !== ownerId)
        throw fail(
          "OPERATION_OWNER_CHANGED",
          "Operation belongs to another owner identity.",
        );
      return old;
    }
    for (const id of new Set(body.workerIds))
      await this.assertWorkerAvailable(id);
    const op: BulkRecord = {
      id: body.idempotencyKey,
      kind: "bulk",
      durabilityVersion: 1,
      ownerId,
      requestHash,
      action: body.action,
      state: "running",
      targets: [...new Set(body.workerIds)].map((id) => ({
        id,
        state: "pending",
        dispatchState: "never-dispatched",
        attempt: null,
      })),
      createdAt: now(),
    };
    await this.o.store.put("operations", op.id, op);
    await this.execute(
      op,
      op.targets.map((target) => target.id),
    );
    return op;
  }
  private async execute(op: BulkRecord, ids: string[]) {
    for (const id of ids) {
      const target = op.targets.find((item) => item.id === id)!;
      let worker: Worker;
      try {
        worker = await this.o.worker(id);
        await this.o.preflight(worker, op.action, {
          operationId: op.id,
          attemptId: "",
        });
      } catch {
        target.state = "blocked";
        target.dispatchState = "never-dispatched";
        target.blockedAt = now();
        target.message =
          "Pre-dispatch checks did not permit this action. No action was sent; explicit scoped resume must recheck current worker and task state.";
        await this.save(op);
        continue;
      }
      const attempt: Attempt = {
        id: randomUUID(),
        startedAt: now(),
        phase: "dispatching",
      };
      target.attempt = attempt;
      target.dispatchState = "uncertain";
      target.state = "dispatching";
      target.workerIdentity = {
        instanceId: worker.instanceId ?? null,
        region: worker.region,
      };
      await this.o.store.put("operations", op.id, { ...op, state: "running" });
      // This durable marker must exist before any provider or worker mutation. A lost acknowledgement is not proof that dispatch did not happen.
      try {
        await this.o.dispatch(worker, op.action, {
          operationId: op.id,
          attemptId: attempt.id,
        });
        attempt.phase = "acknowledged";
        attempt.acknowledgedAt = now();
        target.dispatchState = "acknowledged";
        target.state = "requested";
        delete target.message;
      } catch {
        attempt.phase = "uncertain";
        target.dispatchState = "uncertain";
        target.state = "reconciliation-required";
        target.message =
          "Dispatch outcome is uncertain. Inspect real provider or worker evidence; do not replay this target.";
      }
      await this.save(op);
    }
    await this.save(op);
  }
  async resume(
    id: string,
    ids: string[],
    requestHash: string,
    ownerId: string,
  ) {
    const op = await this.o.store.get<BulkRecord>("operations", id);
    if (!op || op.kind !== "bulk" || op.durabilityVersion !== 1 || op.legacy)
      throw fail(
        "OPERATION_NOT_RESUMABLE",
        "Operation has no resumable dispatch ledger.",
      );
    if (op.ownerId !== ownerId)
      throw fail(
        "OPERATION_OWNER_CHANGED",
        "Operation belongs to another owner identity.",
      );
    if (op.requestHash !== requestHash)
      throw fail(
        "IDEMPOTENCY_CONFLICT",
        "Original operation hash does not match.",
      );
    if (!ids.length || new Set(ids).size !== ids.length)
      throw fail(
        "INVALID_RESUME_TARGETS",
        "Select unique original worker identities.",
      );
    for (const workerId of ids) {
      const target = op.targets.find((item) => item.id === workerId);
      if (
        !target ||
        !["pending", "blocked"].includes(target.state) ||
        target.dispatchState !== "never-dispatched" ||
        target.attempt !== null
      )
        throw fail(
          "TARGET_NOT_RESUMABLE",
          "Only original targets proven never dispatched can be resumed. Requested, completed or uncertain targets cannot be replayed.",
        );
    }
    await this.execute(op, ids);
    return op;
  }
  async reconcileAll(startup = false) {
    for (const saved of await this.o.store.all<any>("operations")) {
      if (
        saved.action === "launch" ||
        !accepted.has(saved.action) ||
        !Array.isArray(saved.targets)
      )
        continue;
      let op: BulkRecord = saved;
      if (op.kind !== "bulk" || op.durabilityVersion !== 1) {
        op = {
          ...saved,
          kind: "bulk",
          durabilityVersion: 1,
          ownerId: null,
          legacy: true,
          targets: saved.targets.map((target: any) => ({
            ...target,
            legacyState: target.state,
            state: ["requested", "completed"].includes(target.state)
              ? target.state
              : "reconciliation-required",
            dispatchState: ["requested", "completed"].includes(target.state)
              ? "acknowledged"
              : "uncertain",
            attempt: null,
          })),
        };
        await this.save(op);
      }
      for (const target of op.targets) {
        if (["completed", "pending", "blocked"].includes(target.state))
          continue;
        if (op.action === "restart" && target.observation && !startup) continue;
        await this.reconcileTarget(op, target);
      }
      await this.save(op);
    }
  }
  private async reconcileTarget(op: BulkRecord, target: Target) {
    if (target.state === "dispatching") {
      target.state = "reconciliation-required";
      target.dispatchState = "uncertain";
      if (target.attempt) target.attempt.phase = "uncertain";
    }
    try {
      const worker = await this.o.worker(target.id);
      if (
        target.workerIdentity &&
        (target.workerIdentity.instanceId !== (worker.instanceId ?? null) ||
          target.workerIdentity.region !== worker.region)
      )
        throw new Error("Worker identity changed");
      let complete = false,
        state = "unknown",
        source = "provider-observation";
      if (["start", "stop", "terminate", "restart"].includes(op.action)) {
        state = await this.o.observe(worker);
        complete =
          (op.action === "stop" && state === "stopped") ||
          (op.action === "terminate" && state === "terminated");
        if (op.action === "start" && state === "running") {
          const health = await this.o.health(worker);
          complete = health.workerId === worker.id && health.ready === true;
          source = "provider-and-worker-observation";
        }
      } else if (op.action === "drain") {
        const health = await this.o.health(worker);
        state = health.state ?? "unknown";
        source = "worker-observation";
        complete =
          health.workerId === worker.id &&
          health.ready === false &&
          state === "draining";
      } else {
        const bootstrap = await this.o.store.get<any>(
          "state",
          `bootstrap:${worker.id}`,
        );
        source = "bootstrap-attempt-and-worker-observation";
        state = bootstrap?.phase ?? "unknown";
        if (
          target.attempt &&
          bootstrap?.operationId === op.id &&
          bootstrap.attemptId === target.attempt.id
        ) {
          target.dispatchState = "acknowledged";
          target.attempt.phase = "acknowledged";
          target.attempt.acknowledgedAt ??= now();
          if (state === "health") {
            const health = await this.o.health(worker);
            complete =
              health.workerId === worker.id &&
              health.ready === true &&
              health.version === bootstrap.version;
          }
          if (!complete && state !== "failed") {
            worker.state = "bootstrapping";
            worker.transport = "unenrolled";
            await this.o.store.put("workers", worker.id, worker);
            target.state = "requested";
          }
        }
      }
      target.observation = { source, state, observedAt: now() };
      if (complete) {
        target.state = "completed";
        delete target.message;
        if (op.action === "stop") worker.state = "stopped";
        else if (op.action === "terminate") worker.state = "terminated";
        else if (op.action === "drain") worker.state = "draining";
        else {
          worker.state = "ready";
          worker.transport = "ready";
        }
        await this.o.store.put("workers", worker.id, worker);
      } else if (target.dispatchState === "acknowledged") {
        target.state = "requested";
        target.message =
          op.action === "restart"
            ? "Restart submission is acknowledged; current running or ready state does not prove a restart completed. No replay is permitted."
            : "Submission acknowledged; terminal evidence is still pending.";
      } else {
        target.state = "reconciliation-required";
        target.message =
          "Dispatch is ambiguous and observed state does not prove completion. No replay is permitted.";
      }
    } catch {
      target.state =
        target.dispatchState === "acknowledged"
          ? "requested"
          : "reconciliation-required";
      target.message =
        "Real provider or worker evidence is unavailable or does not match this attempt. No replay is permitted.";
    }
  }
}
