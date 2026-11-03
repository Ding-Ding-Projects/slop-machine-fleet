# Required-format self-signing only

Outputs are signed only when their required format or runtime demands it, and then only with a project-owned self-signed credential held in protected local storage or a GitHub Actions secret store, never a public certificate authority, paid certificate, signing service, or timestamp service. A CRX requirement is met by a genuine self-signed CRX3 with a stable project-owned key, and the signature is verified mathematically before release. Release material states that self-signing proves only possession of the key.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
