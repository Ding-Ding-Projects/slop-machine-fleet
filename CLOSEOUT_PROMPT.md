# Service continuation: bulk recovery and structured authentication

The assigned service branch is `ai/feature/20261103-fleet-service`. The following source units are preserved locally and have not been pushed by this lane. The parent owns outgoing scans, publication and integration. Do not activate the coupled authentication protocol on main until the final worker, service and interface changes are reviewed together.

## Preserved source units

| Unit | Commit | Verified scope |
| --- | --- | --- |
| Bulk recovery | `54b47a3ce0ff38901f53e2135fc95431d8452c31` | Durable target attempt boundary, conservative restart reconciliation, explicit scoped resume, original membership/hash/owner and task/concurrency constraints. |
| Structured authentication relay | `bdf71b02a21e7d7bd1e589514eeb21abaa2640a1` | Session/prompt-bound choices or explicit Enter, session-bound cancellation, mixed-version update-required behavior, transient bounded projection and sanitized conflict propagation. |
| Authentication examples and prepared wiki | `b61f1cb374d1930aa94861117ce53451229b8684` | Updated API and Postman examples, helper-declined semantics and prepared worker authentication article/navigation. |

The earlier image-provenance repair is `18c9df723fc500a7546d199de6ba35487597e035`. Baseline merge `6e0af57` incorporated reviewed source `c96d07e3075d435f489ff7c7b8e00af8efae37a8` into this isolated branch and retained version 0.1.2. The parent reports that primary source `1e7114e` already contains the preceding image-provenance tree; do not merge the old baseline again merely to incorporate the three units above.

## Verification and independent reviews

- The exact `cmd /c build.bat /s` completed with exit 0 separately at `54b47a3`, `bdf71b0` and `b61f1cb`. Receipts remain bound to those sources and are not proof for a later source revision.
- The final service suite at `b61f1cb` passed 45 tests with zero failures. This includes real-route durable database crash points, restart/idempotency/resume checks, structured authentication and mixed-version checks, and tracked documentation/Postman regressions. Tests use explicit local provider/worker doubles, not live resources or account credentials.
- Independent delivery review accepted the bounded bulk source repair at `54b47a3`.
- Independent service authentication review at `bdf71b0` was provisionally dry. Exact final worker compatibility and coupled runtime acceptance remain separate requirements.
- The final worker contract is preserved at `2b4ed65d7a87032d4c199239b214ea1e5f50dda0`; its worker documentation supplied the prepared wiki authentication copies. The interface source must be incorporated through the parent's reviewed coupled integration.
- Publication hooks passed for each preserved unit. At `b61f1cb` they scanned 470 text files and 98 recognized binary files with zero findings. The parent still must perform its complete outgoing-history scan before pushing.

## Recovery semantics and limits

Bulk attempts are persisted before dispatch. Only explicitly selected original new-version targets proven never dispatched may resume; requested, completed, legacy-unknown and uncertain targets are not replayed. Current running/ready state cannot prove a restart happened. An acknowledged restart can therefore remain requested/incomplete, and an uncertain restart remains reconciliation-required. Positive provider/worker convergence evidence never fabricates a missing acknowledgement. No live provider action was executed for this repair.

Authentication uses actual worker session and prompt identities, never synthetic IDs or raw terminal text. A legacy worker missing structured capability fields is update-required before mutation. Successful account authentication remains distinct from optional Git credential-helper setup: No can leave account state verified with setup declined. Input acceptance is not a new login-state claim. Worker/service/interface deployment must use the reviewed immutable release bytes and actual capability; a matching version string alone is insufficient.

The prepared wiki remains source-staged, not published. Live account login, native prompts and secure-store behavior, pairing connection, authenticated task execution, cloud provisioning, browser interaction and complete required-feature acceptance remain unverified. Existing large JavaScript chunk/dependency deprecation warnings remain. The local documentation build's release lookup was unavailable; a successful build is not release or deployment proof.

## Next authorized steps

1. Preserve and scan this branch's final handoff commit, then push only through the parent's authorized route.
2. Integrate accepted bulk recovery independently when the parent is ready. Keep its real provider and UI acceptance limits explicit.
3. Review and integrate the final worker, service and interface authentication changes together, keeping the protocol inactive on main until that review is complete.
4. Rebuild the actual integrated candidate and verify supported runtime behavior only through currently authorized access. Do not launch paid resources without the exact current review, retry rejected updater/browser routes, change trust or bypass an access boundary.
5. Keep private Status Hub writes held until the owner-data access boundary is actually proven. Anonymous agent-route authentication and public bootstrap booleans do not establish that proof.

This file records the lane's state through the source units above. It does not declare the larger fleet objective, publication, native update or complete required-feature delivery finished. Earlier project-wide handoff history remains in version control and in the owning HANDOFF.md and ROADMAP.md.
