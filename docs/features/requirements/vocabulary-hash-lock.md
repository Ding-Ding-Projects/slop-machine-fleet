# Vocabulary hash lock

Every repository holds its builds and its pushes behind a lock derived at run time from the dictionary, with the expected value kept beside the private source and neither the terms nor the hash ever committed. A missing private source is skipped with the reason printed, while a present but stale lock fails closed. The gate says plainly that it proves possession and currency of the dictionary, not that anyone spoke it.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
