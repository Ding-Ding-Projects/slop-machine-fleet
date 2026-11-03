# Local personal-vocabulary JSON upload

Every user-facing application and GitHub Pages shows a visible local personal-vocabulary JSON upload control in its own settings, even before any file exists, with localized no-file, loaded, invalid, replace, and clear or reset states that settings search and the command palette index. One documented, versioned, bounded schema accepts the dynamic current inventory without a hardcoded entry count and is validated in full before display or caching (256 KiB UTF-8, depth 8, keys up to 160 Unicode code points and values up to 1,000), a rejected file never applies partially, clearing purges the cache, and original shipped wording renders until a valid private file arrives. Handling is local-only, so no private vocabulary value, mapping, payload, or file metadata ever reaches source, logs, exports, history, telemetry, prompts, or any public record.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
