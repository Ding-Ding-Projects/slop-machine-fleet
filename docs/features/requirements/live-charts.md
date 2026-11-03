# Live charts in the Liveline style

Every chart whose data updates while it is visible follows the Liveline style: a smoothly easing line with a pulsing live dot and momentum, a fill gradient from the series colour, a quiet grid, animated axis range and value badge, and a scrub crosshair with time and value tooltips. Keyboard scrubbing, a screen-reader summary and honest loading, paused, empty and stale states are required, and nothing is invented to look live. Under reduced motion or Low stimulation the chart snaps instead of easing and stops pulsing, with every value still readable.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
