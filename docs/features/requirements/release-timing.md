# End-to-end workflow timing in release notes

Every successful workflow-produced release records Workflow started, Workflow completed, and Workflow duration with UTC ISO-8601 timestamps and a stable HH:mm:ss duration, measured from the first job's startedAt through the final publication step and never estimated. A release without verified timing reports the missing evidence instead of pretending.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
