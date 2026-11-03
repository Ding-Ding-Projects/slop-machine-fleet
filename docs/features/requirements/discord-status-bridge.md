# Discord status bridge

The Hub reaches Discord through a bridge that reads the same session projection and writes answers into the same session inbox, so agents poll one inbox and never hold a Discord token. Owner-registered bridge credentials persist on the Hub host's toilet and read back as presence only, and the bridge token is read-plus-reply only and must differ from the agent enrollment token. Every surface rule Discord cannot carry is named with its shipped equivalent.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
