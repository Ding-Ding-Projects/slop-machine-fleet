# Isolated first-owner UI handoff

## Source and integration boundary

Base: `4ae49affbdec60359babd4bbd02311321493916f`.
Branch: `ai/feature/20261103-first-signup-ui`.
UI source units: `bebe0674afe782bbc6d394d5b95785e6e926d9ce` and `9384ab3c905183cfa62c69c3e872e1dcb4f8a2dc`.

This independent unit implements first-owner username/password signup, confirmation, named login, preserved legacy password-only login and authenticated one-time username adoption. It has not imported the inactive worker-authentication or Base64 candidate and has not changed main, claimed a live owner or reset live data.

The matching service dependency is `9dd0bada908c28f744f8452df0d037978ef08672`, or its independently accepted successor with the same wire contract. Status exposes signupAvailable/setupAvailable/loginMode; signup/login/session return authenticated, csrfToken, scopeKey and account; authenticated CSRF-protected username adoption returns account. The older setup-only service is not a compatible deployment target. No setup-code field or file picker is present in this new user flow.

## Verified behavior and evidence

- Ten focused account model checks passed, including exact Unicode/raw/normalized username bounds, password preservation, confirmation, legacy bodies, account readback, conflict refresh, session-preserving confirmation errors and stale request ownership.
- Web TypeScript passed.
- Exact `cmd /c build.bat /s` completed with exit code 0 for source `9384ab3c905183cfa62c69c3e872e1dcb4f8a2dc`.
- Independent source review accepted the corrected username contract against service `9dd0bada908c28f744f8452df0d037978ef08672`.
- Build version `0.1.2`; recorded build time `2026-11-03T17:12:08.676Z`.
- Web asset `index-GMR65FQG.js`, SHA-256 `cfb22f828dcdb3646fca77d1b86b325d7ff1049c68dd548ffccb69c338da1f80`.

This documentation-only handoff does not relabel those outputs as a later source build. Existing large-chunk warnings remain.

## Privacy, recovery and remaining work

Passwords remain transient form/request values, are not trimmed or normalized, and are excluded from preferences, history, generic notifications, logs, URLs and exports. Conflict responses cause authoritative account-mode/session refresh. Exact invalid-password confirmation on username adoption does not expire the existing session; actual authorization loss still clears it. Account refresh retires prior data-read and stream ownership before resuming the workspace.

Browser, GUI helper, native updater, trust, cloud and live account operations were not run. Runtime form behavior, password-manager autocomplete, coupled deployment and actual first-user signup remain unverified. Parent owns source integration, the explicitly requested replacement/data reset after coupled acceptance, and preservation of the existing HTTPS identity. Do not create the real owner as a verification step.

No remote push or publication occurred in this lane. Preserve these source units and build binding, assemble with the accepted matching service, and verify the deployed signup-available status without submitting real credentials or claiming the owner.
