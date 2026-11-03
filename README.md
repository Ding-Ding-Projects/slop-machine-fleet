# Slop Machine Fleet

A desktop and self-hosted control plane for isolated Windows coding workers on Amazon EC2.

The shared service, Windows worker, desktop client and browser workspace are implemented in source. Delivery and acceptance are still in progress. No paid cloud resources have been created, and real worker login, pairing and a live coding turn remain unverified.

## Work with a fleet

- Create workers through an exact, expiring account, region, resource and cost review. Worker readiness requires bootstrap, certificate enrollment, SSM forwarding and mutual-TLS health verification.
- Complete guided Slop Machine device login and interactive GitHub CLI login under each worker's dedicated profile. Pairing-code issuance and a connected client have separate states.
- Queue coding tasks, handle actual approval requests, inspect bounded output and interrupt work deliberately.
- Select workers for individual or bulk lifecycle actions while preserving retained workspace volumes and ownership checks.

Read the complete [worker guide](docs/features/workers/README.md), [task-output guide](docs/features/workers/task-output.md), [hosting guide](deploy/README.md) and [API contract](docs/API.md). The [prepared wiki](docs/wiki/pending/Home.md) contains complete articles while forge-wiki initialization is pending.

## Build and host

Run `build.bat /s` for the supported build and `build-installer.bat /s` for the genuine unsigned Squirrel installer, worker and three portable companions. See the hosting guide before configuring `.env`, trusted LAN HTTPS and the source-bound worker release manifest. `host.bat --detached` and `host.bat --logs` retain separate background and interactive hosting modes.

The first real hosting attempt stopped in local permission preparation before Compose startup. That repair and trusted LAN verification remain pending. Do not treat a published image or a port mapping as a running deployment.

## Verified milestones and limits

- Source `939d26821e331919b43f0fa980a203d82ab7f1d6` passed both exact root entrypoints. Its local unsigned `Setup.exe` is 134,644,224 bytes.
- The source-bound service image was published, inspected and pulled at digest `sha256:0ce833cc40b2a19e7a645ff8e9642b7811bd2b0a2cdaad091a7d0099f7472042`.
- The rebuilt PostgreSQL-backed browser runtime displayed all 115 feature entries, opened complete articles, rejected anonymous encoded API routes, preserved drafts on cancelled navigation and verified targeted Settings focus and neutral wording reset.
- The historical 0.1.0 package was installed on the supported physical Windows host and its installed executable and archive matched the downloaded package. It remains an installation baseline, with known defects repaired in newer source. This is not accepted-update proof.

The [required-feature inventory](docs/features/requirements/README.md) retains unfinished capabilities, including full regex parity and the remaining tool suites. Full physical-scale coverage, fresh screenshot promotion, native updates, complete companion acceptance and live cloud workflows are unfinished. Design reference frames are not runtime screenshots. Follow the [roadmap](ROADMAP.md) and [handoff](HANDOFF.md) for exact remaining work.
