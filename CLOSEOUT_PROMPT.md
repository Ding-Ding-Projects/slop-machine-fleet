# Release identity and packaging continuation

## Current bounded objective

Verify the provider desktop/release outputs for integrated source `4ae49affbdec60359babd4bbd02311321493916f`, preserving the source-bound version, actual package metadata and generated-output privacy boundaries. The parent owns main integration, publication decisions and the independent image/Compose verification. Do not duplicate image pulls or launch an installed updater, configuration helper, browser, account flow or trust change.

## Source units

The delivery branch is `ai/feature/20261103-fleet-delivery`. The reviewed implementation sequence is:

- `3aa13fec787e219a376529d682eaea3d9f8cae7a`: reconciliation with immutable main baseline `4c2357d981c774d780a625962648d17ec24e1ddd`.
- `0002e704d4841140f6ecf8f03d44769e223ac886`: bounded version derivation, workflow policy and explicit tracked-source overlay.
- `0d39e061ec223a021f877f7df81be7d3180b32a9`: internal dependency/lock consistency and stable publication-history checks.
- `0d61535e8fd923246a8ff62b13c9fb7537527e92`: shared producer wiring and actual produced-version verification.
- `590078492eafc3a4a9d10c865f68095809f8dd51`: image copy ordering and compiled image identity correction.
- `9062d3f2b58443fda58ef52b240a11d265549d5c`: explicit source-receipt priority, strict updater boundary regression and hosted-documentation separation.
- `f2a2f6f597bf534966bf3322b87d349a83066405`: generated archive privacy, supported worker debug/path options, unpacked exact configuration script and enforced actual unsigned-file checks.

Independent source review accepted the bounded implementation and packaging correction. No authentication UI or backend behavior was changed by this delivery lane.

## Actual local packaging proof

The exact staged root `build-installer.bat /s` completed with exit `0` at source `f2a2f6f597bf534966bf3322b87d349a83066405`. It used explicit local overlay version `0.16.1`, marked `publishable: false`. This is local packaging proof, not an authenticated provider release.

- `Setup.exe`: 134346240 bytes, SHA-256 `6664b177240eebf09f4b3507e2f5e14a703d22bac96dafcd7269b8c62f998cca`.
- `SlopMachineFleet-0.16.1-full.nupkg`: 133608106 bytes, SHA-256 `9dc310de4ebe1a3433a8fd8e49ae90df0fe334be2d529c970d0293042f66c03c`.
- Actual package metadata, feed, application archive, worker and portable version resources, renderer bundles and companion metadata agree on `0.16.1`.
- All five selected project release executables actually reported `NotSigned`, with no signer certificate. This does not claim signer-process auditing.
- The rebuilt managed worker has only reproducible debug type `16`; no CodeView or embedded-PDB entry and no generated PDB files. Known current machine/staging markers were absent in the executable and managed output.
- Actual final portable archives preserve all required runtime files. Their unpacked configuration script matches unchanged source bytes and its generated inventory/hash. Static extraction inspected the final portable files without executing them.
- The generated-output scan inspected 124 metadata, renderer, archive, worker and actual package-member records with no unresolved findings in its bounded scope. A protected-value pattern in the vendor executable matched the unmodified Electron 39.2.7 archive, whose SHA-256 matched the official release checksum. No matched protected value was printed.
- The original local `5900784` evidence remains preserved separately and is not publication-safe: it identified absolute builder-output metadata and the worker CodeView path. It is not relabelled as repaired proof.

Owner-retained evidence receipt identifiers, without machine paths:

- `f2a2f6f-generated-privacy.json`: SHA-256 `ada43ff7c2396d09e00a4c4b14965dfc6bfc28ccd3ef0a3ea78cbc091b14e0d3`.
- `f2a2f6f-portable-static.json`: SHA-256 `419cea0b6e2b3c036f5c9e285336809fe136602e161a866a3c0b26298f9895e6`.
- `f2a2f6f-portable-asar.json`: SHA-256 `dbe35849cf3a2344750fdd86a33d0a9ecd5d43508d66416a3bbfa18c72998fe5`.

Twenty-two focused Node checks and the Windows PowerShell unsigned-status fixture passed. Source/overlay tests include a real offline npm workspace restore, stale/equal version rejection, unknown identity-field rejection and failure before configuration replacement when script integrity is invalid.

## Provider snapshot at 2026-11-03 16:26:08 UTC

The remote main reference read back as `4ae49affbdec60359babd4bbd02311321493916f`.

- [Release workflow 41673470590](https://github.com/Ding-Ding-Projects/slop-machine-fleet/actions/runs/41673470590): identity and image jobs succeeded; desktop installer production remained in progress. Authenticated workflow ID `405397166`, run number `24`, attempt `1`, source `4ae49affbdec60359babd4bbd02311321493916f`. The committed policy maps those inputs to expected version `0.24.1`; actual normal-release manifest and package readback remained pending.
- [Publication privacy 41673470682](https://github.com/Ding-Ding-Projects/slop-machine-fleet/actions/runs/41673470682): terminal success at that exact source.
- [Documentation 41673470426](https://github.com/Ding-Ding-Projects/slop-machine-fleet/actions/runs/41673470426): in progress, not claimed deployed by this lane.

The desktop/release observation began at approximately 16:24 UTC and is bounded to one hour with increasing observation intervals of at most 60 seconds. Read terminal state and actual uploaded manifests/packages before reporting publication success. The parent independently verifies image digest and the task-owned Compose stack.

## Required remaining evidence and preserved boundaries

1. Verify provider desktop terminal result, actual normal release classification, unique tag/source association, exact derived version and attached file sizes/hashes.
2. Read actual provider identity, produced-version/signature/privacy receipts and package/feed metadata; do not infer them from local fixture results.
3. Keep the accepted stable-version guard strict. Preservation releases remain normal releases but are ineligible for accepted updates and documentation deployment.
4. Keep hosted documentation's reviewed source and checked-in version separate from the independently selected accepted-download version. Packaged documentation companions consume the common release overlay; the separate hosted workflow does not.
5. Direct local container builds without a provider derivation receipt are unsupported by this route. No local container/runtime acceptance is claimed from source checks.
6. Native updater download/application remains stopped after the earlier rejected operation. The prior installed-runtime baseline was not reverified by this lane. Do not retry through another helper or transport. Browser and trust-related limits remain unchanged.
7. Preserve original local evidence and both explicit build overlays until the parent has archived or otherwise retained the needed proof. This lane does not delete branches, source directories or unrelated state.

## Earlier project context retained

The following parent-owned context is retained verbatim for recovery and is superseded only where the scoped evidence above explicitly provides a newer result.

# Fleet continuation

## Generated-payload repair and release readiness

The local integrated candidate is `16ce22da61de992a3503d3b916ab4bc06e470816` before this handoff update. Its exact root build passed, as did17 selected release/payload checks and the actual unsigned-status negative fixture. Nine outgoing revisions passed the complete publication scan. It includes the reviewed packaging repair `f2a2f6f` and the compatible count-limit correction; the larger authentication/Base64 candidate remains isolated.

Fresh exact staged `build-installer.bat /s` at source `f2a2f6f597bf534966bf3322b87d349a83066405` completed successfully with local0.16.1, explicitly nonpublishable. Actual package/version/archive/worker-debug checks and all five unsigned-executable checks passed. Setup is134346240 bytes, SHA2566664b177240eebf09f4b3507e2f5e14a703d22bac96dafcd7269b8c62f998cca; full package is133608106 bytes, SHA2569dc310de4ebe1a3433a8fd8e49ae90df0fe334be2d529c970d0293042f66c03c.

The bounded fresh scan covered124 actual package members, receipts, renderers, archives and worker records with zero unresolved findings. Generated builder configurations are excluded; known local machine/staging markers are absent. The worker has no CodeView or embedded-PDB debug records and no published PDB. All three portable files were statically extracted: their runtime archives match verified archives and their unpacked configuration helper matches the unchanged source hash. No helper, application or updater was executed. The unchanged vendor pattern matched the verified official runtime baseline and did not establish a project credential.

Provider publication is now ready for the next source push and actual workflow readback; local package proof must not be relabelled as provider or installed-update proof. The deliberate preservation-release documentation skip now has actual provider evidence: run41670431867/source0d39e06 succeeded in resolve and skipped refresh-main, build and deploy, with an explicit preservation-channel reason. The older failed tag-bound run remains historical evidence.

## Release-identity integration checkpoint

The reviewed release-version correction is integrated locally through `dba64a5`, followed by the independent documentation-label change at `a22facd`. Provider releases derive one bounded numeric version from authenticated workflow/run/attempt identity, apply an isolated tracked-source overlay before producers, and require a strictly newer accepted stable floor immediately before serialized publication. Equal/older updater exclusion remains intact. The original checked-in version is not silently rewritten.

Actual local `build-installer.bat /s` completed at delivery source `590078492eafc3a4a9d10c865f68095809f8dd51`, using explicit nonpublishable local version0.16.1. Readback verified package nuspec/feed, desktop archive, worker and three companion executable versions, embedded renderer versions and source identities. Setup is136696320 bytes, SHA2564f149a3b75ca93e7e20dac007c80ea72e42f9d27a4c90effd5e4f6eb9f7f0bf9; full package is135957590 bytes, SHA256a89fccf86758881cc22ed145df49f86c87e42a0e912b8a01a5ed9bbab16f7d66. Later source-receipt/docs/test followup `9062d3f` has focused verification, not a relabelled package run.

The complete coupled authentication/bulk-interface/Base64 candidate is remotely preserved at `aa142d7a2e8cedd2c9978ba221eb36e280b5ce3f`. Its final build source is `c1fac0a`; source `23f0670` passed45 service,36 controlled worker-authentication,17 auth-interface and7 bulk-interface checks. All78 outgoing revisions passed privacy scanning. The candidate remains inactive on main because browser/native acceptance is unavailable. Separate worker and service refs are verified at `11bb88f` and `9947315`.

Documentation labels distinguish their own build/source/time from the selected download release/source. Baseline screenshots retain their original source and are no longer described as proof of later feature-evidence changes. Required-feature completion, fresh rendered evidence, live login/pairing/model turn, approved cloud provisioning and native update remain pending. Read back the next main push and authenticated provider release before upgrading this checkpoint's delivery state.

## Current continuation after recovery repairs

Main `4c2357d981c774d780a625962648d17ec24e1ddd` is pushed and read back. It includes the compatible expired-pairing consumer repair at `81e00ac` and durable bulk dispatch/reconciliation. Both integrated source revisions passed their exact root builds. The expiry consumer has ten controlled checks; the independently reviewed bulk candidate has37 service checks. Live provider reconciliation and GUI resume acceptance remain unverified.

The next source checkpoint enriches13 existing required-feature records with actual implementation paths, source-bound evidence and explicit remaining work. All115 identities remain and all13 edited items remain unfinished. Earlier screenshots keep source `c0544f7`; no later renderer acceptance is inferred.

Structured worker authentication is a coupled, inactive change: worker `2b4ed65`, service `bdf71b0` plus API/wiki/Postman followup `b61f1cb`, and the updated interface chain. Independent source review accepted the matching protocol. Worker checks total36; service checks total45; these overlap earlier counts and must not be summed. The isolated interface candidate `23f06700a7cad02b7e788404f5caf8eba59d6f51` is assembling the reviewed changes with a fresh exact build. Confirm its later result and preservation ref before claiming completion. Worker handoff tip is `11bb88f`; service handoff tip is `9947315`. Parent owns their final history scans and remote readback.

A separate delivery repair addresses two different stable payloads both carrying package version0.1.2. The strict updater treats an equal version as current. Keep that comparison; derive and verify a distinct bounded release version consistently across all producers, then compare against accepted stable history before publication. Native updater execution remains blocked. Preservation release `build-41661384621-1` succeeded, but documentation run41664391903 failed because its older tag-bound resolver rejected the preservation channel. That run does not verify the newer intentional-skip logic.

Do not activate the coupled authentication protocol without its matching consumers or claim browser/native acceptance while those routes remain unavailable. Retain all isolated work, existing installations and evidence. No paid cloud worker, live login, pairing connection or model turn has been performed by these repairs.

## Latest checkpoint, superseding older pending states below

Main1e7114ee79caf2a63e99532ec514ce3c511d005c is pushed and read back. Each new worker and matching operation target now record the actual resolved launch image; absent historical facts stay null. Independent review accepted the repair. Source tree8b08f215a0337f00b6e4bcbeecf0cb56fdef6746 matches18c9df7 exactly, whose root build passed and30 service tests passed. The full outgoing-history privacy scan passed. Provider runs41660602078,41660602082 and41660602130 are not yet verified successful.

Normal0.1.2 releasebuild-41646405880-1/source4c0 has eight payload sizes/hashes and package/feed integrity verified. Installed0.1.1 remains the applied-and-verified baseline. The updater download operation was rejected before execution, with reason "blocked by policy". No updater ran. Browser use remains disabled in Work settings; do not retry either operation through another helper. Native trust awaits the existing user choice.

Base64 tools50ad71f has47 focused tests and an independent dry source review. The public documentation workspace and parser are combined on the isolated interface branch atc6d30ad42787f6b851516ae6a33fa93bd1730618: exact root build passed,47 tools and18 documentation tests passed, and four actual module graphs excluded protected application-state imports. These results do not establish browser OPFS, clipboard, navigation, audio or lifecycle acceptance. No Base64 interface activation on main is authorized by these source results. Read back newer branch preservation before claiming it pushed.

Bulk restart/reconciliation is under bounded source audit. Preserve concrete findings and independent refutation separately. The complete product goal remains unfinished: real approved cloud provisioning, bootstrap, login, pairing, model turns, native update, both hosting modes and full required-feature/runtime acceptance are still pending. No paid resource was launched. Status Hub owner-data privacy remains unverified; no private writes are claimed.

Objective: deliver the isolated Windows Server2025 EC2 coding-worker fleet with shared desktop/browser management, Slop Machine device login, interactive GitHub CLI login, remote pairing, coding tasks and bulk lifecycle controls, plus all applicable required features.

Main95872c98c13ab7564760e24fbcbdd553d0d3ce3d was pushed and read back. Its exact root build passed with148 complete documentation articles. The next local candidate is0.1.2, needed for a genuine update pair from the accepted installed0.1.1. Review HANDOFF.md and ROADMAP.md for the full evidence and remaining work.

Verified: published and pulled source939 immutable image; actual tracked Compose startup; certificate-verified cross-LAN health with no-SNI certificate selection repaired and wrong-IP checks still rejected; accepted normal stable/main0.1.1 release and all8 payload hashes; actual supported0.1.0-to0.1.1 Squirrel Setup upgrade, installed bytes, native launch and keyboard focus; external-cache preservation with exact legacy-cache restoration; focused browser feature/article, encoded authorization, tab, draft, Settings-focus and neutral-wording workflows.

Incomplete: approved native HTTPS trust, both host modes, actual automatic-updater states, signer-process audit and setup exit status, fresh screenshot promotion/full layout matrix, live documentation and About homepage, forge-wiki initialization, real cloud provisioning/account login/pairing/model turn and the rest of the115-entry required-feature inventory.

Documentation workflow41625691315 failed at a handled optional wiki probe's residual native exit1. Its focused repair and real TLS regression are integrated locally. Preserve the exact technical source receipts and require the complete outgoing-history scan before the next push. Protected policy data stays outside public source; no private wording was transmitted. Fresh source-bound UI evidence must begin and end on the same source revision.

Continue the authorized independent work while the native certificate-route choice is pending. Do not alter trust without that choice, launch paid resources without exact review, expose protected values, force-push, discard unfinished work or claim complete delivery. Preserve every result's actual source and artifact identity.

## Current preserved milestone for the next source checkpoint

Five sourcec0544f7 browser screenshots passed complete promotion checks and are staged with exact inventory and README links. The initial live documentation148-article content, source hashes, fonts and eight download records passed HTTP/source verification; the exact About homepage is stored and read back. Live interaction/persistence/keyboard/accessibility/narrow proofs remain unavailable.

The version-label fix reads the actual package manifest. The release-refresh correction now uses a reviewed immutable source in a main-ref child without expanding environment permissions; its provider result is pending. Base64 streaming work and its independent repair loop remain isolated and unactivated. Preserve and verify this documentation milestone before integrating any later UI work. Keep the private raw capture/build receipts and exact-byte archive; do not replace unavailable runtime proof with source checks.
## Verified 0.1.2 delivery milestone

Main4c0bc037bfafcaf9bed7ab2bcb278f15fe762b4b is published. Build/release41646405880, publication privacy41646405896 and the main documentation deployment succeeded. The release-parent refresh41649088811 dispatched a main-ref child41649149159 successfully; the parent skipped deployment and the child deployed under the unchanged main-only environment rule.

The live documentation now identifies source4c0 and version0.1.2. All149 unique articles match their declared hashes and normalized source blobs; nine prepared wiki pages are bundled. All five promoted screenshots return HTTP200 and match their source inventory byte-for-byte, retaining capture sourcec0544f7. Original font assets match, all eight download records match the selected normal releasebuild-41646405880-1/source4c0, and the exact About homepage is verified.

The downloaded0.1.2 release passed all eight payload size/SHA256 checks, RELEASES SHA1, full-package CRC/path/identity checks and five NotSigned observations. Signer-process audit and native automatic-updater UI proof remain unverified. Installed0.1.1 remains the last applied-and-verified baseline; a supported non-GUI download-only staging operation is assigned separately and must not be reported as applied.

Base64 streaming source is preserved on its owned branch at3d3eaed79b44022bb6b2e635b4a89596be42327a with all four findings independently repaired. Root workspace/dependency build integration is continuing in that isolated branch. It has not been activated on main. Actual browser OPFS, IndexedDB, clipboard/media/sound and lifecycle acceptance remains pending.

Browser controls are unavailable in this verification environment. Continue authorized source, build, package and HTTP work; do not relay rejected browser actions through alternate tooling. Native HTTPS trust also awaits the explicit user choice. All remaining required-feature, cloud-account, live worker authentication/pairing/task and full layout duties remain incomplete.

## Preserved Base64 branch and stopped staging

The reviewed Base64 workspace is now preserved on ai/feature/20261103-local-tools at8fd472a947f5021ad23a66e1adcc7155f2a118a7, with exact remote-ref readback. Its complete17-revision outgoing history passed the trusted publication scan after one narrowly reviewed historical test-data allowance. The exact build entrypoint passed and41 tools tests passed. GUI acceptance remains pending; this branch is not activated on main.

The assigned non-GUI updater download was rejected by automatic approval review before process creation, with reason blocked by policy. No updater ran and no package was staged through that route. Installed0.1.1 remains preserved; baseline RELEASES and package bytes were copied and verified before the rejected launch. Do not retry that operation through another route. Continue independent source and delivery work while the required interactive environment and certificate choice remain pending.
