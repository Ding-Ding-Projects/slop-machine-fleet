# Local version history

Every application that owns documents, projects, or other person-managed records keeps a local Git-backed history isolated beside its own data directory, never a .git inside the person's folder, covering documents, accounts, credentials, connected services, rules, and settings so any change can be undone. Restores are new revisions, history is append-only, snapshots keep ciphertext as ciphertext with authenticated-encryption bindings that survive restore, and revisions are labelled with what actually changed. The panel browses, diffs, restores, labels, prunes, and exports with an advanced date picker, real derived action filters with counts, and its own regex search, while secrets and display names follow the password-protected mutation-history contract with one commit per mutation and no plaintext secret.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
