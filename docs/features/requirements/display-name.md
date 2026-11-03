# Renaming the application

The person using a application can change the name it shows them in the title bar, the About surface, notifications, and everywhere else it introduces itself, persisted and resettable to the shipped name in one action. Renaming changes the display name and nothing else: the data directory, installer and package ids, update feed, and markers written into other repositories stay derived from a constant, and diagnostics and crash reports still send the shipped name. Every rename, change, and reset records its own append-only commit in the application's local history.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
