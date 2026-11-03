# Public documentation workspace

This workspace builds the task-led documentation companion for Slop Machine Fleet. It consumes complete source articles from the root `docs/` tree and the root README. See `../../docs/features/documentation/README.md` for behavior, privacy boundaries and unfinished acceptance.

Production builds must use the repository root `build.bat`; integration adds `@fleet/docs` to that entrypoint. `npm run dev --workspace @fleet/docs` is the local authoring route once the parent workspace registration exists. For an isolated checkout, install the workspace lockfile with workspace discovery disabled.

The optional `release.json` is accepted only after actual release verification. Its shape is `{verified:true,isDraft:false,isPrerelease:false,tag,sourceCommit,assets:[{name,size,sha256,url}]}`. Missing configuration disables download links. Never set `verified` merely to make a button appear.

Generated content and copied reference assets are ignored and regenerated from source. The deployment artifact is `dist/`, with base path `/slop-machine-fleet/`.
