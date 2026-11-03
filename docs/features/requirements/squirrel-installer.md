# Genuine Squirrel.Windows installers

Every supported Microsoft Windows installer for every installed application, whatever its framework, is genuine Squirrel.Windows shipping Setup.exe, RELEASES, the full .nupkg, and generated deltas where available. Every other installer route is migrated or removed, and a framework limitation is a packaging problem to solve, never an exemption. Release notes and installer status say plainly that the artifacts are unsigned and may meet an unknown-publisher or SmartScreen warning, with no authenticity claim.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
