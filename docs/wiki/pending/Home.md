# Run a coding fleet with explicit control

Slop Machine Fleet combines a Windows desktop client and an authenticated self-hosted browser workspace. One controller manages isolated Windows Server 2025 EC2 workers. Each worker keeps its own service profile, login state and retained workspace volume.

## Set up the controller

Read the complete [hosting guide](Hosting.md), choose the intended LAN address, use an immutable published image and configure trusted HTTPS before registering the owner. Keep cloud credentials on the controller and authorization values out of chat and logs. The desktop client connects to that same trusted HTTPS origin.

## Create and connect a worker

Use the creation workflow to discover the intended account and region, choose the network and worker size, and inspect the exact expiring resource and cost review. Approve only the reviewed configuration. A created machine is not a ready worker until bootstrap, certificate enrollment, SSM forwarding and mutual-TLS health verification succeed.

The complete [worker guide](Workers.md) explains provisioning, retained volumes and authentication. Guided Slop Machine device login and interactive GitHub CLI login have separate results. Pairing-code issuance is distinct from a verified connected client. Never copy a personal controller profile to a worker.

## Give work and manage the fleet

Choose a ready worker, create a coding task and respond to actual approval requests. Inspect bounded [task output](task-output.md), including replay gaps, restart markers and retention limits. Stop or interrupt work deliberately before operations that would disrupt it. Bulk lifecycle actions retain the same per-worker ownership and state checks as individual actions.

Use the [API reference](API.md) for integrations, the [desktop update guide](Desktop-updates.md) for accepted releases, and the [local tools guide](Tools.md) for device-owned utilities. The productive workspace, first-run setup and documentation remain separate experiences.

## Delivery state

Source implementation and focused local runtime checks exist. Live cloud provisioning, real account login and pairing, a live coding turn, the full required-feature inventory, complete layout matrix and native update acceptance are unfinished. Prepared wiki pages are bundled with the documentation but have not been published to the forge wiki. The roadmap retains those gaps.
