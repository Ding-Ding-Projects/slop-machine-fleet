# One fresh Microsoft Windows build-and-run command

Every README that documents a Microsoft Windows build shows one copy-and-paste command, conventionally .\build.bat --run, that works on a completely fresh Microsoft Windows installation, acquires and verifies every dependency or prerequisite from pinned canonical sources, builds the real runnable artifact, verifies it against the current source commit, and launches it only after success. build.bat, download-dependencies.bat, and the package path share one committed build manifest, and the launch decision binds to a receipt for the unchanged source. dependency or prerequisite activation is staged, locked, journaled, and recoverable after an interrupted or malformed run.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
