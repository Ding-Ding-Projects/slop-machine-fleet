# Offline documentation browser in every application

Every GUI application bundles every feature article at build time into a full offline documentation browser rendered by its one shared Markdown renderer, distinct from and additional to the GitHub Pages articles. Article links resolve inside the application, the browser carries its own regex search across titles and bodies, and a completeness guard fails the build when an article file in the repository is missing from the bundle.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
