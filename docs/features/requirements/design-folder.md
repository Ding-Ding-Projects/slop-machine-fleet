# Design surfaces live in the repository

Every design surface, including a Astra design implementation subagent’s handoff and explicitly selected design-tool work, is committed to the repository's own design/ folder and pushed in the same task that creates or changes it, because the hosted project is only a viewing surface. When user asks the Claude Design to design or redesign an repository's application, every Claude Design file (canvas index, artboards, linked assets, handoff) is pushed into that repository's design subfolder even when only a zip or a frontend-only pass was requested. Every Claude Design pass also installs the Stageshow skill fresh (npx skills add benjitaylor/skills --skill stageshow) and follows it, using the pinned cache in vendor/stageshow-skill/ only when the install is a bug or failure. Design files carry no private vocabulary, and a prototype or preview is never called shipped behaviour.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
