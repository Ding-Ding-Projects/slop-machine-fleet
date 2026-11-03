# TextField

Labelled input that offers a suggested default, picks from real values where they exist, and validates in plain words that say what to do next.

- **Material 3 primitive:** Outlined text field (with menu for pickers)
- **Covers:** `guided-forms`, `functional-ui`

## Provide
- A label, a sanitized suggested value or a picker populated from real data (regions, instance types, branches), and supporting text.
- Errors: `sf-tf--error` plus a supporting line that states the fix.

## Do
- Keep free text available beside the picker.
- Use mono for identifiers.

## Don't
- Don't show a bare red border.
- Don't leave a box blank when a real default exists.
