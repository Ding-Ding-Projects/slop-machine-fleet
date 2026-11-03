# WorkerCard

A worker card that keeps the machine, sign-in, pairing and task states separate, shows load, and offers the next real action.

- **Material 3 primitive:** Card (filled; selected state uses a primary outline and the large-increased corner)
- **Covers:** `functional-ui`, `bulk-actions`, `progress-recovery`, `rich-controls`

## Provide
- Region, zone and instance type; the worker name in `title-large` mono; four labelled StatusChips; CPU and memory meters; heartbeat; one primary next action.
- A selection checkbox for bulk actions.

## Do
- Explain a failure where it happened, say what was and was not billed, and offer the recovery.

## Don't
- Don't merge the four states into one.
- Don't colour the whole card by status.
