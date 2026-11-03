# AppearanceEditor

The per-element appearance editor: target any rendered element (including the editor itself), edit Word-depth typography and every visual property, scope the change, lock it, save presets, reset per property, per element or globally.

- **Material 3 primitive:** Side sheet with text fields, segmented buttons, chips
- **Covers:** `appearance-editor`, `material-design`, `scheduled-settings`, `element-locks`

## Provide
- A target path, a live preview of the element, scope chips, a searchable property list with its regex builder, and Lock, Reset and Save preset.

## Do
- Keep unsupported properties visible with the reason.

## Don't
- Don't drop a value the platform cannot render; say so and keep it.
