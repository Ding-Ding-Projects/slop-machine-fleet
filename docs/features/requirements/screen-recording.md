# committed screen recording

Every user-facing application ships a real recording of its built artifact at a known commit, driven through the project's headless route, committed to its own repository, and shown in the README. It records the application's own window or renderer on an off-screen desktop, never the machine's screen, and shows a real end-to-end path rather than a highlight reel. It stays small, routes a genuinely large file through the repository's own large-file path and never standard Git LFS, and is refreshed whenever the interface changes.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
