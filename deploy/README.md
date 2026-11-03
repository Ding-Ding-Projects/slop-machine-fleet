# Shared HTTPS hosting and desktop delivery

The browser and Windows desktop client use one authenticated service and PostgreSQL database. The desktop client never receives cloud credentials. It opens a user-selected HTTPS origin, keeps TLS verification enabled, denies permission requests and limits external links to official provider documentation and consoles.

## Build and package

Run `build.bat /s` to acquire supported Node/.NET tools and project dependencies, build the Windows worker and build all workspaces. Run `build.bat --run` to build and then open the desktop client. Run `build-installer.bat /s` to build the same payload and create the unsigned genuine Squirrel.Windows `Setup.exe`, complete `.nupkg` and `RELEASES` files under `apps/desktop/release/`. The installer entrypoint also publishes the self-contained single-file Windows x64 worker to `release/worker/Fleet.Worker.exe`. Both entrypoints accept `--silent` or `SILENT=1`, preserve child failures and use user-scoped checksum-verified official Node and .NET SDK archives when supported tools are absent. Node 22.16.0 and .NET SDK 8.0.424 are the bootstrap pins. An existing compatible installation is reused. No machine PATH changes or administrator rights are needed for this route.

The desktop setup screen stores only the service origin in its local application data. Sign-in happens inside the service; cookies remain managed by the isolated desktop session. The Connection menu returns to address setup. HTTP addresses, embedded credentials and certificate exceptions are not supported.

Portable Node and .NET build tools share `%LOCALAPPDATA%\DingDingProjects\SlopMachineFleetBuildTools`, outside the Squirrel-owned application installation. The scripts reject cache paths inside that installation, normalized traversal into it and linked cache directories. They do not select old installation-contained runtimes from PATH, copy an old cache automatically, or delete or move existing installation data. Existing valid independent runtimes and checksum-verified downloads remain reusable. Cache resolution itself leaves PATH unchanged; a bootstrapped runtime is added only to the current build process.

## Host on the LAN

Run `host.bat` for attended setup, or `host.bat --detached --non-interactive` for an already configured host. The entrypoint discovers and preserves the exact existing Compose project, verifies an accepted main release and immutable image, protects local configuration, backs up an existing database before updating services, starts the stack, handles current-user certificate trust through explicit native confirmation when needed, and verifies the real HTTPS endpoint. It reuses an already trusted exact gateway CA without importing it again.

Read [the complete hosting workflow](hosting-automation.md) for explicit project/source-directory selection, release pinning, LAN address configuration, trust options, backup and failure states. First-user username/password signup is performed by the user in the protected interface, never unattended by the entrypoint. No setup authorization is printed or requested from the user. Existing accounts, data and legacy protected files remain preserved.

The reported same-host HTTPS result does not prove another device can connect. Cross-device reachability remains separate evidence. No browser is opened automatically, no paid cloud resources are launched and no data-reset route is included.

## Hosting modes and persistence

Double-click `host.bat` for a keyboard mode choice, or run `host.bat --logs`. Interactive mode refreshes service status and recent logs, supports Left/Right service selection, F to pause/resume following, and R/Q/Escape to return. Returning preserves all running containers. `--detached` returns after health verification. Stopping is separate: `docker compose stop`. Never use `down --volumes` for an ordinary upgrade because it destroys persistent data.

PostgreSQL data and gateway certificates are named volumes. Upgrades use the same Compose project and retained local configuration. Back up PostgreSQL using its supported database tools before schema-changing updates. Configure cloud worker enrollment separately through the service's documented configuration; default hosting does not grant cloud access or launch resources.

## Publication and verification boundaries

The release workflow runs on every branch and manual dispatch, builds an immutable source-tagged GHCR image, builds the Windows installer through `build-installer.bat`, and creates a unique normal release with a SHA-256/source manifest. It does not execute tests or lint. The workflow never reacts to its own release tags. Package visibility and registry permissions require actual readback before claiming public image availability.

Source implementation is not installed-runtime proof. Required remaining evidence includes real Compose pull/start, trusted LAN HTTPS from another device, first-owner setup, authenticated desktop navigation, current-host install/update/rollback and the dedicated portable build/setup companions. Missing evidence must remain explicitly unverified.
