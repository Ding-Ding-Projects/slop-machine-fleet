# External editor and VS Code hand-off

Every application that owns files or projects detects installed editors, lets the person add or choose one, persists the choice, opens the project folder or a file, and degrades with a clear message when none is found. Anything the application can export opens in Visual Studio Code in one action, as a workspace root for folders, with detection of code, per-user, machine, Insiders, and portable installs and an honest download offer when it is absent.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
