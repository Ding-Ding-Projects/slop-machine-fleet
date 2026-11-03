# Fleet API

The controller exposes one authenticated, same-origin API used by the browser and desktop clients. See [the interface contract](../API.md) and [the Postman collection](fleet.postman_collection.json).

Use a trusted HTTPS controller origin. Loopback HTTP is supported for isolated local verification only. Establish the owner session using the supported first-run flow. Mutating authenticated requests require the current CSRF value and matching Origin. Never put real credentials into a shared or synchronized collection, example, source file or support log.

## Authentication and privacy

Session cookies are HTTP-only. Authentication-code responses and task-output pages are transient and no-store. Task output is read through the task-specific endpoint, not the general fleet event stream. Login, provider authentication and pairing are separate states.

The collection contains empty local variable placeholders and no real account configuration. Login tests capture only the current session's CSRF value in the selected local Postman environment. Do not export that populated environment.

## Operations

Creation requires an exact expiring cost review and an idempotency key. Bulk operations identify explicit worker IDs and return a durable per-target result. Tasks retain one active or uncertain dispatch per worker. Termination preserves workspace volumes by default.

The collection is a request aid, not proof of live provider operation. Live cloud acceptance remains separate from local HTTP tests.

## First owner and existing accounts

The first user signs up with username/password at `/api/auth/signup`; no host authorization code is required. A conditional PostgreSQL statement creates exactly one owner and initial session, while concurrent or later claims receive 409. Named accounts use username/password login. A pre-username owner remains in explicit legacy password-only mode until an authenticated, password-verified `PUT /api/auth/username` adoption. That action preserves its identity, password hash, scope and sessions. Signup/login need matching Origin; adoption additionally needs the current authenticated session and CSRF value.

The collection includes four empty-variable owner request templates. Keep all populated username/password variables local and unsynchronized, do not save credential-bearing requests or responses, and do not export the populated environment. The examples are not a request to claim an existing deployment and do not prove live account creation.
