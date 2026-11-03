# A real picture when a link is pasted into Discord

Every repository and every page it publishes renders a large embedded graphic of the actual product when its link is shared, never the auto-generated metadata card, a stock image, or a mockup. social-preview.png sits committed at the repository root, any served copy comes from the same script and is proven byte-identical, and every page serves og: title, description, URL, type, site name, an absolute https:// image with width, height, and alt, twitter:card set to summary_large_image, and theme-color in the HTML the server sends. The image is fetchable anonymously with no a crawler-policy file disallow and changes URL when it changes, and the manual social-preview upload is handed to user with the exact root path and tracked until confirmed.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
