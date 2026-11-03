# Complete, scripted font vendoring

Fonts are vendored complete by a committed script that fetches the exact URL the design asks for with a modern browser User-Agent, downloads every file the request returns, preserves font-weight and unicode-range, declares only axes the binary has, and records a SHA-256 per file in a committed manifest, stopping loudly on a partial set. The result is verified in the built artifact with document.fonts.check and the computed fontFamily, never by reading configuration.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
