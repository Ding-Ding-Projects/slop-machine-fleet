# Drop a personal-vocabulary JSON onto the application

Every application, desktop apps and browser extensions included, accepts a personal-vocabulary JSON dropped anywhere on its window, validates it with the same rules as the Settings upload, applies the private wording immediately and persists it locally; an invalid file is refused with a clear message and changes nothing. The Settings upload remains as the fallback route. A successful apply shows a non-blocking full-window level-up celebration whose headline animates in, holds for about 3 seconds and animates out, with the headline taken from the private name inside the imported JSON, or the neutral Personal wording applied when the file gives none. Successful saved drops play tada once, invalid drops play the invalid-input sound once and preserve existing data, existing mute and volume controls apply, and reduced motion gets a fade or static notice, screen readers get a polite announcement, and nothing of the payload beyond that headline is shown. Local-only, no-network and original-wording-on-clear boundaries are unchanged, and GitHub Pages sites are not covered.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
