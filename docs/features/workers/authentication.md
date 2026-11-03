# Complete device authentication through structured prompts

Authentication state is transient and returned only by the protected no-store authentication endpoints. It is not a terminal transcript. Every response explicitly includes `sessionId`, `prompt` and `gitSetupState`, including null identities/prompts before a session exists. Provider states remain `unknown`, `pending`, `code-issued`, `input-required`, `verified`, `error`, `expired` and `cancelled`. Code issuance never proves a connected remote client.

## Session and prompt identity

`POST /auth/:provider/start` returns a fresh UUID `sessionId`. Concurrent starts cannot replace an active session. Before replacing a terminal session, the worker cancels and awaits its previous producer. State updates belong only to the current owner. Cancellation is `DELETE /auth/:provider?sessionId=<uuid>` and returns the settled cancelled state with that exact identity. A missing/zero identity is invalid; a stale identity is a conflict and changes nothing.

`POST /auth/:provider/input` accepts only `{ sessionId, promptId, action, choice? }`. `action` is `choose` or `enter`. Legacy `input` fields and unknown JSON members are rejected before terminal input. Both identities must match the current unconsumed prompt; stale identities return a conflict. No raw text, credential, control sequence or arbitrary terminal command can be submitted. A successful input returns HTTP 202; the client reads actual status afterward.

## Supported GitHub CLI prompts

The worker starts `gh auth login --hostname github.com --git-protocol https --web`. The fixed flags avoid protocol/authentication-method selection. Bootstrap pins **GitHub CLI v2.96.0**, and the runtime independently checks that exact version before opening the terminal. Other versions remain explicitly unsupported rather than silently guessing their prompt format.

Two prompts are recognized from that version's official source:

| Kind | Structured choices | Allowed actions |
| --- | --- | --- |
| `github-credential-helper` | `yes`, `no`; default `yes` | `choose`, `enter` |
| `github-open-browser` | No choices; no choice default | `enter` |

A prompt is `{ promptId, kind, title, choices: [{ value, label }], defaultChoice, allowedActions }`. Titles and choice labels are fixed application copy, not captured provider text. The consumer renders localized copy from the recognized kind. `choose` maps only to fixed `y`/`n` keystrokes plus Enter. Explicit `enter` sends an actual Enter and does not require an empty text field. A consumed prompt cannot be reactivated by a terminal redraw. A later browser prompt gets a different identity.

Recognition is based on the confirmation in [v2.96.0 git_credential.go](https://github.com/cli/cli/blob/v2.96.0/pkg/cmd/auth/shared/git_credential.go) and continuation in [v2.96.0 authflow/flow.go](https://github.com/cli/cli/blob/v2.96.0/internal/authflow/flow.go). The parser handles bounded ANSI/carriage-return chunks while exposing no raw transcript. The one-time code is extracted only from the known GitHub device-code marker. Unknown prompts remain `input-required` with no prompt controls and `UNSUPPORTED_AUTH_PROMPT`. Codex device authentication and pairing currently have no supported interactive input controls; their transient link/code routes remain separate.

## Respect credential-helper consent

`gitSetupState` is separate from account authentication and is one of `unknown`, `not-requested`, `declined`, `configured` or `error`. GitHub sessions start `not-requested`; unrelated providers remain `unknown`.

Choosing **No** preserves `declined`. The worker may verify the GitHub account through `gh auth status`, but never runs `gh auth setup-git` afterward. Choosing **Yes** or its explicit Enter default permits setup. After successful account verification, the worker runs setup and independently reads the global GitHub helper configuration back. Only a matching helper command becomes `configured`. Setup/readback failure leaves the account `verified` with `gitSetupState: error` and `GIT_SETUP_FAILED`; it does not falsify the account-verification result.

## Verification boundary

`dotnet run --project worker/tests/Pairing/Pairing.Checks.csproj` runs **36 deterministic consumer checks**. They cover the real `Start`/`Run` consumer paths using command/time and terminal interfaces, without launching a native helper, login, browser or daemon. Coverage includes expired pairing JSON, future lifetime, cancellation, malformed responses, concurrent ownership, stale identities, ANSI/carriage-return prompt boundaries, explicit defaults, consumed redraws, unknown forms, synthetic sensitive-looking echo, independent setup readback and the No-choice flow without a later setup command. No raw credential or provider transcript enters state or test output. These fixtures and source review do not claim live authentication or native prompt verification.
