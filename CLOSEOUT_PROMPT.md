# Isolated first-owner UI handoff

Base: `4ae49affbdec60359babd4bbd02311321493916f`.
Branch: `ai/feature/20261103-first-signup-ui`.

This independent unit implements the approved username/password first-owner UI without importing the inactive worker-authentication protocol or Base64 candidate. It does not change main or claim a live owner.

Implemented source: dedicated account gate and Material text fields, signup confirmation, explicit named/legacy login modes, authenticated one-time username adoption, request ownership and fixed localized error messages. App integrates actual account/session readback and refreshes stream ownership after account refresh. The API only suppresses global session expiry for exact credential-confirmation failures on login and username adoption; actual authorization loss still expires the session.

Dependency contract: `GET /api/auth/status` exposes authenticated, signupAvailable, setupAvailable alias and loginMode; signup/login/session return authenticated, csrfToken, scopeKey and account; `PUT /api/auth/username` returns account under authenticated CSRF protection. Signup is atomic first-owner-only. Existing legacy owners retain password-only login until username adoption. The final service source receipt is pending.

Eight focused account model checks passed. This early preservation point has not yet completed TypeScript or exact root build. Browser, GUI helper, updater, trust, cloud and live account operations were not run. Passwords and account inputs are not recorded in this handoff or any generic record.

Next: compile/build the exact candidate, obtain independent review, align with the final service source and preserve factual results. Parent owns coupled deployment and the explicitly requested live data reset while retaining HTTPS identity. Do not activate the UI against an older setup-only service or infer runtime acceptance from source checks.
