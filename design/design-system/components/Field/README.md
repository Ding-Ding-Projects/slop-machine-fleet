# Field

A labeled single-line input set in mono, for identifiers and config values.

## Provide
- `<label class="sf-field">` wrapping `.sf-field__label`, an `<input class="sf-input">`, and an optional `.sf-field__help`.
- For an error add `sf-field--error`, `aria-invalid="true"` on the input, and a help line that says how to fix it, led by `ph-warning-circle`.

## Do
- Put the unit or format in the help line, not the placeholder.
- Use the mono input for IDs, regions, instance types and paths; a prose field (a task description) may set `font-family: var(--font-sans)`.

## Don't
- Don't clear an error until the value is fixed.
