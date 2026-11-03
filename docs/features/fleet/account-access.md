# Controller account access

## First owner

When the controller reports `signupAvailable: true`, the account screen offers username, new password and password confirmation. It sends only `{ username, password }` to `POST /api/auth/signup`. The confirmation is local validation and is not transmitted. No setup-code field, setup-code retrieval or file picker appears in this flow.

The service owns the atomic first-owner claim. If another request wins, the UI clears password fields and reads the current account mode before presenting sign-in. A successful response must contain actual authenticated session, CSRF, scope and account fields; a response alone is not guessed into an owner identity.

Usernames are NFKC-normalized and trimmed, contain 1–64 Unicode letters/numbers with optional dots, underscores and hyphens, and start with a letter or number. Supported combining marks may follow that first character. Matching is case-insensitive on the service, while the returned display case is preserved. New passwords contain 14–256 characters and are never trimmed or normalized. The UI supports password-manager autocomplete and keeps password inputs transient; no password enters preferences, history, notifications, logs, URLs or exports.

## Returning owners

`loginMode: username-password` presents username and current password and sends both to `POST /api/auth/login`. `loginMode: legacy-password` deliberately omits the username field and preserves the existing password-only login path. The UI does not infer a username for a legacy owner or reset that account.

An authenticated legacy owner sees a one-time username adoption form. `PUT /api/auth/username` sends the chosen username and current password under the existing authenticated session and CSRF protection. The service retains the owner identity, password, scope and existing sessions. The UI reads the resulting account again, then removes the adoption form when `usernameRequired` is false. Wrong password confirmation is shown as a credential mismatch without expiring the existing session; actual missing-session responses still clear authentication.

## Recovery and boundaries

Concurrent claim, already-set username and changed-owner conflicts trigger authoritative status/session readback. No old response may mutate a replaced or unmounted form. Password fields clear after completed requests and when modes change. Pending controls are disabled, explicit clear controls remain available when editable, and no raw server error body is rendered as an authentication message.

A manual account refresh supports uncertain network outcomes without blindly claiming creation or adoption succeeded. The client never claims a live owner by itself and never resets controller data. Controller replacement/reset and HTTPS identity are deployment responsibilities, separate from this interface.

## Verification status

Eight focused model checks cover normalization, exact request shapes, password preservation/confirmation, legacy mode, strict account responses, conflict refresh, session-preserving confirmation errors and stale request ownership. The first preservation point does not claim TypeScript, complete root build, browser interaction, native autocomplete or real signup acceptance. Those results are recorded separately when observed. Service source dependencies are the matching signup/login/status/session/username-adoption contract; the older setup-only backend is not a compatible deployment target.
