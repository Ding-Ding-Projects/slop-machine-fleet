# Keep an installed Fleet client current

The Windows client uses Electron 39.2.7's built-in Squirrel.Windows `autoUpdater`. It enables automatic checks only when running as a packaged application from its expected `app-<version>` installation directory with an existing sibling `Update.exe`. Development and portable copies report that updates are unavailable.

Checks start after 12 seconds, or 20 seconds on Squirrel's first launch to avoid its installation lock, then repeat every four hours. The update strip and native Updates menu expose a manual check. Checks serialize; an in-progress native download never overlaps another one.

## Accepted channel and integrity

The application examines at most ten recent normal releases from the fixed product repository. It does not accept a release merely because it is normal or newest. Each candidate requires `source-manifest.json` with:

```json
{
  "updateChannel": "stable",
  "sourceBranch": "main",
  "source": "<full source commit SHA>",
  "version": "<numeric major.minor.patch>",
  "unsigned": true,
  "files": [{ "name": "RELEASES", "bytes": 123, "sha256": "<digest>" }]
}
```

The actual manifest also contains the full package's filename, byte count and SHA-256. A preservation release uses a different channel and is skipped. The updater verifies that the release tag resolves to the manifest source, following at most three annotated tags, and that the source is an ancestor of or equal to current `main` through the GitHub comparison API. Missing or inaccessible proof is never treated as acceptance.

The exact `RELEASES` bytes must match the manifest SHA-256. Its package filename, numeric version and byte count must match the manifest and published asset inventory. Valid candidates are ordered by numeric version. Only a strictly newer package is passed to native Squirrel, using its pinned release download directory rather than a mutable latest-download address. Squirrel performs its own package checksum verification against `RELEASES`. The application does not claim that it separately streamed and verified the package SHA-256, or that an unsigned package has a signature-backed publisher identity.

All metadata requests use HTTPS, restricted product/API/CDN destinations, bounded redirects, a 15-second per-request deadline and a 1 MiB response limit. The feed itself is limited to 256 KiB. Authentication headers and application session cookies are not sent. Raw native errors, release-note bodies and signed CDN URLs never enter renderer update state or logs.

## Finish work before restarting

The persistent ready strip names the exact downloaded version, links to its validated release notes and warns that the package is unsigned. It becomes ready only after the native downloaded event matches both the pinned feed and exact expected version. Later leaves the client running and the update ready. A small local recovery note records staging, but that note is never trusted to manufacture a ready state after launch.

The parent workspace must mount `DesktopUpdates` with complete safety properties: `authenticated`, `reachable`, `activeTasks`, `pendingWrites` and `dirty`. Unknown values block restart. These must include all active tasks, queued or in-flight mutations and drafts from both visible and unmounted workflows. The component reports this state every two seconds. Main requires a report no more than six seconds old and invalidates it on navigation or renderer loss.

Restart requests first require a safe workspace, then open a native confirmation with Later as the default. Main rechecks safety, navigation generation and the same ready candidate after confirmation before calling `quitAndInstall()`. Native confirmation cannot be supplied through renderer IPC. The action restarts Fleet only; it never changes the computer's power or login state. A normal application exit and later launch can also apply an already downloaded Squirrel update, as described by Electron; Later is not a package rollback.

Electron exposes no native download cancellation API in this route. After five minutes the strip reports that native completion is overdue, retains the in-progress lock and permits a genuine terminal event to resolve the operation. It does not launch a competing download or claim rollback. Invalid packages and native errors remain explicit failures. Rollback is not implemented by this UI and requires the separately verified supported recovery route.

## Renderer integration

The isolated preload exposes only `read`, `subscribe`, `check`, `reportSafety`, `requestRestart`, `later` and `openReleaseNotes`. Main accepts calls only from the selected HTTPS Fleet origin's actual main frame. No call accepts a feed, URL, version, executable or arbitrary shell operation. Native menu actions use the same controller and safety checks.

```tsx
<DesktopUpdates
  authenticated={sessionIsAuthenticated}
  reachable={serviceStateIsFresh}
  activeTasks={anyActiveTask}
  pendingWrites={anyQueuedOrPendingMutation}
  dirty={anyUnsavedDraft}
/>
```

The example is an integration contract, not a claim that a caller's aggregation has been verified. The strip uses the shared translator and button components, wraps at narrow widths and retains a polite status region. Main confirmation supports English, Cantonese and bilingual text. State revisions prevent an older IPC reply from overwriting a newer event.

## Verification boundary

Focused source checks use synthetic events to test route restrictions, release bindings, version comparison, serialization, privacy, safety expiry, confirmation cancellation and changed-workspace rejection. They are not native installed-update evidence. Actual release feed availability, installed download, checksum rejection, keyboard behavior, unsigned signature readback, ready persistence, explicit restart, retained settings and rollback remain separate acceptance work.

Primary API references: [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater), [Electron update delivery](https://www.electronjs.org/docs/latest/tutorial/updates), and the [shipped 39.2.7 Windows updater source](https://github.com/electron/electron/blob/v39.2.7/lib/browser/api/auto-updater/auto-updater-win.ts).
