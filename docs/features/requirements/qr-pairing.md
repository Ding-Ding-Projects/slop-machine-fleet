# QR pairing for OTP registration

Wherever a application asks someone to pair an authenticator, it generates the secret locally and draws a scannable QR of a standard otpauth://totp/ URI in-process, never through an online service, beside the copyable grouped base32 secret, algorithm, digits, and period. The QR keeps its quiet zone and true dark-on-light contrast in both themes, and the secret is revealed only by explicit action and never written to hard disk, a log, a screenshot, an export, telemetry, or history. The factor arms only after the person types back one current code.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
