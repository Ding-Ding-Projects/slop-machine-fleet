import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Worker } from "@fleet/shared";
import type { WorkerTransport } from "./transport.js";
const uuid = z.string().uuid(),
  provider = z.enum(["codex", "github", "pairing"]),
  plain = z
    .string()
    .max(256)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const prompt = z
  .object({
    promptId: uuid,
    kind: z.enum(["github-credential-helper", "github-open-browser"]),
    title: plain,
    choices: z
      .array(z.object({ value: z.enum(["yes", "no"]), label: plain }).strict())
      .max(2),
    defaultChoice: z.literal("yes").nullable(),
    allowedActions: z
      .array(z.enum(["choose", "enter"]))
      .min(1)
      .max(2),
  })
  .strict()
  .superRefine((p, ctx) => {
    const helper = p.kind === "github-credential-helper";
    if (
      helper &&
      (p.choices.length !== 2 ||
        new Set(p.choices.map((c) => c.value)).size !== 2 ||
        p.defaultChoice !== "yes" ||
        p.allowedActions.length !== 2 ||
        !p.allowedActions.includes("choose") ||
        !p.allowedActions.includes("enter"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Unsupported helper prompt shape",
      });
    if (
      !helper &&
      (p.choices.length !== 0 ||
        p.defaultChoice !== null ||
        p.allowedActions.length !== 1 ||
        p.allowedActions[0] !== "enter")
    )
      ctx.addIssue({
        code: "custom",
        message: "Unsupported browser prompt shape",
      });
  });
export const structuredAuthState = z.object({
  state: z.enum([
    "unknown",
    "pending",
    "input-required",
    "code-issued",
    "verified",
    "error",
    "expired",
    "cancelled",
  ]),
  sessionId: uuid.nullable(),
  gitSetupState: z.enum([
    "unknown",
    "not-requested",
    "declined",
    "configured",
    "error",
  ]),
  prompt: prompt.nullable(),
  verificationUrl: z.string().url().max(2048).nullable().optional(),
  userCode: plain.max(128).nullable().optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  errorCode: z
    .string()
    .regex(/^[A-Z0-9_]{1,100}$/)
    .nullable()
    .optional(),
});
export const structuredAuthInput = z
  .object({
    sessionId: uuid,
    promptId: uuid,
    action: z.enum(["choose", "enter"]),
    choice: z.enum(["yes", "no"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "choose" && !value.choice)
      ctx.addIssue({
        code: "custom",
        message: "Choose requires a bounded choice",
      });
    if (value.action === "enter" && value.choice !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "Enter cannot carry raw or choice input",
      });
  });
function fail(statusCode: number, code: string, message: string) {
  return Object.assign(new Error(message), { statusCode, code });
}
export function validateAuthState(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !Object.hasOwn(value, "sessionId") ||
    !Object.hasOwn(value, "prompt") ||
    !Object.hasOwn(value, "gitSetupState")
  )
    throw fail(
      409,
      "WORKER_AUTH_PROTOCOL_UPDATE_REQUIRED",
      "Update this worker to the structured authentication protocol before continuing.",
    );
  const result = structuredAuthState.safeParse(value);
  if (!result.success)
    throw fail(
      502,
      "WORKER_AUTH_RESPONSE_INVALID",
      "Worker authentication response is invalid.",
    );
  if (result.data.verificationUrl) {
    const url = new URL(result.data.verificationUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw fail(
        502,
        "WORKER_AUTH_RESPONSE_INVALID",
        "Worker authentication response is invalid.",
      );
  }
  if (result.data.state !== "code-issued") {
    delete result.data.userCode;
    delete result.data.verificationUrl;
  }
  if (
    ["unknown", "verified", "error", "expired", "cancelled"].includes(
      result.data.state,
    )
  )
    result.data.prompt = null;
  return result.data;
}
export function registerAuthRelay(
  app: FastifyInstance,
  worker: (id: string) => Promise<Worker>,
  transport: WorkerTransport,
) {
  const current = async (id: string, name: string) => {
    provider.parse(name);
    const w = await worker(id);
    return {
      worker: w,
      state: validateAuthState(
        await transport.request(w, "GET", `/auth/${name}`),
      ),
    };
  };
  app.get<{ Params: { id: string; provider: string } }>(
    "/api/workers/:id/auth/:provider",
    async (req) => (await current(req.params.id, req.params.provider)).state,
  );
  app.post<{ Params: { id: string; provider: string } }>(
    "/api/workers/:id/auth/:provider/start",
    async (req) => {
      const value = await current(req.params.id, req.params.provider);
      return validateAuthState(
        await transport.request(
          value.worker,
          "POST",
          `/auth/${req.params.provider}/start`,
        ),
      );
    },
  );
  app.post<{ Params: { id: string; provider: string } }>(
    "/api/workers/:id/auth/:provider/input",
    async (req) => {
      const body = structuredAuthInput.parse(req.body),
        value = await current(req.params.id, req.params.provider);
      await transport.request(
        value.worker,
        "POST",
        `/auth/${req.params.provider}/input`,
        body,
      );
      return { accepted: true };
    },
  );
  app.delete<{
    Params: { id: string; provider: string };
    Querystring: { sessionId: string };
  }>("/api/workers/:id/auth/:provider", async (req) => {
    const query = z.object({ sessionId: uuid }).strict().parse(req.query),
      value = await current(req.params.id, req.params.provider);
    const cancelled = validateAuthState(
      await transport.request(
        value.worker,
        "DELETE",
        `/auth/${req.params.provider}?sessionId=${query.sessionId}`,
      ),
    );
    if (
      cancelled.sessionId !== query.sessionId ||
      cancelled.state !== "cancelled"
    )
      throw fail(
        409,
        "AUTH_SESSION_CHANGED",
        "Authentication session changed; refresh its current state.",
      );
    return cancelled;
  });
}
