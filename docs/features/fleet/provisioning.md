# Review costs and provision a worker

Each worker uses a separate Windows Server 2025 EC2 instance. Select the account profile, region, network, compatible instance type and storage before requesting a cost review.

## Review, then launch

The service resolves the regional AWS-maintained Windows Server 2025 Base AMI. It records the concrete AMI and verifies compatibility. The launch specification includes encrypted boot storage and a separate retained workspace volume, instance metadata protection and application ownership tags.

Request a review of the exact specification and worker count. The review must identify its currency, estimate source, excluded costs and expiry. A missing price is an unavailable estimate and blocks launching. Editing a reviewed specification invalidates it. The initial fleet cap is five machines and includes uncertain launches that might already exist.

Confirm creation only after reviewing the account, region, exact resources and estimated costs. Retrying the same operation must not create duplicate machines.

## Follow real phases

Infrastructure startup, Systems Manager registration, prerequisite installation, certificate enrollment, CLI authentication and pairing are separate states. An EC2 instance being running does not establish worker readiness.

The controller reaches a worker through Systems Manager port forwarding. The worker endpoint is loopback-only and requires mutual TLS. Bootstrap and command logs must not contain private keys or account credentials.

## Recovery

On interruption, reconcile provider identifiers before another launch. An uncertain launch reserves capacity until the actual result is known. Preserve workspace volumes when retiring a failed machine; erasure is a separate explicit operation.

Next: [sign in and pair the worker](authentication.md).
