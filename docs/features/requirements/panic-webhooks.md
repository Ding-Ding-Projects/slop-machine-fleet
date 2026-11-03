# Verified panic dispatch

Verified panic conditions, destroyed, intrusion_attempt, reset, unavailable, and vocabulary_leak, dispatch through owner-managed Hub destinations in a fixed order: Home Assistant first, the Discord bridge next, then generic webhooks, with idempotent retries and no destination's bug or failure suppressing the next. Registration is owner-only, with secrets held on the host and read back as presence only. Outbound delivery fails closed on unsafe targets, redirects, oversized payloads, and DNS rebinding, and carries only the fixed panic schema.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
