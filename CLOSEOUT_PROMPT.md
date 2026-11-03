# Hosting automation handoff

The current task automates the normal hosting sequence while preserving existing configuration, named volumes and accounts. It does not implement or authorize data reset, account creation, browser automation or certificate-consent automation.

The first infrastructure checkpoint is `4b2ac2b`. The remaining source changes add accepted-release/image verification, protected database backup, current-user CA reuse or explicitly confirmed trust, real health checks, signup-status handoff and retained detached/log modes. All changes belong to `ai/feature/20261103-host-automation`.

Focused checks cover deployment identity, ownership rejection, argument construction, accepted release/image binding, atomic configuration backup, existing permissions and trust decisions. Live hosting, native certificate consent, backup restoration and cross-device proof have not been performed by this implementation lane. The parent owns the later exact entrypoint verification and integration. The service and interface owners are implementing first-user username/password signup separately.

Next: review the source, run the focused checks against the final candidate, preserve it, integrate with signup work and then invoke the exact host entrypoint only against the explicitly assigned existing deployment. Verify trusted reuse without a duplicate certificate import. Preserve the user's current one-off data-reset request as a separate parent-owned action, never normal startup behavior.

Independent review corrections now verify the recorded Compose/environment file set and exact existing database volume before startup; unsupported overrides, foreign secret roots and bind data are retained without update. The log view keeps per-service snapshots and the verified URL/evidence/account next step. Attended no-argument Detached mode retains its completion result until Enter, while explicit detached/noninteractive mode returns. Eight focused hosting check scripts cover these paths. No live deployment or trust mutation has occurred in this lane.
