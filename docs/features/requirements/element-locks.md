# Toy locks on every element

Every rendered element, tab, tab group, and appearance value can be locked from its own **Lock this element…** command through a non-modal anchored wizard choosing exactly one of six credential mixes: PIN, password, PIN plus password, password plus TOTP, PIN plus TOTP, or password plus PIN plus TOTP. Each lock has its own credential set in the operating-system credential vault with no master credential or implicit inheritance, and a locked element is truly disabled yet opens its own anchored unlock prompt, with no shortcut, palette teleport, or automation hook walking around it. Every lock says it is just for fun, never security, and names deleting the local application-data folder as the recovery.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
