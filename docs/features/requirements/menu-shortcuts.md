# Context menus show working shortcuts

Every context-menu item that has a keyboard shortcut displays it right-aligned in the platform's own notation, derived from the same source that registers the binding so the two cannot drift. The displayed shortcut is the one that actually works in that context, reaches assistive technology as a shortcut announced once, and an item with no shortcut shows nothing.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
