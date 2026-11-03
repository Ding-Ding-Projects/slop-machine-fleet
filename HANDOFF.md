# Implementation handoff

## Current objective

Deliver a real desktop and local Docker-hosted fleet controller for isolated Windows Server 2025 EC2 coding workers, guided Codex login and pairing, interactive GitHub CLI login, task dispatch and safe bulk management.

## Implemented source

The integrated source contains the typed shared service, PostgreSQL persistence, session/CSRF/origin protections, price-review binding, tagged and encrypted EC2 launch, durable operations and FIFO scheduling, automatic SSM bootstrap and certificate enrollment, worker mutual TLS, native pseudoconsole authentication, app-server task handling and retained data-volume identity checks. Browser and desktop source share the authenticated controller. The complete required-feature inventory remains explicit.

## Verification boundaries

Focused service and wording tests passed before the current integrated build. Worker checks include real local pseudoconsole output and process exit, but that is not a successful account login or Server 2025 deployment. Independent source audits produced bounded fixes for session-stream revocation, hosting validation, update recovery, task terminal-state races, stale interface responses and accessible names.

No live cloud instance, paid launch, provider account approval, remote pairing, current-host installation or complete required-feature acceptance has been verified. Exact entrypoint builds, packaging, container startup and genuine interface evidence are being established. Do not infer release readiness from this handoff.

## Next steps

1. Finish the exact integrated build and installer entrypoints, inspect produced files and retain real checks.
2. Verify a real PostgreSQL-backed controller and built interface on an isolated hidden desktop.
3. Publish source-bound normal release and container image; verify downloaded payloads and LAN deployment.
4. Complete account and exact-cost review before a cloud acceptance launch.
5. Complete every applicable required-feature entry and preserve honest unfinished states.

## Preservation

Source work is retained in task-owned commits. Incomplete task lanes and private announcement images must remain preserved until their ownership, archive, integration and remote ancestry proofs permit cleanup.
