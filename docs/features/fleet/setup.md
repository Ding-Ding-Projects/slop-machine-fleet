# Set up the controller

The controller stores your worker inventory, operation history and queued tasks. The desktop client and browser connect to that same controller, so closing either client does not remove the fleet.

## Before starting

Choose a trusted Docker host on your LAN with enough storage for PostgreSQL and the service. Keep its published HTTPS address private to the intended network. Supply an immutable published image reference and a LAN host name or address through the supported hosting entrypoint. The first release must exist before a published-image pull can succeed.

Run `host.bat --detached` to start the tracked Compose deployment. Run `host.bat --logs` to open the interactive status/log view. Leaving that view preserves running containers. Missing Docker, image pull errors and health failures are incomplete outcomes, not successful setup.

## Establish trust and ownership

The deployment uses HTTPS. Trust the deployment's actual local CA through the supported operating-system route before connecting another client. Do not disable certificate verification. Complete first-owner setup using the protected host-local authorization flow, then sign in normally. The setup authorization must never enter source, chat, a screenshot or a support bundle.

Connect the desktop to the exact trusted HTTPS controller origin. The client rejects arbitrary URL schemes and does not expose Node.js APIs to remote content.

## Verify your result

Confirm health, sign in, open the empty fleet and reopen it in another client. Preferences should persist; both clients should show the same service records. Test the complete URL from an intended LAN client. A loopback response alone does not establish LAN access.

## Recovery

Preserve named volumes and local protected configuration during updates. Inspect the specific failed phase and retry that phase. Never delete the database volume to repair a login or image-pull problem.

Next: [review costs and provision a worker](provisioning.md).
