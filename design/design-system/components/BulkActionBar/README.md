# BulkActionBar

Bulk actions on every list: a selection bar with the exact count, then a result list with every target's own outcome and retry for the unfinished ones only.

- **Material 3 primitive:** Toolbar (floating) and list
- **Covers:** `bulk-actions`, `progress-recovery`

## Provide
- The selection count, the available actions, and after running: a heading with done/total, an overall Partly done chip when any failed, one row per target.

## Do
- Drain busy workers first and say so.

## Don't
- Don't report a partial result as success.
- Don't retry items that already succeeded.
