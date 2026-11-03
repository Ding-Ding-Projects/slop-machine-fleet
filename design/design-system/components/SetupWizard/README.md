# SetupWizard

The practical first-run wizard: real setup actions with their actual results, saved progress, Back and Next, and skippable optional steps. Finishing opens the fleet.

- **Material 3 primitive:** Navigation (stepper list), text fields, status chips, buttons
- **Covers:** `onboarding-wizard`, `guided-forms`, `progress-recovery`

## Provide
- Steps with done/current/todo states and optional tags; per-step real validation results as StatusChips; Save and exit; a Next that states what it waits for.

## Do
- Resume where the user left.

## Don't
- Don't open the fleet before validation passes.
- Don't fake checks.
