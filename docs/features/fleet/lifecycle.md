# Manage capacity and preserve data

Select exact workers before requesting a lifecycle operation. Bulk actions create a durable operation with a separate result for every selected target. Partial success remains partial, and retry targets only eligible unfinished items.

## Stop, restart and update

Drain a worker before maintenance. A worker with active or uncertain coding work cannot be stopped, restarted or terminated until the result is reconciled. Updates must prepare and verify the candidate before stopping the previous usable service, then retain a rollback path.

Stopping a machine does not necessarily remove all charges. Retained disks and other resources may still incur costs. The cost view must describe its actual scope rather than promise a complete bill.

## Remove a worker

Review the exact account, region, worker identities and retained data before termination. The default preserves the separate workspace volume. Permanently erasing workspace data is a distinct explicit operation and must not be inferred from removing the machine.

Never delete an ownership-uncertain or unrelated EC2 instance through this fleet. Reconcile provider tags and recorded IDs before acting.

## Verify the outcome

Read back the actual infrastructure state. A requested stop is pending until the provider reports stopped; a completed control-plane operation does not prove that workspace backups or task publication exist.

Next: [recover setup](setup.md) or [submit another task](tasks.md).
