# Source-bound release versions

Every provider release derives one numeric version before compilation or packaging:

```text
product epoch.workflow run number.run attempt
```

The epoch is currently `0`. All three components are bounded to `0..65534`; run numbers and attempts must be positive exact integers. This conservative shared bound supports Windows version resources and .NET assembly versions without overflow. The actual next version is derived from authenticated provider metadata, never an estimated counter. A unique release tag remains a separate publication identity and does not make an equal-version Squirrel package an update.

## Provider identity and source overlay

`scripts/release-version-policy.json` binds the repository, workflow ID and workflow path. The identity job reads the actual run through `gh`, checks its source SHA, run number, attempt and branch against the build context, and emits one receipt for both the controller image and desktop delivery. Workflow recreation, counter exhaustion or stale metadata fails explicitly. Changing the policy requires review against existing accepted versions.

Desktop production archives only regular tracked files from the immutable source into an ignored build directory. It excludes operational directories and protected configuration. The version overlay updates product/workspace manifests, their known internal references and matching lock entries, plus worker assembly, file and informational metadata. Original checked-out source is not rewritten. External dependency pins remain unchanged. Documentation reads original immutable Git objects through an explicit source-root binding; generated content still uses the overlaid product version. Receipts distinguish the base versions/source from the derived build inputs.

The controller image applies the same receipt before dependency installation and compilation. Companions, renderer provenance, package metadata, worker metadata, manifests and update feeds consume that same version. This is a declared build overlay, not a claim that modified build inputs are a clean source checkout.

## Stable publication

Stable desktop publication has serialized ownership and rechecks the actual normal-release history immediately before publication. The check follows pagination, verifies stable source/tag ancestry and hashed update-feed metadata, and requires the candidate version to exceed the highest accepted stable version. Earlier channel-less main history contributes a conservative floor only; it does not become updater eligible. Inaccessible or malformed possible stable history fails closed.

An older run retried after a newer accepted run cannot publish as a newer stable update. Start a new workflow run when a new accepted delivery is required. Equal-version bypasses remain prohibited. Preservation releases remain normal releases on their separate channel and are never selected as accepted updates.

## Local builds and verification

`build.bat /s` and `build-installer.bat /s` retain the checked-in version when no provider overlay exists and write an explicitly non-publishable local receipt. A deliberate local packaging check can stage a known version with `node scripts/release-version.mjs stage-local 0.16.1`; this writes a separate overlay marked `publishable: false`, never authenticated provider evidence. Set `FLEET_SOURCE_ROOT` to the original checkout and `FLEET_BUILD_SOURCE` to its exact source SHA before invoking that staged root's entrypoint. Do not run the productive application as part of metadata verification.

Installer verification reads the actual full package metadata, update-feed filename, packaged application archive, worker/portable executable version resources, renderer bundles and companion metadata. Those results establish produced identity, not native installation, updater, browser, account or application-runtime acceptance. The updater retains strict newer-version comparison; a staging or provider publication receipt does not prove that an installed application was updated.
