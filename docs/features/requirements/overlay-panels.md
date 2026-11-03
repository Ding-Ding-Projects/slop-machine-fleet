# Overlays and panels

Every popover, menu, dropdown, tooltip, and anchored panel paints its own background, border, elevation, and shape, stays bounded by the viewport, and scrolls when its content does not fit instead of hiding the overflow. Overlays never paint outside their card, sit under their opener, or cover the control they anchor to. Every panel is resizable from its edges and corners, floating panels also drag by their header, both have keyboard paths, and size and position persist per surface with a reset.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
