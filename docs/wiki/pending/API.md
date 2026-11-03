# Fleet service interface

The service owns authentication, fleet state, durable operations and task dispatch. The browser and desktop use the same REST API and event stream, served from the same origin. All mutations require an authenticated session and CSRF protection. All responses use JSON except SSE and downloaded files. Errors use `{ error: { code, message } }`.

## Core routes

- `GET /api/health`: public readiness without configuration disclosure.
- `GET /api/auth/status`: authentication and initial setup availability.
- `POST /api/auth/setup`: create first owner, once, using host-provided setup authorization.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`.
- `GET /api/settings`, `PUT /api/settings`: validated nonsecret product configuration.
- `GET /api/cloud/discovery`: configured provider identity, regions, networks and instance capabilities; no credentials.
- `POST /api/cloud/reviews`: review exact worker count, region, type, subnet, storage and current pricing. Returns expiring review ID and immutable specification hash.
- `GET /api/workers`, `POST /api/workers`: list or launch workers. Launch requires review ID and exact reviewed specification.
- `GET /api/workers/:id`, `PATCH /api/workers/:id`.
- `POST /api/workers/:id/actions`: `{ action }` with start, stop, restart, repair, update, drain or terminate; termination preserves data unless a separate reviewed erase request exists.
- `POST /api/bulk`: explicit worker IDs, action and idempotency key. Returns durable operation ID and per-target state.
- `GET /api/operations`, `GET /api/operations/:id`.
- `POST /api/workers/:id/auth/:provider/start`, `GET /api/workers/:id/auth/:provider`, `POST /api/workers/:id/auth/:provider/input`, `DELETE /api/workers/:id/auth/:provider`: providers codex, github and pairing. Transient responses are no-store and excluded from audit history. Input uses `{ input }` and is bounded, never logged.
- `GET /api/tasks`, `POST /api/tasks`: worker ID, repository HTTPS URL, prompt and optional model. Persist FIFO ordering; one active task per worker.
- `GET /api/tasks/:id`, `POST /api/tasks/:id/cancel`, `POST /api/tasks/:id/input`, `POST /api/tasks/:id/approvals/:requestId`.
- `GET /api/events`: authenticated SSE with sequence IDs and replay for nonsensitive status events only.

## Worker protocol

Worker service binds loopback on port 8765. Controller reaches it only through an authenticated SSM port-forward session and verifies a per-worker client certificate. Bootstrap provisions certificates without placing private keys in user data or command output. All worker calls require mutual TLS.

- `GET /health`: identity, installed versions and nonsecret readiness.
- `POST /auth/:provider/start`, `GET /auth/:provider`, `POST /auth/:provider/input`, `DELETE /auth/:provider`.
- `POST /tasks`, `GET /tasks/:id`, `POST /tasks/:id/cancel`, `POST /tasks/:id/input`, `POST /tasks/:id/approvals/:requestId`.
- `GET /events`: authenticated streamed task and health updates. Auth codes never enter general events.
- `POST /drain`: reject new work, await active task completion.

Identifiers are UUIDs. Timestamps use UTC ISO 8601. Worker infrastructure, authentication, pairing and task states are independent. Never report code issuance as connection verification.
