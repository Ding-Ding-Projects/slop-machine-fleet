# Live GitHub Actions runner selection

Before wiring or dispatching a job, gh inspects the self-hosted GitHub Actions runner inventory, access, state, platform, capacity, and labels, a compatible self-hosted GitHub Actions runner is used only when it is genuinely available, and otherwise a pinned GitHub-hosted cloud image runs the job. A self-hosted GitHub Actions runner on a public repository never takes a pull_request trigger, keeps write-access triggers, and stays resource-constrained. No workflow is left queued against an offline label.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
