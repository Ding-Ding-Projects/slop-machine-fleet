# Spoken narrator and voice pickers

Every user-facing application ships a spoken narrator for its events, off by default and enabled only by the person using it, narrating English, Cantonese, or Both strictly serialized, with a Hong Kong Cantonese voice for the Cantonese track. Each narrated language has its own voice picker listing the voices the machine actually has, with **Choose automatically** as the shipped default, the stable voice identity persisted, late enumeration handled, the voice really in effect stated beneath it, and adjustable rate and pitch. Narration is debounced, rate-limited per category, one utterance at a time, never suppresses spoken error facts, and yields to an active screen reader.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
