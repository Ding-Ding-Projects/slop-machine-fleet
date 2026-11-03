# Built-in authenticator

Every user-facing application ships its own authenticator as an ordinary tabbed, searchable, palette-reachable destination for arbitrary TOTP secrets, registered by otpauth:// URI, by QR from an image file or the clipboard, by camera where available, or by manual base32. Codes are standards-exact RFC 6238 over RFC 4226 with SHA-1, SHA-256, and SHA-512, 6 to 8 digits, and arbitrary periods verified against the published vectors, shown large with copy, a readable countdown, and a next-code peek, and a skewed clock is reported in plain words. Everything stays local in the operating-system credential vault, ordinary exports omit secrets and say so, and a secrets export sits behind super confirmation.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
