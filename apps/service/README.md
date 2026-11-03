# Fleet service

This Node 22 service is the single controller for its PostgreSQL database. Startup obtains a database advisory lock; a second controller exits rather than racing fleet capacity or task dispatch. The database schema is created automatically. Keep PostgreSQL on a protected private network and back up its persistent volume.

## Configuration

- `DATABASE_URL_FILE`: mounted file containing the PostgreSQL connection URL. `DATABASE_URL` is an alternative for existing protected deployment environments.
- `PUBLIC_ORIGIN`: exact browser origin, including scheme and port. Non-loopback hosting requires HTTPS. Mutations require this Origin and the session CSRF token.
- `SETUP_CODE_FILE`: read-only mounted file containing a high-entropy first-owner authorization code. Initial setup also requires a password of at least 14 characters. Owner existence in PostgreSQL consumes setup authorization permanently; the mounted file is never modified.
- `WORKER_RELEASE_FILE`: protected mounted nonsecret JSON `{ version, assetUrl, assetSha256, bootstrapUrl, bootstrapSha256 }`, binding the public worker executable and bootstrap script to exact SHA-256 digests. Launch is blocked before provider spend when this file or the protected PKI directory is absent.
- `CONTROLLER_PKI_DIR`: writable private persistent directory for the local certificate authority, controller client keys and enrollment manifest. Preserve this volume across updates.
- `WORKER_ENROLLMENT_FILE`: protected mounted JSON mapping worker UUIDs to `{ instanceId, region, caFile, certFile, keyFile, serverName }`. Referenced certificate files must be mounted privately. Client private keys never enter user data or logs.
- `HOST`, `PORT`: bind address and port, defaulting to loopback and 3000.
- `WEB_ROOT`: optional absolute directory for built browser assets and SPA navigation.

AWS SDK clients use the standard credential provider chain, including an assigned instance role or a mounted shared profile. Never put credentials in browser settings or source. The host also needs the supported AWS CLI and Session Manager plugin for worker transport. No request logging is enabled. Authentication endpoints and all API responses use `Cache-Control: no-store`.

## Workflow and limitations

Read the routes in `docs/API.md` at the repository root and the exported types in `@fleet/shared`. Login or setup returns `csrfToken`; subsequent mutations send `x-csrf-token` and the exact configured Origin. Cookies are HTTP-only, same-site strict and secure for HTTPS deployments. Sessions expire after eight hours.

Discovery reads real account identity, enabled regions, subnets and supported instance metadata. Cost reviews resolve unique current AWS Price List compute and gp3 storage rates. Unavailable or ambiguous pricing blocks launch. Estimates explicitly exclude taxes, transfers, snapshots, public IPv4 and ancillary service usage. Reviews expire after five minutes and bind an immutable normalized launch specification. Capacity never exceeds five recorded nonterminated workers. Launch idempotency keys cannot be reused with another specification.

Instances use the official regional Windows Server 2025 public image parameter, encrypted gp3 root and retained data volumes, IMDSv2 and ownership tags. Each successful instance identifier is persisted before launching another worker. A partial or uncertain launch stays incomplete and reserves capacity; inspect EC2 resources using the operation and worker tags before reconciliation. Do not blindly retry with another key.

The controller automatically provisions workers through bounded SSM commands after the managed instance reports online. It downloads the reviewed public bootstrap script, verifies its SHA-256 digest, and passes the pinned worker asset URL and hash. The worker generates its server private key locally and returns only its public CSR. The controller verifies the worker UUID and CSR signature, signs the public server certificate, creates its own client key in the protected PKI directory and sends only public certificates, CA material and a public SHA-256 certificate pin through SSM. The transport opens a bounded AWS SSM loopback port forward and verifies worker TLS identity with a client certificate. No private key or user authentication material is sent through user data or SSM command output.

Bootstrap phases and command identifiers are durable. Commands have bounded polling, three response/acceptance attempts and a one-hour overall limit. An uncertain, failed or unavailable installation remains incomplete. A worker becomes ready only after authenticated health returns its exact worker UUID and readiness. Exact retained EBS volume identity is discovered from the owned instance mapping and passed to installation; the installer must never guess a raw disk. Repair and update require no active or uncertain task, drain an enrolled worker, and use distinct preserving bootstrap phases on the same instance. The worker implementation supplies the supported installation, tools, service-account and data-disk operations. Live provider, native account/ACL, disk and transport acceptance are still unverified.

Tasks persist FIFO positions and run at most one per worker. A lost dispatch response stays `dispatching`, preventing another dispatch until the worker reports a terminal state. Cancellation of an active task is a request, not proof of termination; another task waits for verified terminal status. A controller restart retains uncertain work for reconciliation. Worker terminal results are reduced to status and error code; credentials and device codes never enter general events. Task prompts and repository URLs are private database records and require access-controlled backup handling.

Bulk operations persist per-target states. Stop, restart and termination are blocked while an active or uncertain task exists. Termination retains the data disk. The service has no erase-data API. Automatic recovery of uncertain provider launches requires operator reconciliation. Live provider and native worker installation acceptance remain incomplete.

## Verification

`npm run build --workspace @fleet/shared` and `npm run build --workspace @fleet/service` compile the two packages. `npm run test --workspace @fleet/service` runs isolated Fastify injection tests with an explicit in-memory PostgreSQL adapter and cloud/worker doubles. The suite also signs and rejects worker CSRs, validates release metadata, and verifies established event streams close after logout or expiry. These tests do not establish live AWS pricing, IAM permissions, EC2 launch, PostgreSQL advisory-lock behavior, SSM forwarding or mutual-TLS enrollment. Production uses the real PostgreSQL and AWS implementations only.

## Bounded task output

`GET /api/tasks/:id/output?after=0&limit=100` requires the current owner session, resolves the task and its worker from the database, and proxies only that worker's same-task output route. `after` is a nonnegative JavaScript-safe integer; `limit` is 1 through 200. The response is `{ taskId, events, nextCursor, oldestSequence, latestSequence, gap, truncated, resetReason? }`.

Each event has `{ sequence, kind, content, at, itemId?, stream?, truncated, redacted }`. Kinds are `assistant`, `command`, `command-output`, `file-change`, `progress`, `state` and `result`. Content is limited to 2,048 characters. Streams are `combined`, `stdout` or `stderr` only when supplied by the actual worker protocol. Combined protocol output is never relabelled as separate stdout or stderr.

The service rejects cross-task identifiers, oversized pages, unknown output fields and inconsistent ordering/cursors. The worker retains a bounded in-memory tail, so replay is not a permanent archive. `gap`, `truncated` and `resetReason` must remain visible to readers; a worker restart can reset the cursor and lose earlier output. Responses are `no-store`, never written to task records, and never copied into general fleet SSE or audit history. Authentication codes and credential-bearing protocol traffic are excluded by the worker before this explicit output schema. Connection or validation failures remain unavailable output, not a fabricated empty successful transcript.

## Existing network and instance-profile discovery

Cloud discovery reads existing paginated subnets, security groups, SSM VPC endpoint metadata and IAM instance-profile names. Each listing has truthful availability/truncation state. IAM or optional network discovery permission failures preserve the successful existing-subnet results and return an actionable setup limitation without including raw provider exception details.

This service does not create IAM roles, profiles, VPCs, subnets, security groups, routes, endpoints or paid NAT gateways. Configure or select existing approved resources in the first-run launch workflow. An account without a usable profile or subnet still needs that setup; listing a profile does not prove its trust policy or runtime permissions. Required access includes the worker's scoped Systems Manager permissions and approved package-download access. Outbound HTTPS/DNS, route tables, network ACLs, endpoint policies and security groups must permit the selected route. Existing resource metadata is explicitly `verified: false`; it never claims reachability.

Amazon documents [IAM instance-profile listing](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-iam/Class/ListInstanceProfilesCommand) and the [Systems Manager VPC endpoint requirements](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-create-vpc.html). Current agents prefer `ssmmessages` when available; `ec2messages` requirements depend on region and agent support. Worker package installation also needs an approved outbound route to the pinned release downloads. Native runtime checks remain necessary after any setup.

## Authenticated owner scope

Setup, login and `GET /api/auth/session` return `{ authenticated: true, csrfToken, scopeKey }`. `scopeKey` is a lowercase 64-character SHA-256 value with a versioned domain separator. Its only identity inputs are a durable random controller UUID, a durable random owner UUID and the normalized configured origin. It contains no account identifiers, password, salt, password digest or session credential. Public `GET /api/auth/status` never returns the scope or its source identities.

The scope remains stable across sessions and controller restarts that retain the same database, and differs for another controller, owner or origin. Initial upgrade assigns an opaque owner UUID without replacing existing password fields and binds pre-upgrade sessions to that owner once. New owner setup generates a new UUID; replacing an owner must generate a new UUID rather than copy the old identity. Sessions bound to a different owner are invalid, including established event streams on their next bounded authentication check. Clients must invalidate their platform scope and pending request epoch on logout, authentication loss or a changed scope, and fetch the authenticated session again after sign-in. A scope is a storage-isolation identifier, not authorization or an authentication credential.

## Required feature API and route-presence verification

The authenticated `GET /api/features` route returns the complete versioned inventory with exactly the 115 reviewed stable identities in `src/feature-identities.ts`. The configured `FEATURE_MANIFEST_FILE` selects the owning product's real manifest; the production default is its root `docs/required-features.json`. The service validates the schema, count, identity set, applicability/state consistency and article allowlist before returning success. A future identity change must update the reviewed identity list and the test snapshot in the same change.

`GET /api/features/:id` returns `{ feature, article }`, including the complete formatted article source. The only allowed article is `docs/features/requirements/<reviewed-id>.md`. Physical article-directory and file resolution must remain inside the configured documentation tree, including when junctions or symbolic links are present. Inventory and article reads are regular-file and UTF-8 checked, bounded to 1 MiB before allocation/read completion, and returned with `Cache-Control: no-store`.

An absent or invalid inventory returns HTTP 503 `FEATURE_INVENTORY_UNAVAILABLE`. Missing, oversized or escaping article content returns HTTP 503 `FEATURE_ARTICLE_UNAVAILABLE`. An unknown valid feature identity returns HTTP 404 `FEATURE_NOT_FOUND`; malformed identities return HTTP 400. The routes remain registered when source configuration is unavailable, so unavailable content cannot masquerade as an absent endpoint.

`test/features.test.ts` contains a handwritten core-route list from the API contract and checks registration on a real Fastify service instance. It also executes both feature routes against the reviewed 115-entry public manifest snapshot, reads all 115 fixture articles, checks unauthorized HTTP 401, confirms a genuine unknown route remains HTTP 404, and exercises missing source, invalid schema, missing/replaced identities, oversized content, traversal and a physical directory-junction escape. The test snapshot is a reviewed public inventory fixture, not the runtime content source. Production PostgreSQL and built deployment verification remain separate from the isolated adapter tests.
