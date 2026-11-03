# Button

Buttons start, route and stop work. Round at rest, they square their corners while pressed (the Expressive shape morph).

- **Material 3 primitive:** Common buttons (filled, tonal, outlined, text, elevated), icon buttons, extended FAB
- **Covers:** `material-design`, `functional-ui`, `motion`

## Provide
- A verb-first label in sentence case ("Launch worker").
- Variant: `sf-btn--brand` (volt `primary-fixed`, the one action the view exists for), `--filled`, `--tonal`, `--outlined`, `--text`, `--elevated`, `--danger`.
- Optional leading Material Symbols icon at 18px.
- Size: default 40px, `--sm` 32px, `--lg` 56px for wizard primaries.
- Disabled buttons name the unmet condition in the label or an adjacent tooltip ("Launch (cap reached)").

## Do
- One brand button per view.
- Use `--danger` only behind the SuperConfirmation for irreversible actions.
- Icon-only buttons carry an `aria-label` and a tooltip.

## Don't
- Don't disable without saying why.
- Don't put emoji in buttons or accessible names.
