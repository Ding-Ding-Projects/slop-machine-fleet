# SearchWithRegexBuilder

The search field plus its anchored regex builder button; the builder opens beside the search it belongs to and edits only that search.

- **Material 3 primitive:** Search bar, icon button, menu/side sheet built from M3 primitives
- **Covers:** `regex-search`, `tabs`, `context-menus`

## Provide
- A search field with a live match count and a regex icon button whose accessible name names its search.
- The builder: flavour picker, token chips, live test strings, explanation, debugger and saved patterns (the full RegexBuddy-parity feature set, designed on its own screen).

## Do
- Give every search surface (tabs, settings, dropdowns, menus, logs) its own builder instance.

## Don't
- Don't share one global builder across searches.
- Don't change what a result does when filtering.
