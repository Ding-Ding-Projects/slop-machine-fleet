import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "./db.js";
import { currentOwnerScope } from "./owner-scope.js";
const username = z
  .string()
  .max(256)
  .transform((value) => value.normalize("NFKC").trim())
  .refine(
    (value) =>
      [...value].length >= 1 &&
      [...value].length <= 64 &&
      /^[\p{L}\p{N}][\p{L}\p{N}\p{M}._-]*$/u.test(value),
    "Use 1–64 letters, numbers, dots, underscores or hyphens; start with a letter or number.",
  );
export const signupSchema = z
  .object({ username, password: z.string().min(14).max(256) })
  .strict();
const loginSchema = z
  .object({ username: username.optional(), password: z.string().max(256) })
  .strict();
const adoptionSchema = z
  .object({ username, password: z.string().max(256) })
  .strict();
export const CLAIM_OWNER_SQL = `WITH claimed_owner AS (
 INSERT INTO fleet_state (id,value) VALUES ('owner',$1::jsonb)
 ON CONFLICT (id) DO NOTHING RETURNING id
), initial_session AS (
 INSERT INTO fleet_sessions (id,value)
 SELECT $2,$3::jsonb FROM claimed_owner RETURNING value
) SELECT value FROM initial_session`;
const hash = (value: string) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function same(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function fail(statusCode: number, code: string, message: string) {
  return Object.assign(new Error(message), { statusCode, code });
}
function account(owner: any) {
  return {
    username: typeof owner?.username === "string" ? owner.username : null,
    usernameRequired: typeof owner?.username !== "string",
  };
}
function verify(password: string, owner: any) {
  const digest = scryptSync(
    password,
    owner?.salt ?? "unconfigured",
    64,
  ).toString("hex");
  return Boolean(owner && same(digest, owner.digest));
}
function session(owner: any) {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    key: hash(raw),
    value: {
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: Date.now() + 8 * 3600000,
      ownerId: owner.id,
    },
  };
}
export function registerOwnerAuth(
  app: FastifyInstance,
  o: { store: Store; origin: string; secureCookies?: boolean },
) {
  const sendSession = async (
    reply: any,
    owner: any,
    created: ReturnType<typeof session>,
    persist = true,
  ) => {
    if (persist) await o.store.put("sessions", created.key, created.value);
    reply.setCookie("fleet_session", created.raw, {
      httpOnly: true,
      secure: o.secureCookies !== false,
      sameSite: "strict",
      path: "/",
      maxAge: 28800,
    });
    return {
      authenticated: true,
      csrfToken: created.value.csrfToken,
      scopeKey: await currentOwnerScope(o.store, o.origin),
      account: account(owner),
    };
  };
  app.get("/api/auth/status", async (req) => {
    const owner = await o.store.get("state", "owner"),
      s = req.cookies.fleet_session
        ? await o.store.get("sessions", hash(req.cookies.fleet_session))
        : undefined;
    const signupAvailable = !owner;
    return {
      authenticated: Boolean(
        s && s.expiresAt > Date.now() && owner?.id && s.ownerId === owner.id,
      ),
      signupAvailable,
      setupAvailable: signupAvailable,
      loginMode:
        owner && !owner.username ? "legacy-password" : "username-password",
    };
  });
  app.post(
    "/api/auth/signup",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = signupSchema.parse(req.body);
      if (await o.store.get("state", "owner"))
        throw fail(
          409,
          "OWNER_ALREADY_CLAIMED",
          "This controller already has an owner. Sign in instead.",
        );
      const salt = randomBytes(16).toString("hex"),
        owner = {
          id: randomUUID(),
          username: body.username,
          usernameKey: body.username.toLowerCase(),
          salt,
          digest: scryptSync(body.password, salt, 64).toString("hex"),
        },
        created = session(owner);
      const result = await o.store.db.query(CLAIM_OWNER_SQL, [
        JSON.stringify(owner),
        created.key,
        JSON.stringify(created.value),
      ]);
      if (result.rows.length !== 1)
        throw fail(
          409,
          "OWNER_ALREADY_CLAIMED",
          "This controller already has an owner. Sign in instead.",
        );
      return sendSession(reply, owner, created, false);
    },
  );
  app.post("/api/auth/setup", async () => {
    throw fail(
      410,
      "SETUP_REPLACED",
      "Use username and password signup on an unclaimed controller.",
    );
  });
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = loginSchema.parse(req.body),
        owner = await o.store.get("state", "owner"),
        valid = verify(body.password, owner);
      const usernameMatches = owner?.username
        ? Boolean(
            body.username &&
              same(
                body.username.toLowerCase(),
                owner.usernameKey ?? owner.username.toLowerCase(),
              ),
          )
        : body.username === undefined;
      if (!valid || !usernameMatches)
        throw fail(401, "INVALID_CREDENTIALS", "Credentials are invalid.");
      return sendSession(reply, owner, session(owner));
    },
  );
  app.get("/api/auth/session", async (req) => ({
    authenticated: true,
    csrfToken: (req as any).session.csrfToken,
    scopeKey: await currentOwnerScope(o.store, o.origin),
    account: account(await o.store.get("state", "owner")),
  }));
  app.put(
    "/api/auth/username",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const body = adoptionSchema.parse(req.body),
        owner = await o.store.get("state", "owner");
      if (
        !owner ||
        owner.id !== (req as any).session.ownerId ||
        !verify(body.password, owner)
      )
        throw fail(401, "INVALID_CREDENTIALS", "Credentials are invalid.");
      if (owner.username) {
        if (
          body.username.toLowerCase() ===
          (owner.usernameKey ?? owner.username.toLowerCase())
        )
          return { account: account(owner) };
        throw fail(
          409,
          "USERNAME_ALREADY_SET",
          "This owner already has a username.",
        );
      }
      const named = {
        ...owner,
        username: body.username,
        usernameKey: body.username.toLowerCase(),
      };
      const result = await o.store.db.query(
        "UPDATE fleet_state SET value=$1::jsonb WHERE id='owner' AND value=$2::jsonb RETURNING value",
        [JSON.stringify(named), JSON.stringify(owner)],
      );
      if (result.rows.length !== 1)
        throw fail(
          409,
          "OWNER_CHANGED",
          "Owner state changed. Refresh the current session before trying again.",
        );
      return { account: account(named) };
    },
  );
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies.fleet_session)
      await o.store.remove("sessions", hash(req.cookies.fleet_session));
    reply.clearCookie("fleet_session", { path: "/" });
    return { authenticated: false };
  });
}
