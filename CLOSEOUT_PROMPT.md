# Worker authentication repair handoff

Continue from the preserved worker branch `ai/feature/20261103-fleet-worker`. This is source-only recovery work. The new authentication protocol is an inactive coupled candidate until the owning integration session incorporates and verifies the worker, service and interface together. That session owns default-branch integration, outgoing-history scanning, remote preservation, release and activation. This worker lane must not perform those actions independently.

## Exact source and review

- Immutable baseline: `1e7114ee79caf2a63e99532ec514ce3c511d005c`.
- Baseline reconciliation: `d97d7b001febc05c4b7cfe524e64eb49e440225d`. Preserve the baseline's version `0.1.2` and assembly-derived worker health version. Earlier worker history was retained.
- Pairing expiry repair: `fa7c9f0881b4d55109caee129445af91ab54d9c7`.
- Provider/session ownership repair: `38305a9b7a3b8690ef027f2f5c2944c04a103573`.
- Final structured prompt worker candidate: `2b4ed65d7a87032d4c199239b214ea1e5f50dda0`.
- Reviewed coupled service: `bdf71b02a21e7d7bd1e589514eeb21abaa2640a1`.
- Reviewed coupled interface: `46829537fad182333edee48a095dea2d62d02a50`.

The owning session reported that both independent worker review and exact coupled-contract review accepted those candidates. No additional worker repair was requested before this handoff.

## Implemented behavior

Expired pairing responses remain expired without dereferencing a missing expiry. Provider transitions retain one session owner, settle the predecessor and reject stale actions. Authentication uses structured session/prompt UUIDs and allowlisted choices or explicit Enter, with no raw input fallback. The supported GitHub CLI is pinned and verified as `2.96.0`; unknown versions or prompt forms remain incomplete. Authentication status, prompt data and Git credential-helper setup are separate. No preserves declined setup and never triggers a later setup command. Yes or its explicit Enter default permits setup followed by independent configuration readback.

The wire contract, compatibility breaks, privacy boundaries and pinned official source links are documented in `docs/features/workers/authentication.md`. New clients require actual `sessionId` and `prompt` properties. Legacy workers/requests must be rejected truthfully, never assigned synthetic identities or raw-terminal fallback.

## Checks and limits

On source `2b4ed65d7a87032d4c199239b214ea1e5f50dda0`:

- `dotnet run --project worker/tests/Pairing/Pairing.Checks.csproj --nologo`: PASS, 36 deterministic authentication consumer checks.
- `dotnet build worker/Fleet.Worker.csproj --nologo -v:minimal`: PASS, zero warnings and zero errors.
- `Bootstrap-Worker.ps1` PowerShell parsing: PASS.
- `git diff --check`: PASS.
- Pre-commit publication/source-currency checks: PASS.

The focused tests use command/time and terminal boundaries. They launch no login, native terminal helper, browser, daemon, account action, updater or cloud operation. They cover actual Run consumers, expired/future/malformed pairing JSON, cancellation, start races, stale IDs, ANSI/carriage-return chunks, consumed redraws, unknown prompts, synthetic sensitive-looking echo, No/default consent and setup readback. The broader historical native worker suite was not rerun during this repair.

No live account authentication, remote pairing connection, authenticated model turn, native prompt verification or cloud deployment is claimed. Status Hub privacy remained unverified; this lane made no private status writes. Generated outputs remain ignored. No remote push occurred in this worker lane.

## Next safe action

The owning integration session should preserve this exact branch tip after the outgoing-history and handoff scan, integrate the accepted coupled candidates, verify their combined build and contract checks, and retain all runtime gaps until authorized source-bound evidence exists. Use `HANDOFF.md` and `ROADMAP.md` for the broader product work beyond this bounded authentication repair.
