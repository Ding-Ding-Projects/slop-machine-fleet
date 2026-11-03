# Language modes

Every user-facing application and GitHub Pages ships a persisted language mode with exactly three baseline choices: English, playful Hong Kong-style Cantonese, and bilingual. Bilingual mode keeps the primary label prominent with a compact secondary label or progressive disclosure, so narrow layouts never crowd. Localization resources stay separate from logic with fallback behaviour, and non-UI libraries are exempt only until they expose a user-facing surface.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
