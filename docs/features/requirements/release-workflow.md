# A real release on every push

Every GitHub project has a GitHub Actions workflow on every push and workflow_dispatch that builds, packages, and publishes exactly one new, uniquely tagged, non-draft GitHub release carrying the genuinely built installer, and by user's standing decision it runs no tests, lint, or other gating gate. Release notes state which checks actually ran locally and their real results, never describe an ungated release as passing, and publishing creates no automation loop. The active delivery scope is Microsoft Windows only, and GitHub API calls resolve the RELEASE_TOKEN, ORG_TOKEN, GITHUB_TOKEN chain without ever printing it. A private repository keeps .github/workflows absent and reaches the same release through encrypted-public-builder instead.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
