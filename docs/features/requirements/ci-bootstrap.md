# GitHub Actions dependency or prerequisite bootstrap and safe outputs

Every GitHub Actions job keeps an explicit dependency or prerequisite inventory beside its workflow, checks before installing, bootstraps anything missing from canonical sources into job-local cacheable locations, and stops at the exact step naming the missing dependency or prerequisite. Each repository proves the cache-miss path from a fresh environment against a hand-written list of every job. Every job that can produce a artifact collects and uploads its safe outputs under if: ${{ always() }} without masking the original bug or failure.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
