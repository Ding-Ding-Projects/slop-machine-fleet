# The GitHub Pages linked from the repository

Every public repository application sets its GitHub About website field (homepage) to the exact verified deployed GitHub Pages home-page URL; private repositories are exempt from this field because their GitHub Pages is a packaged desktop application rather than a hosted site (private-documentation-package). Set the field with gh repo edit --homepage <url> and link it near the top of the README. GitHub Pages publishing is enabled whenever the project publishes through it, and the URL and base path stay configurable and verified in the built output, so a detached fork publishing under a project path does not 404.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
