# Start or update the preserved Fleet host

Run `host.bat` from the source directory. The attended path selects an existing deployment, requests any missing LAN address and offers detached or interactive logs. It resolves a verified accepted release, pulls the source-bound controller image, preserves configuration and existing database data, starts the exact Compose project, verifies running source/version, handles current-user certificate trust and checks the actual HTTPS endpoint.

The script never launches paid cloud resources, creates an owner account, opens a browser, resets a database, stops unrelated containers or changes machine-wide certificate trust. Starting containers and creating an owner are separate operations. The first person uses the protected username/password signup interface after hosting is ready.

## Select the exact deployment

```bat
host.bat --detached --project my-existing-fleet --project-directory "C:\path\to\fleet"
host.bat --logs --project my-existing-fleet --release build-123456-1
```

`--project-directory` selects the existing Fleet source/configuration directory when the entrypoint is run from another checkout. Every Compose call carries its explicit Docker context, source directory, environment file, Compose file and project identity. Existing container labels identify the project for that directory. Ambiguous matches, a foreign project directory or unverifiable ownership stop before service changes. With no existing deployment, an attended run asks for a deliberate new project name; unattended first deployment requires `--project`.

The script retains `.env` settings, `.local/`, named database/certificate/controller volumes and existing accounts. Existing database authorization is never regenerated. Missing credentials or configuration for an existing database require restoration. A project identity must not be changed merely to get a fresh database. No reset option is provided.

## Release and image proof

Use `--release <tag>` to select a particular accepted normal release. Otherwise the script examines at most ten recent releases and selects the highest verified stable version. It requires stable/main source metadata, matching worker version/asset hashes and sizes, actual tag-to-source resolution and ancestry on current main. Inaccessible or inconsistent metadata remains incomplete.

The source-tagged image is pulled first. Its repository, source and version OCI labels must match the accepted release, and it must resolve to one immutable product digest. The digest is written to the managed `FLEET_IMAGE` setting. Before accepting success, the running container image ID, embedded build identity, package version and compiled interface version/source must agree. An older candidate cannot silently downgrade an existing controller.

Docker Desktop and Compose must already be installed and the chosen engine available. Missing engine installation is reported clearly; this entrypoint does not start a privileged installer or an alternate engine. Registry authentication, if needed, stays with the existing supported local credential store. No credential is embedded in arguments or release URLs.

## Configuration and database preservation

Only `FLEET_HOST`, `FLEET_HTTPS_PORT`, `FLEET_IMAGE` and `COMPOSE_PROJECT_NAME` are managed in `.env`. Other keys remain. Replacements are prepared privately, compared with the prior contents and applied atomically with an exact prior backup in protected `.local/` storage. A concurrent edit stops replacement.

For an existing database or retained database volume, the script starts only the preserved database if necessary, then runs its supported `pg_dump` into a protected local file before updating controller services. A successful dump receives a separate receipt. This is backup-production evidence, not a tested restore. Configuration, worker metadata and public certificate predecessors are also retained. Backups are not automatically deleted, uploaded or placed in version control. No `down --volumes`, data reset or automatic rollback occurs.

## Current-user certificate trust

The exact public Caddy CA is exported from the selected gateway. Its validity and CA constraints are checked, and its SHA-256 fingerprint is compared with any explicit approval. An already trusted exact certificate is reused without another import or prompt.

For a new CA, an attended run displays the public fingerprint and requires a deliberate matching choice. It then invokes the normal current-user certificate utility without force or quiet switches. The user must answer the native Security Warning. The script never answers it, imports into the machine store or disables TLS validation. Cancellation, timeout or failed readback remains incomplete while containers are preserved.

```bat
host.bat --detached --trust-current-user --approve-ca <exact-public-CA-SHA256>
```

The fingerprint is public certificate identity, never an authentication value. It is not hard-coded into source. An unattended run cannot request new trust:

```bat
host.bat --detached --non-interactive --project my-existing-fleet --host fleet.lan --port 8443
```

This route succeeds only when all required configuration and exact trust already exist. There is no certificate-validation exception. A pending native prompt from another operation is not answered by this script.

## Health, first signup and logs

The address must resolve only to this computer's intended private IPv4 interfaces. After trusted HTTPS health passes, the script reports its complete clickable URL, resolved LAN addresses, exact source/version and digest. A second-device result is separate: this local request cannot prove another client's routing or certificate trust.

`/api/auth/status` supplies `signupAvailable`. If true, the output directs the user to first-user username/password signup at that HTTPS address. If false, existing owner sign-in remains. Older releases without the new status field are identified as unverified for that account workflow. Existing protected setup files are retained for compatibility, but their contents are never displayed or requested from the user.

Detached mode returns after its actual hosting result. Log mode shows selected service status and bounded, redacted logs. Left/Right changes service, F toggles follow/pause, and R/Q/Escape returns without stopping containers. Closing the console is not a service-stop command.

`.local/hosting-context.json` records the resolved deployment and source, preserved volumes, backup path, trust fingerprint and completed or incomplete phase. It is private local operational data, never a public release receipt. Source checks do not prove live startup, native confirmation, database restoration, second-device access or the first-owner race behavior. Those remain separately recorded runtime acceptance work.
