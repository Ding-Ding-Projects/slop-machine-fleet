# Sign in and pair a worker

Worker authentication happens under the same local account that runs its coding tasks. Each machine maintains its own credentials. Fleet does not copy another worker's login cache.

## Codex login

Start the guided device flow. The worker runs `codex login --device-auth`. Open the official browser link, enter the short-lived code and personally complete account approval. The setup panel shows waiting, expiry, cancellation and retry separately. Fleet verifies the resulting CLI login rather than inferring success from code issuance.

Device authentication may require permission in the account or workspace. An unavailable account capability remains an explicit incomplete state.

## Interactive GitHub CLI login

Start the GitHub connection flow. Fleet runs the genuine interactive `gh auth login` session on the worker and relays its prompts through a pseudoconsole. Choose the intended host and HTTPS transport, open the official approval link and complete browser approval. Fleet verifies `gh auth status`, configures the supported credential helper and checks access to the chosen repository.

The credential store must be verified on the worker's service identity. An unexpected plaintext storage fallback requires explicit protected recovery; it is not secure-storage proof.

## Remote pairing

After Codex login, start remote control and request a manual pairing code. Use it in the supported client before expiry. Issuing a code does not prove that another client has connected. Keep issued, expired and verified-connected states distinct.

## Privacy and recovery

Links and one-time codes stay in the active authenticated setup panel. They never enter general operation history, event streams, exports, diagnostics or documentation captures. Cancel closes the owned authentication process; expiry requires a new flow. Signing out of Fleet and revoking a provider account are different operations.

Next: [dispatch coding work](tasks.md).
