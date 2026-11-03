# Isolated authentication and bulk-recovery handoff

## Current candidate

The candidate is preserved on `ai/feature/20261103-fleet-interface`. It has not been integrated into or activated on main by this lane. Browser, native interactive authentication and updater acceptance remain unverified.

- Recovery baseline: `4c2357d981c774d780a625962648d17ec24e1ddd`, merged as `6568164`.
- Reviewed worker ownership and structured protocol: `38305a9` and `2b4ed65d7a87032d4c199239b214ea1e5f50dda0`, merged as `f20a9f2`. Existing pairing-expiry behavior and checks remain preserved.
- Reviewed service relay: `bdf71b02a21e7d7bd1e589514eeb21abaa2640a1`, plus API/Postman/prepared-wiki follow-up `b61f1cb374d1930aa94861117ce53451229b8684`, merged as `c107b7f`.
- Authentication UI units: `a1493d1`, `96ac366`, `591f6a6`, `4682953`, `bd2e231`. These are separate from Base64 activation. The intermediate acknowledgement predicate was corrected in `4682953`; use the complete chain.
- Bulk UI units: `5b15f6f` and `23f0670`, depending on the accepted durable bulk contract `54b47a3` already present in the recovery baseline.
- Count-control correction: `c1fac0af253e9ffc5e415aeaba3135cddda8607e`, maximum five, minimum one, existing review invalidation preserved.

## Behavior implemented

Authentication renders only recognized structured GitHub prompts and explicit Yes/No/Enter actions, with real session and prompt identities. Successful input acknowledgement triggers a guarded same-session status read. Old raw input and terminal transcript rendering are absent. Legacy workers are read-only or explicitly update-required; no identity is guessed. Device codes remain transient, hidden until revealed, and expire according to actual provider metadata. GitHub login and Git credential-helper setup are distinct: choosing No may leave login verified with setup declined.

Bulk recovery reads the actual durable operation ledger, reviews selected original targets, and submits the original request hash. Only pending or blocked targets proven never dispatched with a null attempt are eligible. Requested, completed, uncertain, attempted and legacy targets cannot be replayed. A failed or unavailable result invalidates the displayed ledger until a fresh read. The service still rechecks ownership, task activity and current configuration.

## Verification binding

Exact `cmd /c build.bat /s` passed for coupled source `23f06700a7cad02b7e788404f5caf8eba59d6f51`. Focused checks on that source passed:

- 45 service tests.
- 17 authentication UI contract checks.
- Seven bulk UI checks.
- 36 controlled worker authentication consumer checks, using injected fake provider runtimes rather than real sign-in processes.

After the one-field count-control correction, exact `cmd /c build.bat /s` passed again for final source `c1fac0af253e9ffc5e415aeaba3135cddda8607e`. The focused-check inputs above were unchanged by that correction; their original source binding is retained rather than relabelled.

The final generated documentation records source `c1fac0af253e9ffc5e415aeaba3135cddda8607e`, version `0.1.2` and build time `2026-11-03T15:33:25.722Z`. Four actual production module graphs were inspected; both storage graphs use the public adapter, and forbidden application-state modules are absent.

| Final built asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `apps/web/dist/assets/index-DpcuGA2d.js` | 628216 | `d7a9adf615cd78434d0c735e1bfc54cca464cff1ddb33ba7d299859a8f79f638` |
| `apps/docs/dist/assets/index-Cltj239l.js` | 696807 | `bc0132c2e8eedc3e3e983c7d0f4c41d35ab5d90c34479109537fcb3786629505` |

This handoff-only commit does not change the build's source identity. Existing large-chunk warnings remain. The generated documentation retains 152 complete articles and the five previously preserved image references; those images are not acceptance evidence for the new authentication or bulk flows.

## Next permitted steps and limitations

The integrating owner should preserve the candidate and its full history, retain the compatible active protocol until coupled activation criteria are satisfied, and use new source-bound evidence for any later build. Genuine interactive GitHub authentication, browser navigation, native input, bulk provider operations and updater behavior were not exercised. No browser, GUI helper or updater was launched; no trust or provider configuration was changed; no private status write, publication or remote push occurred in this lane.

Full required-feature acceptance remains incomplete. Do not infer runtime success, deployment, a release or main activation from compilation and controlled checks.
