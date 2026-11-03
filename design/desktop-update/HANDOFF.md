# Desktop update interaction handoff

The installed Fleet client gains one persistent update strip within its working workspace, plus a native Updates menu. It never replaces the workspace with a download page. The strip shows the current version, actual state, exact available version when known, release notes and the unsigned-package warning. English, Cantonese and bilingual labels are supplied through the owning web application's translator.

## States and actions

States are unavailable (development, portable, absent Update.exe or missing feed), idle, checking, downloading, current, failed, ready and restarting. Checking starts automatically after startup, waits through Squirrel first-run locking, and repeats on a bounded schedule without overlapping operations. Manual Check uses the same path. Ready persists visibly until restart or supersession; Later keeps the package staged and never calls quit. Stored state is only a recovery hint, never evidence of a new download.

Restart opens a native confirmation naming the exact version and unsaved-work consequence. The safe default is Later. Main-process installation requires a recently reported same-origin workspace safety state with no active task or unsaved draft, rechecked after the native confirmation. Unknown, stale, disconnected or busy workspace state blocks restart. Renderer IPC cannot supply an executable, feed, version, URL or arbitrary operation. Navigation invalidates safety state. This restarts the application only, never the computer.

## Trust and update transport

Only packaged Windows clients with the expected installed layout and existing Update.exe enable the real Electron autoUpdater. HTTPS release metadata comes from this product's fixed public GitHub release path, is bounded and parsed before the native Squirrel check, and supplies the exact package version and release reference. Squirrel remains responsible for its RELEASES package checksum verification. Unsigned delivery is stated honestly, never described as signature-authenticated. Missing or malformed metadata is unavailable or failed, never current.

Device sign-in browser navigation allows explicit official OpenAI authentication and GitHub device/login routes. HTTPS, exact hosts, no embedded credentials and bounded URLs apply. Authentication URL queries are never logged or reflected into updater status. Other external destinations keep their existing explicit allowlist.

## Accessibility and acceptance

The strip uses a named region, persistent polite state announcements, labelled actions, visible keyboard focus and wrapping content. Notes open only the pinned validated HTTPS release route. Normal and minimum viewports, three language modes, light/dark themes and scale matrix remain runtime acceptance items. Source tests cover URL binding, state transitions, concurrency, stale workspace safety, late results, corrupt metadata and failed operations. They never substitute for real installed update, download, restart, rollback or signature inspection.

API reference reviewed: https://www.electronjs.org/docs/latest/api/auto-updater and https://www.electronjs.org/docs/latest/tutorial/updates. Native behavior must also match the shipped Electron version, 39.2.7.

## Independent review amendments

The independent review permits the bounded strip and requires an accepted main channel rather than generic latest-release selection. Parent confirmed `updateChannel: stable`, `sourceBranch: main`, numeric desktop version, full source SHA, `unsigned: true` and exact file inventory. The implementation scans at most ten recent normal releases, skips preservation, verifies feed/package consistency, resolves the actual tag through a bounded annotated chain and verifies source ancestry on main. Safety reporting includes service reachability and all pending writes as well as authentication, active tasks and drafts; unknown remains blocked. The actual supported device routes are plain `/codex/device` and `/login/device`, with no query parameters.
