# Publication privacy

This category explains the publication language protection method and its limits. It is a privacy control, not a general test or lint workflow.

## Local checks

Enable the tracked hooks with `git config core.hooksPath .githooks`. `pre-commit` scans an index snapshot, including partially staged content. `pre-push` passes the actual hook input to the installed outgoing-history scanner. That scanner checks the named destination advertisement and all outgoing revision trees, including intermediate content deleted before the final revision.

The public launcher discovers the maintainer-managed installation dynamically. With no private source or installation, outsiders receive an explicit skip message. With either present, a missing validator, unavailable lock checker, invalid policy, stale installation or incomplete scan blocks the operation. The launcher invokes the root `scripts/check-vocabulary.mjs` lock method before the installed scanner. Private policy data and its expected digest remain outside this repository.

Hooks are opt-in local enforcement and can be changed by the computer owner. Their installation and successful positive and negative executions require separate evidence. A hook file alone does not prove protection.

## Trusted workflow configuration

Set the repository variable `PUBLICATION_SCANNER_REVISION` to the full reviewed commit that contains these scanner modules. The workflow checks out that immutable revision under `trusted/`, separately from the full candidate history under `candidate/`. The entrypoint rejects execution from within the candidate. No candidate script, package install, build command or contribution workflow is executed with protected policy data.

Provision `PUBLICATION_LANGUAGE_DATA` through the maintainer's private producer and a nonlogging standard-input transfer. The workflow passes the protected carrier directly to the trusted child standard input and removes the secret from that child's environment. It never writes policy data to a file or prints it. Missing, malformed, incomplete or oversized policy data fails closed.

Only branch pushes and manual runs are supported. Pull-request events are deliberately absent: never add `pull_request_target` or execute contribution code with protected data. Every branch push scans the actual event-base-relative history. An all-zero base on a new branch cannot establish publication history and fails incomplete. Manual dispatch scans the current tree only and explicitly does not prove history safety. Retain that distinction in reports.

A trusted scanner revision must be selected and verified after the scanner method is committed. Missing configuration fails incomplete. Protect the workflow and scanner trust configuration with owner review and supported required checks. Read back the stored variable, secret presence, hook configuration and branch protection before claiming protection. A post-transmission workflow cannot undo an already completed push.

## Scanner scope and limitations

The maintained scanner inspects tracked paths, source and documentation text, supported binary metadata and fonts, and commit messages across selected revision history. It normalizes encoded and separated forms without blanket exclusions for comments, identifiers, Markdown or JSON. Reviewed exceptions are exact source locations and content hashes, supplied outside the candidate. The trusted scanner checkout carries three reviewed exact Git command-line exceptions in `reviewed-exceptions.json`. They contain source-line hashes, not policy digests. Candidate modifications never supply trusted exceptions; changed or unused exception locations fail closed. The local maintainer policy must independently admit these exact technical lines.

Limits on input, decoded size, files, bytes, recursion, history and report size are enforced. Unsupported binary formats, missing objects and unsupported compressed fonts produce incomplete results rather than successful omissions. The optional offline font decoder is hash-pinned by its public upstream package identity; its hash is unrelated to policy data. The default entrypoint does not provision that decoder, so compressed fonts remain incomplete until the maintained decoder route is explicitly wired and verified.

## Dependency inventory

Local: a supported Node runtime, Git, the maintainer-managed private scanner and current lock method. The workflow provisions Node 24.13.0 and uses Git from the Windows 2025 runner image, failing if unavailable. Checkout and setup actions are pinned to immutable public action revisions. Scanner modules otherwise use Node built-ins. The optional font decoder uses its separately verified portable upstream package.

## Verification and recovery

Run the local index and outgoing checks after enabling hooks, then verify both an allowed fixture and deliberately prohibited staged and intermediate-history fixtures in isolated temporary repositories. Do not print private fixtures or carriers. Restore valid state and require a passing result. Retain exact exit outcomes, source revisions and missing coverage separately. If a run is incomplete, preserve work locally and resolve the reported category before transmission; never weaken policy data to obtain a passing result.
