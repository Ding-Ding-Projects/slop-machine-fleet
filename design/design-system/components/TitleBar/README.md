# TitleBar

The frameless window chrome: app mark, name, live fleet summary, palette and notification buttons, and Windows-placed window controls.

- **Material 3 primitive:** Top app bar (small) adapted as a title bar
- **Covers:** `workflow-navigation`, `display-name`, `notifications`, `command-palette`

## Provide
- The display name (renamable by the user), a short live status, the palette and notification buttons, and minimize, maximize and close at 46px wide.

## Do
- Keep the drag region free of controls.
- Close hovers in `error`.

## Don't
- Don't expose the operating system title bar.
