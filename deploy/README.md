# Shared HTTPS hosting and desktop delivery

The browser and Windows desktop client use one authenticated service and PostgreSQL database. The desktop client never receives cloud credentials. It opens a user-selected HTTPS origin, keeps TLS verification enabled, denies permission requests and limits external links to official provider documentation and consoles.

## Build and package

Run `build.bat /s` to acquire supported Node/.NET tools and project dependencies, build the Windows worker and build all workspaces. Run `build.bat --run` to build and then open the desktop client. Run `build-installer.bat /s` to build the same payload and create the unsigned genuine Squirrel.Windows `Setup.exe`, complete `.nupkg` and `RELEASES` files under `apps/desktop/release/`. The installer entrypoint also publishes the self-contained single-file Windows x64 worker to `release/worker/Fleet.Worker.exe`. Both entrypoints accept `--silent` or `SILENT=1`, preserve child failures and use user-scoped checksum-verified official Node and .NET SDK archives when supported tools are absent. Node 22.16.0 and .NET SDK 8.0.424 are the bootstrap pins. An existing compatible installation is reused. No machine PATH changes or administrator rights are needed for this route.

The desktop setup screen stores only the service origin in its local application data. Sign-in happens inside the service; cookies remain managed by the isolated desktop session. The Connection menu returns to address setup. HTTP addresses, embedded credentials and certificate exceptions are not supported.

Portable Node and .NET build tools share `%LOCALAPPDATA%\DingDingProjects\SlopMachineFleetBuildTools`, outside the Squirrel-owned application installation. The scripts reject cache paths inside that installation, normalized traversal into it and linked cache directories. They do not select old installation-contained runtimes from PATH, copy an old cache automatically, or delete or move existing installation data. Existing valid independent runtimes and checksum-verified downloads remain reusable. Cache resolution itself leaves PATH unchanged; a bootstrapped runtime is added only to the current build process.

## Host on the LAN

1. Install and start a supported Docker engine with Compose v2. The hosting entrypoint reports missing engine support and exits without changing other containers. Automatic engine installation and the portable setup/build GUI are not implemented by these scripts.
2. Copy `.env.example` to `.env`. Set `FLEET_HOST` to the actual LAN-reachable hostname or IP and `FLEET_IMAGE` to the published immutable `sha-<source commit>` tag or digest. The example address is a placeholder, not a verified endpoint. Match `FLEET_HTTPS_PORT` to the intended host port.
3. Run `host.bat --detached`. The script creates protected local random database and initial-setup authorization files in `.local/`, pulls published images, starts Compose, waits for readiness, and checks the actual LAN HTTPS health endpoint. Keep `.local/` out of version control, backups with wider access, logs and chat. Preserve it across upgrades because it owns the database credential.
4. Caddy issues a local-CA certificate for the configured address. Export its public root certificate using `docker compose cp gateway:/data/caddy/pki/authorities/local/root.crt .local/fleet-root.crt`. Review its fingerprint locally, transfer it through your trusted channel and use your organisation's supported certificate-trust process on each client. The entrypoint never installs trust automatically or disables certificate checks. The first health check remains incomplete until trust is configured; rerun afterwards. Do not distribute Caddy private keys.
5. Open the full HTTPS address reported after successful health verification. Initial owner registration requires the one-time setup authorization from `.local/setup-code`, entered only in the protected setup interface. It is not printed by the scripts. Keep service setup and credential-entry flows separate from chat.

The published host port binds to LAN interfaces. Permit access only on the intended private network using existing network protections. Do not configure router forwarding or public exposure. Verify the same HTTPS URL from another intended LAN client before claiming cross-device reachability. A successful same-host check does not prove another device's routing or trust.

## Hosting modes and persistence

Double-click `host.bat` for a keyboard mode choice, or run `host.bat --logs`. Interactive mode refreshes service status and recent logs, supports Left/Right service selection, F to pause/resume following, and R/Q/Escape to return. Returning preserves all running containers. `--detached` returns after health verification. Stopping is separate: `docker compose stop`. Never use `down --volumes` for an ordinary upgrade because it destroys persistent data.

PostgreSQL data and gateway certificates are named volumes. Upgrades use the same Compose project and retained local configuration. Back up PostgreSQL using its supported database tools before schema-changing updates. Configure cloud worker enrollment separately through the service's documented configuration; default hosting does not grant cloud access or launch resources.

## Publication and verification boundaries

The release workflow runs on every branch and manual dispatch, builds an immutable source-tagged GHCR image, builds the Windows installer through `build-installer.bat`, and creates a unique normal release with a SHA-256/source manifest. It does not execute tests or lint. The workflow never reacts to its own release tags. Package visibility and registry permissions require actual readback before claiming public image availability.

Source implementation is not installed-runtime proof. Required remaining evidence includes real Compose pull/start, trusted LAN HTTPS from another device, first-owner setup, authenticated desktop navigation, current-host install/update/rollback and the dedicated portable build/setup companions. Missing evidence must remain explicitly unverified.
