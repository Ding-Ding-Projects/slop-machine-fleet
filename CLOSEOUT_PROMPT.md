# First-owner signup continuation

Branch: `ai/feature/20261103-first-signup`, based on reviewed main source `4ae49affbdec60359babd4bbd02311321493916f`. This isolated branch contains only the requested first-owner signup change and its directly related tests/documentation. It does not activate the separate pending worker authentication protocol.

## Preserved source

- `9dd0bada908c28f744f8452df0d037978ef08672`: atomic PostgreSQL owner+initial-session claim, username/password login, legacy password-only compatibility and password-verified one-time username adoption, conditional identity initialization, test fixture and API contract.
- `27a72cb818220ad72ab9afaedd4cd5961faa75fb`: empty-variable Postman examples and prepared signup wiki/article regression checks.

The first signup needs no host authorization code or dummy file. Only one concurrent claim can succeed. Later signup receives 409, and normal named login requires username and password. Existing owners without usernames keep usable password-only login until deliberate authenticated adoption; identity, password hash, sessions and scope are preserved. Passwords are never normalized or logged. Wrong username and wrong password return the same generic failure after password verification work.

## Verified evidence

The exact `cmd /c build.bat /s` passed at `9dd0bad`. The normal service suite passed 37 checks with one explicitly skipped opt-in PostgreSQL suite. The dedicated real PostgreSQL 16.11 run passed seven checks with zero failures/skips and complete required discovery. It used two independent service instances sharing an isolated database schema and verified exactly one owner and one initial session, transactional rollback on session-insert failure, no failure cookie, legacy adoption preservation, conditional identity initialization, Unicode handling, untouched password bytes and CSRF. The final documentation checks passed separately. Publication hooks passed with zero findings.

The fixture creates only a uniquely owned loopback container from an immutable official image digest, checks its server ownership marker before schema mutation, removes its isolated schemas/container and deletes temporary connection files. It does not touch the live controller database or create a live owner. No browser, updater, native helper, trust change, paid cloud resource or deployment action was performed.

Independent review and the final integrated UI/hosting acceptance remain the parent's responsibility. The final source-bound build result must be read from its exact receipt; the earlier build must not be relabelled for a later source revision. Existing large-chunk/dependency warnings remain, and prepared wiki content is not a claim of live publication.

## Next actions and deployment boundary

Preserve this final branch, run the parent's outgoing-history scan, review the signup source and integrate it with the separately assigned signup UI and hosting changes. Hosting should report signup availability after trusted HTTPS health, without retrieving a code or creating an account. Ordinary startup preserves old protected files and existing data.

The parent alone owns the explicitly authorized reset of the active application's data and deployment. Preserve the working URL, approved TLS identity, hosting credentials and unrelated projects. After reset/deployment, leave the live controller unclaimed for the human user. Never create that owner as a test. Keep private Status Hub writes held until owner-data privacy is established. No push or main change was performed by this lane.
