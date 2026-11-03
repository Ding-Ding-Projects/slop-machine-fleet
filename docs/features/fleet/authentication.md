# Sign in and pair a worker

Worker authentication happens under the same local account that runs its coding tasks. Each machine maintains its own credentials. Fleet does not copy another worker's login cache.

## Codex login

Start the guided device flow. The worker runs `codex login --device-auth`. Open the official browser link, enter the short-lived code and personally complete account approval. The setup panel shows waiting, expiry, cancellation and retry separately. Fleet verifies the resulting CLI login rather than inferring success from code issuance.

Device authentication may require permission in the account or workspace. An unavailable account capability remains an explicit incomplete state.

## Interactive GitHub CLI login

Start the GitHub connection flow. Fleet runs the genuine GitHub CLI flow on the worker through a pseudoconsole. Its supported GitHub.com/HTTPS path exposes only recognized structured prompts: a Yes/No credential-helper choice with a Yes default, or an explicit Enter acknowledgement for the browser step. Open the official approval link and personally complete browser approval. Fleet verifies sign-in with `gh auth status`; the helper decision is a separate setup outcome.

Choosing No preserves successful sign-in with `gitSetupState: declined` and does not run helper setup. Yes or explicit default Enter permits actual `gh auth setup-git` and its configuration readback. A setup problem remains `gitSetupState: error` with `GIT_SETUP_FAILED`; verified sign-in is not relabelled as an authentication failure.

The credential store must be verified on the worker's service identity. An unexpected plaintext storage fallback requires explicit protected recovery; it is not secure-storage proof.

## Remote pairing

After Codex login, start remote control and request a manual pairing code. Use it in the supported client before expiry. Issuing a code does not prove that another client has connected. Keep issued, expired and verified-connected states distinct.

## Privacy and recovery

Links and one-time codes stay in the active authenticated setup panel. They never enter general operation history, event streams, exports, diagnostics or documentation captures. Cancel closes the owned authentication process; expiry requires a new flow. Signing out of Fleet and revoking a provider account are different operations.

Next: [dispatch coding work](tasks.md).

## Session-bound controls and compatibility

Use only the actual `sessionId` and prompt `promptId` returned by the worker. Choice requests contain `{ sessionId, promptId, action: "choose", choice: "yes" | "no" }`; explicit Enter requests contain `{ sessionId, promptId, action: "enter" }`. No raw keyboard text or line-break injection is accepted. Unsupported prompts have no active input control. Cancellation requires `?sessionId=<actual-uuid>` and checks the returned cancelled identity. A stale session or prompt is HTTP 409 and requires fresh state.

A worker missing the structured `sessionId`, `prompt` or `gitSetupState` fields is explicitly update-required before authentication mutation. The controller never invents identities or falls back to the old raw-input protocol. Clear earlier transient responses when the flow changes, restarts, cancels or loses Fleet authentication. Codes, prompts and authentication response bodies must not be saved as examples, logs, exported environments or general history. Local protocol checks do not establish live provider login, native prompt interaction or secure-store acceptance.
