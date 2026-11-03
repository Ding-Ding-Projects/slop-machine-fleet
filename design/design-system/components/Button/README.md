# Button

Buttons start, stop and route work across the fleet; one `sf-btn--primary` per view at most.

## Provide
- A `<button>` with `class="sf-btn"` plus one variant: `sf-btn--primary`, `sf-btn--secondary`, `sf-btn--ghost` or `sf-btn--danger`.
- A short verb-first label in sentence case ("Launch worker", not "LAUNCH").
- Optional leading icon: `<i class="ph-fill ph-…">` from Phosphor Fill, 16px.
- Sizes: default 36px; `sf-btn--sm` 28px for table rows and tiles; `sf-btn--icon` for icon-only, which needs `aria-label`.

## Do
- Use `primary` (volt on-volt) for the single action the page exists for: Launch, Assign, Save.
- Use `danger` for Terminate and Delete, and confirm in a dialog that names the worker.
- Keep 8px (`space-2`) between buttons in a row.

## Don't
- Don't put two primary buttons side by side.
- Don't use volt as text on the light theme; use `volt-text`.
