# pushed `CLOSEOUT_PROMPT.md`

Every turn that worked in an repository writes a copy-ready fenced closeout prompt to CLOSEOUT_PROMPT.md at that repository's root, replacing the previous copy, commits it on the owning branch, pushes that branch, and proves the Git remote ref with git ls-remote before the turn ends. A public repository's copy goes through the canonical sanitizer and the leak scan, and an unchanged prompt makes no empty commit. At usage limit reached this push is unconditional.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
