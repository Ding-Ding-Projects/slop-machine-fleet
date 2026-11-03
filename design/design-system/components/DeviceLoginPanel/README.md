# DeviceLoginPanel

The guided device-login and pairing panel: steps, the official link, a one-time code hidden until revealed, a visible expiry, cancel, and a separate verification step.

- **Material 3 primitive:** Card with a vertical stepper, assist chip and buttons
- **Covers:** `onboarding-wizard`, `progress-recovery`, `guided-forms`

## Provide
- Worker, the tool being signed in (Codex, GitHub CLI, remote pairing), the expiry, the code (hidden by default) and the verification result as its own step.

## Do
- Show "code issued" and "connection verified" as different states.
- Offer retry after expiry with the same panel.

## Don't
- Don't put codes in notifications, history, exports or screenshots.
- Don't mark sign-in complete before the status check passes.
