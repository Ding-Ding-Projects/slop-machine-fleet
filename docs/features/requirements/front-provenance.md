# Front-screen version and updated-at provenance

Every user-facing application and GitHub Pages shows its running version and that version's updated-at date and local time, with seconds and a labelled timezone, on its initial screen before navigation, settings, About, or authentication. Both values come from provenance bound to the running artifact, never launch time, a file timestamp, a agent's clock, or a hand-entered label, and missing provenance shows an honest unavailable state.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
