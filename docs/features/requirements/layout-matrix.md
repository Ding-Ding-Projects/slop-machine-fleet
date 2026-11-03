# layout clipping defect matrix for every built surface

Every surface built from the Astra GUI design route receives a mandatory layout clipping defect matrix through the diagnose-built-ui-layout skill and the cheap Lowlevel headless route, bound to the exact source commit and built-artifact hash. It covers the normal and minimum supported viewport, English, Cantonese, and bilingual modes, light and dark themes, and 100, 125, 150, and 200% scales, from roughly 320 px upward for a GitHub Pages. Source inspection, a mock, or a design preview never satisfies it.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
