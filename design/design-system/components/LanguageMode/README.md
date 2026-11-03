# LanguageMode

The persisted language mode with exactly three choices. Bilingual shows the primary label prominently and a compact secondary label, never crowding narrow layouts.

- **Material 3 primitive:** Segmented button; typography roles for primary and secondary labels
- **Covers:** `language`, `school-mode`, `scheduled-settings`

## Provide
- Three choices; in bilingual mode every label has a primary (`body-large`/`label-large`) and a secondary (`body-small` in `on-surface-variant`).

## Do
- Test the longest bilingual strings at the narrowest width.

## Don't
- Don't truncate a secondary label silently.
