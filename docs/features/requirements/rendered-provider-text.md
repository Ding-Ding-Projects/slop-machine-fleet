# Provider-authored text is rendered

Release notes, GitHub error and pull-request bodies, commit messages, and README previews display as the Markdown they are, through one shared isolated renderer that never runs with the application's own privileges. The renderer carries an emoji map, a base reference for relative links, and an accessible region label, and an empty source shows an honest "no notes were provided" state.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
