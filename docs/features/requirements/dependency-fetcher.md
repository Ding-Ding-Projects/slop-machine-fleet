# One-click dependency or prerequisite fetcher

Every repository carries download-dependencies.bat, plus download-dependencies.sh wherever another platform is supported, that obtains every dependency or prerequisite needed to build, run, and test from canonical sources into user-scoped locations, pins exact versions, verifies recorded digests, and keeps a committed manifest of both. It is idempotent and silent-capable, reports per phase, and exits non-zero on the first real bug or failure. It never commits fetched dependencies and prerequisites or installs secrets or signing certificates, and build.bat calls it rather than duplicating it.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
