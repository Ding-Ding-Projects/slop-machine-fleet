# A context menu on every element

Every user-facing application and GitHub Pages, and every rendered element within it, provides a target-specific right-click context menu plus accessible keyboard and touch equivalents, including **Edit appearance…** and **Lock this element…**. Every context menu and every dropdown opens with a keyboard-focusable filter field and its own anchored regex builder, however short the menu, filtering locally without reordering meaning, hiding a destructive item while its shortcut stays live, or changing any action. Focus lands in the filter on open where the platform allows, arrows move, Enter activates, Escape clears and then closes, focus returns to the opener, and screen readers hear the result count.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
