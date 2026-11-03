# Public documentation workspace

This workspace builds the task-led documentation companion for Slop Machine Fleet. It consumes complete source articles from the root `docs/` tree and the root README. See `../../docs/features/documentation/README.md` for behavior, privacy boundaries and unfinished acceptance.

Production builds must use the repository root `build.bat`; integration adds `@fleet/docs` to that entrypoint. `npm run dev --workspace @fleet/docs` is the local authoring route once the parent workspace registration exists. For an isolated checkout, install the workspace lockfile with workspace discovery disabled.

The optional `release.json` is accepted only after actual release verification. Its shape is `{verified:true,isDraft:false,isPrerelease:false,tag,sourceCommit,assets:[{name,size,sha256,url}]}`. Missing configuration disables download links. Never set `verified` merely to make a button appear.

Generated content and copied reference assets are ignored and regenerated from source. The deployment artifact is `dist/`, with base path `/slop-machine-fleet/`.

## Local Base64 workspace

`#/base64` opens the actual reusable Base64 workspace from the tool package. It is reachable from the main navigation, the task-oriented home link and the Ctrl+Shift+F command catalog. Text, file, streaming, verification, history, preview and export controls use the existing implementation rather than a second codec.

The public surface supplies its own preference adapter. Language, theme and reduced motion stay visitor-owned; tool outcome sounds, volume and low-stimulation settings have actual consumers in the shared tool. No authentication, controller connection or personal-wording code is used.

### Storage and bundle boundary

- Public history uses IndexedDB `fleet.docs.base64.history.v1` through the existing injectable history factory.
- Temporary streaming data uses OPFS `fleet-docs-base64-v1/fleet-base64-v1` and Web Locks prefixed `fleet.docs:`. Acquisition, worker sinks, verification reads, abort/removal and retained cleanup all route through the public adapter.
- Main and worker builds use the same fail-closed isolation plugin. It still rejects `apps/web/src/preferences.tsx`, `wording.mjs` and `api.ts`; it additionally rejects direct unscoped history/storage imports.
- Production builds emit sanitized module inventories. Run `node apps/docs/scripts/verify-public-bundle.mjs` after the exact root build to inspect the actual main and worker graphs. No absolute local paths enter those inventories.

### Navigation and recovery

Known-clean work can leave immediately. Unknown or pending tool state blocks internal navigation. Dirty work requires two independent confirmations and a full confirmation slider, then navigation waits for actual known-safe cleanup. A timeout keeps the workspace mounted and reports incomplete cleanup. Browser unload uses its native unsaved-work warning; the browser controls that prompt. Global documentation search does not unmount an active Base64 workspace. In-app hash links, browser history navigation and command selection share the guard.

### Verification limits

Focused checks cover real storage namespace separation, same-ID collision negatives, actual shared sink/removal behavior, scoped history, forbidden-module rejection, missing worker-adapter rejection, dirty navigation and cleanup timeout. No browser launch, rendered interaction, audio-device proof or visual acceptance is claimed. OPFS, Web Locks, clipboard, available quota and media capabilities retain the tool's explicit unavailable states. Full required-feature and complete regex acceptance remain unfinished.
