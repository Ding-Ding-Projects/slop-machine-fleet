# Scheduled and external settings sources

Every user-facing application and GitHub Pages ships a persisted schedule surface for the language mode, theme, density, seed colour, fonts, motion, display-name presentation, and every other appearance or customization value, with native accessible date and time pickers and stated timezone and daylight-saving semantics. Rules live in a versioned bounded schema with stable ids and deterministic precedence, and each rule takes its value from local data, a validated versioned HTTPS API, or a Home Assistant boolean entity. External sources refresh on a bounded interval with generation checks, fail safe to the last valid base state with a localized notification, keep tokens in the operating-system credential vault, and never persist an API value as the permanent base setting.

## Applicability

Applicable product surfaces must implement this behavior individually. A feature on one surface does not establish delivery on another.

## Current delivery state

Unfinished. No complete implementation or runtime acceptance is claimed. Review the delivery inventory for evidence as work lands.

## Acceptance

Verify the real behavior, localization, accessibility, persistence and reset where state exists, failure and recovery paths, and genuine built-surface evidence. Source presence alone is insufficient.
