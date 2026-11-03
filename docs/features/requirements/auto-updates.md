# Chrome-style automatic updates

Every installed user-facing application checks for updates at startup and on a bounded background schedule, validates the unsigned Squirrel feed metadata and package hashes over HTTPS without interrupting work, stages the update, and shows a persistent non-blocking ready banner with the exact version, a release-note link, an unsigned-artifact warning, **Restart to install update**, and **Later**. Restart happens only on the person's choice with unsaved-work protection. The updater is on by default with a visible state and a manual **Check for updates** command, and an update bug or failure is never hidden behind a spinner.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
