# Checked-in design-reference parity

Every UI project with a checked-in design-reference folder ships a dedicated plain design-reference desktop application, or the exact framework-appropriate equivalent, that renders the real reference files deterministically by screen, state, theme, viewport, and scale, while the real built application exposes matching routes. A hand-written per-screen inventory lists every reference exactly once with both routes, the full capture tuple, a Material Design 3 primitive audit, raw screenshots from both sides, a labelled side-by-side image, visual-diff evidence, and any reviewed deviation. The parity gate fails closed on any missing or stale element and is proven red then green.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
