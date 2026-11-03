# CommandBar

The fleet's keyboard entry point (Ctrl K): find a worker, then act on it.

## Provide
- `.sf-cmd` (role dialog, over `scrim`) with `.sf-cmd__search` (icon, `.sf-cmd__query`, an Esc key), then one or more `.sf-cmd__group` labels each followed by `.sf-cmd__list` of `.sf-cmd-item` rows.
- Rows: a Phosphor Fill icon, the label, optional StatusPill, and `.sf-cmd-item__hint` with `.sf-kbd` keys.
- The highlighted row gets `sf-cmd-item--active` (`volt-soft` fill, `ink` text).

## Do
- Use Windows key names (Ctrl, Alt, Enter as the return glyph).
- Put workers first, then actions on the best match.

## Don't
- Don't exceed 8 visible rows; scroll the list.
