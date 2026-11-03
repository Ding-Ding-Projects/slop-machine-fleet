# Dispatch coding work

Choose an authenticated, available worker and a repository it can access. Supply a clear prompt and select a supported model. One task runs at a time on each worker; additional tasks wait in its durable FIFO queue.

## Isolate the workspace

Each task receives an owned Git worktree and branch. Preserve other tasks' files and avoid sharing a mutable checkout. Repository URLs must use supported HTTPS forms without embedded credentials; local paths and arbitrary shell text are not accepted as repository identities.

## Follow and steer work

The worker uses the Codex app-server protocol to create a thread and turn, stream actual events and handle approval requests. Task access defaults to `workspace-write` and approvals to `on-request`. Broader access requires an explicit supported product choice.

Review actual command and edit approvals before answering. Send follow-up input to the existing task rather than creating another conflicting task. A disconnected browser does not mean that work stopped.

## Cancel and recover

Cancellation requests interruption and waits for the worker's terminal result. A task must never be marked cancelled while a previous process can still write. Completion, cancellation and approval callbacks must not resurrect terminal tasks. After service or worker interruption, reconcile existing task state before retrying; do not blindly rerun a prompt that might already have changed files.

Inspect the resulting branch and diff. Preserve unfinished changes. A completed model turn alone does not establish that tests, publication or user acceptance succeeded.

Next: [manage capacity and data](lifecycle.md).
