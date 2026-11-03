# Infinite colour picker and translator

Every colour control is an infinite picker, a continuous spectrum, wheel, or two-dimensional field plus numeric entry, never a swatch-only chooser, with a translator across named colours, HEX and HEX8, RGB, HSL, HSV, HWB, CIELAB and LCH, OKLab and OKLCH, and CMYK that preserves alpha, names the active space and gamut, warns before gamut loss, and shows contrast. The animated rainbow is one of its choices: a sentinel outside the palette, animated in the stylesheet around the hue wheel, with one global duration, speed stored as a level, and one settled hue under reduced motion. The pickers theme themselves and the chrome around them, carry a search with the regex builder, and never silently drop a value they cannot represent.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
