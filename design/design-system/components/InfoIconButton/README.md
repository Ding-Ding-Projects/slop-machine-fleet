# InfoIconButton

The per-control guidance entry: one 44px info icon button directly above its control that opens an explanation panel with a worked example and a sample-only playground.

- **Material 3 primitive:** Icon button (standard) plus an inline non-modal panel built from cards
- **Covers:** `info-icon-guidance`, `settings-explanations`, `onboarding-wizard`

## Provide
- The originating control and a localized, target-specific accessible name ("About machine cap").
- Panel content: purpose, consequences, recommendation, a worked example, and a playground that uses the real control with synthetic data and a Reset.

## Do
- Keep the panel non-modal and next to its control; on narrow layouts expand it in the content flow below.
- Label the playground "sample only" and never apply it to real settings.

## Don't
- Don't show persistent Guide or Explain text next to every control.
- Don't seed the playground from real accounts, codes or files.
