# Root `build.bat` and `build-installer.bat`

Every repository carries real working root build.bat and build-installer.bat entrypoints that take a fresh Microsoft Windows checkout to a built runnable application and to the release-equivalent installer, installing every dependency or prerequisite themselves in user scope, pre-elevating interactively, supporting /s, --silent, and SILENT=1, reporting each phase honestly, staying idempotent, and propagating the real child exit result. Every build and installer production, every manual release included, invokes these exact entrypoints, and the installer script verifies and prints its artifact path and SHA-256 and never publishes, tags, or pushes. An repository with no installable target documents exact nonapplicability with an honest non-success result. Every repository also has a dedicated desktop application build GUI with real Build, Build and run and Build installer actions, automatic trusted pinned/hash-verified dependencies and prerequisites, progress, cancellation and recovery. GitHub Actions publishes its source/version-bound single portable .exe in a normal release without an adjacent runtime folder or separate installer.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
