import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, scryptSync, createHash } from "node:crypto";
import { Pool } from "pg";
import { createService } from "../src/app.js";
import { migrate, Store } from "../src/db.js";
import { initializeOwnerIdentity } from "../src/owner-scope.js";
const configFile = process.env.FLEET_TEST_PG_FILE;
test(
  "real PostgreSQL first-owner signup, migration and rollback",
  { skip: !configFile },
  async (t) => {
    const config = JSON.parse(await readFile(configFile!, "utf8"));
    if (
      config.purpose !== "fleet-first-signup-isolated-fixture" ||
      new URL(config.url).hostname !== "127.0.0.1"
    )
      throw new Error("Refusing an unowned PostgreSQL fixture");
    const root = new Pool({ connectionString: config.url });
    try {
      assert.ok(
        (
          await root.query(
            "SELECT current_setting('fleet.test.owner',true) AS marker",
          )
        ).rows[0].marker === config.ownerId,
      );
      async function fixture() {
        const schema = "fleet_signup_" + randomUUID().replaceAll("-", "");
        await root.query(`CREATE SCHEMA "${schema}"`);
        const a = new Pool({
            connectionString: config.url,
            options: `-c search_path=${schema}`,
          }),
          b = new Pool({
            connectionString: config.url,
            options: `-c search_path=${schema}`,
          });
        await migrate(a);
        const apps = await Promise.all(
          [a, b].map((db) =>
            createService({
              db,
              origin: "https://fleet.test",
              cloud: {} as any,
              transport: {} as any,
            }),
          ),
        );
        await Promise.all(apps.map((app) => app.ready()));
        const signup = (
          index: number,
          username = "Owner",
          password = "test-only-owner-password",
        ) =>
          apps[index].inject({
            method: "POST",
            url: "/api/auth/signup",
            headers: { origin: "https://fleet.test" },
            payload: { username, password },
          });
        return {
          a,
          b,
          apps,
          signup,
          close: async () => {
            await Promise.all(apps.map((app) => app.close()));
            await a.end();
            await b.end();
            await root.query(`DROP SCHEMA "${schema}" CASCADE`);
          },
        };
      }
      await t.test(
        "two independent services atomically accept exactly one owner and one initial session",
        async () => {
          const f = await fixture();
          try {
            const names = ["Ａlice", "Bob"],
              passwords = [
                "test-only-owner-password-a",
                "test-only-owner-password-b",
              ];
            const results = await Promise.all([
              f.signup(0, names[0], passwords[0]),
              f.signup(1, names[1], passwords[1]),
            ]);
            assert.deepEqual(
              results.map((r) => r.statusCode).sort(),
              [200, 409],
            );
            const winner = results.findIndex((r) => r.statusCode === 200),
              created = results[winner],
              loser = results[1 - winner];
            assert.equal(
              created.json().account.username,
              names[winner].normalize("NFKC"),
            );
            assert.ok(created.cookies[0].httpOnly && created.cookies[0].secure);
            assert.equal(loser.cookies.length, 0);
            assert.equal(loser.json().error.code, "OWNER_ALREADY_CLAIMED");
            assert.equal(
              Number(
                (
                  await f.a.query(
                    "SELECT count(*) FROM fleet_state WHERE id='owner'",
                  )
                ).rows[0].count,
              ),
              1,
            );
            assert.equal(
              Number(
                (await f.a.query("SELECT count(*) FROM fleet_sessions")).rows[0]
                  .count,
              ),
              1,
            );
            const status = await f.apps[0].inject({ url: "/api/auth/status" });
            assert.equal(status.json().signupAvailable, false);
            assert.equal(status.json().loginMode, "username-password");
            assert.equal(Object.hasOwn(status.json(), "username"), false);
            const login = (username: string, password: string) =>
              f.apps[0].inject({
                method: "POST",
                url: "/api/auth/login",
                headers: { origin: "https://fleet.test" },
                payload: { username, password },
              });
            const wrongName = await login("not-the-owner", passwords[winner]),
              wrongPassword = await login(
                names[winner],
                "test-only-wrong-password",
              );
            assert.equal(wrongName.statusCode, 401);
            assert.equal(wrongPassword.statusCode, 401);
            assert.equal(wrongName.body, wrongPassword.body);
            const valid = await login(
              names[winner].toLowerCase(),
              passwords[winner],
            );
            assert.equal(valid.statusCode, 200);
            assert.equal(valid.json().scopeKey, created.json().scopeKey);
            assert.equal(
              (
                await f.apps[1].inject({
                  method: "POST",
                  url: "/api/auth/login",
                  headers: { origin: "https://fleet.test" },
                  payload: { password: passwords[winner] },
                })
              ).statusCode,
              401,
            );
          } finally {
            await f.close();
          }
        },
      );
      await t.test(
        "an initial session failure rolls back the owner claim and emits no cookie",
        async () => {
          const f = await fixture();
          try {
            await f.a.query(
              "CREATE FUNCTION fail_fixture_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture session failure'; END $$",
            );
            await f.a.query(
              "CREATE TRIGGER fixture_fail_session BEFORE INSERT ON fleet_sessions FOR EACH ROW EXECUTE FUNCTION fail_fixture_session()",
            );
            const failed = await f.signup(0);
            assert.equal(failed.statusCode, 500);
            assert.equal(failed.cookies.length, 0);
            assert.equal(
              Number(
                (
                  await f.a.query(
                    "SELECT count(*) FROM fleet_state WHERE id='owner'",
                  )
                ).rows[0].count,
              ),
              0,
            );
            assert.equal(
              Number(
                (await f.a.query("SELECT count(*) FROM fleet_sessions")).rows[0]
                  .count,
              ),
              0,
            );
            await f.a.query(
              "DROP TRIGGER fixture_fail_session ON fleet_sessions",
            );
            assert.equal((await f.signup(1)).statusCode, 200);
          } finally {
            await f.close();
          }
        },
      );
      await t.test(
        "legacy password login and one-time username adoption preserve credentials, identity, sessions and scope",
        async () => {
          const f = await fixture();
          try {
            const id = randomUUID(),
              salt = "test-only-legacy-salt",
              password = "test-only-legacy-password",
              owner = {
                id,
                salt,
                digest: scryptSync(password, salt, 64).toString("hex"),
              };
            await f.a.query(
              "INSERT INTO fleet_state(id,value) VALUES('owner',$1::jsonb)",
              [JSON.stringify(owner)],
            );
            const raw = "test-only-existing-cookie",
              key = createHash("sha256")
                .update(JSON.stringify(raw))
                .digest("hex"),
              session = {
                ownerId: id,
                csrfToken: "test-only-csrf",
                expiresAt: Date.now() + 60000,
              };
            await f.a.query(
              "INSERT INTO fleet_sessions(id,value) VALUES($1,$2::jsonb)",
              [key, JSON.stringify(session)],
            );
            const headers = {
              cookie: `fleet_session=${raw}`,
              origin: "https://fleet.test",
              "x-csrf-token": "test-only-csrf",
            };
            assert.equal(
              (await f.apps[0].inject({ url: "/api/auth/status" })).json()
                .loginMode,
              "legacy-password",
            );
            const before = await f.apps[0].inject({
              url: "/api/auth/session",
              headers,
            });
            assert.equal(before.json().account.usernameRequired, true);
            assert.equal(
              (
                await f.apps[1].inject({
                  method: "POST",
                  url: "/api/auth/login",
                  headers: { origin: "https://fleet.test" },
                  payload: { password },
                })
              ).statusCode,
              200,
            );
            assert.equal(
              (
                await f.apps[0].inject({
                  method: "PUT",
                  url: "/api/auth/username",
                  headers,
                  payload: {
                    username: "LegacyOwner",
                    password: "wrong-test-password",
                  },
                })
              ).statusCode,
              401,
            );
            assert.equal(
              (
                await f.apps[0].inject({
                  method: "PUT",
                  url: "/api/auth/username",
                  headers,
                  payload: { username: " LegacyOwner ", password },
                })
              ).statusCode,
              200,
            );
            const stored = (
              await f.a.query("SELECT value FROM fleet_state WHERE id='owner'")
            ).rows[0].value;
            assert.ok(
              stored.id === id &&
                stored.salt === salt &&
                stored.digest === owner.digest,
            );
            assert.deepEqual(
              (
                await f.a.query(
                  "SELECT value FROM fleet_sessions WHERE id=$1",
                  [key],
                )
              ).rows[0].value,
              session,
            );
            const after = await f.apps[1].inject({
              url: "/api/auth/session",
              headers,
            });
            assert.equal(after.json().scopeKey, before.json().scopeKey);
            assert.equal(after.json().csrfToken, before.json().csrfToken);
            assert.equal(
              (
                await f.apps[1].inject({
                  method: "POST",
                  url: "/api/auth/login",
                  headers: { origin: "https://fleet.test" },
                  payload: { username: "legacyowner", password },
                })
              ).statusCode,
              200,
            );
            assert.equal(
              (
                await f.apps[1].inject({
                  method: "POST",
                  url: "/api/auth/login",
                  headers: { origin: "https://fleet.test" },
                  payload: { password },
                })
              ).statusCode,
              401,
            );
            assert.equal(
              (
                await f.apps[0].inject({
                  method: "PUT",
                  url: "/api/auth/username",
                  headers,
                  payload: { username: "another-name", password },
                })
              ).statusCode,
              409,
            );
          } finally {
            await f.close();
          }
        },
      );
      await t.test(
        "signup input, origin and claimed-state responses expose no setup code requirement",
        async () => {
          const f = await fixture();
          try {
            const status = await f.apps[0].inject({ url: "/api/auth/status" });
            assert.equal(status.json().signupAvailable, true);
            assert.equal(status.json().setupAvailable, true);
            assert.equal(status.headers["cache-control"], "no-store");
            assert.equal(
              (
                await f.apps[0].inject({
                  method: "POST",
                  url: "/api/auth/signup",
                  payload: {
                    username: "Owner",
                    password: "test-only-owner-password",
                  },
                })
              ).statusCode,
              403,
            );
            assert.equal((await f.signup(0, "---")).statusCode, 400);
            assert.equal(
              (
                await f.apps[0].inject({
                  method: "POST",
                  url: "/api/auth/setup",
                  headers: { origin: "https://fleet.test" },
                  payload: {},
                })
              ).statusCode,
              410,
            );
            assert.equal((await f.signup(1, "陳先生")).statusCode, 200);
          } finally {
            await f.close();
          }
        },
      );
      await t.test(
        "concurrent legacy identity initialization preserves stable identities",
        async () => {
          const f = await fixture();
          try {
            const salt = "test-only-legacy-init-salt",
              digest = scryptSync(
                "test-only-legacy-init-password",
                salt,
                64,
              ).toString("hex");
            await f.a.query(
              "INSERT INTO fleet_state(id,value) VALUES('owner',$1::jsonb)",
              [JSON.stringify({ salt, digest })],
            );
            await Promise.all([
              initializeOwnerIdentity(new Store(f.a)),
              initializeOwnerIdentity(new Store(f.b)),
            ]);
            const owner = (
              await f.a.query("SELECT value FROM fleet_state WHERE id='owner'")
            ).rows[0].value;
            assert.ok(
              typeof owner.id === "string" &&
                owner.salt === salt &&
                owner.digest === digest,
            );
            await initializeOwnerIdentity(new Store(f.b));
            assert.ok(
              (
                await f.b.query(
                  "SELECT value FROM fleet_state WHERE id='owner'",
                )
              ).rows[0].value.id === owner.id,
            );
            assert.equal(
              Number(
                (
                  await f.a.query(
                    "SELECT count(*) FROM fleet_state WHERE id='controller-identity'",
                  )
                ).rows[0].count,
              ),
              1,
            );
          } finally {
            await f.close();
          }
        },
      );
      await t.test(
        "password bytes remain unchanged and username adoption requires CSRF",
        async () => {
          const f = await fixture();
          try {
            const password = "  test-only-spaced-password  ",
              username = "नमस्ते";
            const created = await f.signup(0, username, password);
            assert.equal(created.statusCode, 200);
            const login = (value: string) =>
              f.apps[1].inject({
                method: "POST",
                url: "/api/auth/login",
                headers: { origin: "https://fleet.test" },
                payload: { username, password: value },
              });
            assert.equal((await login(password)).statusCode, 200);
            assert.equal((await login(password.trim())).statusCode, 401);
            const cookie =
              created.cookies[0].name + "=" + created.cookies[0].value;
            assert.equal(
              (
                await f.apps[0].inject({
                  method: "PUT",
                  url: "/api/auth/username",
                  headers: { origin: "https://fleet.test", cookie },
                  payload: { username: "another-name", password },
                })
              ).statusCode,
              403,
            );
          } finally {
            await f.close();
          }
        },
      );
    } finally {
      await root.end();
    }
  },
);
