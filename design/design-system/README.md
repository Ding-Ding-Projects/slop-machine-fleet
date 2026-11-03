Slop Machine Fleet is a desktop and self-hosted control plane for isolated Windows coding workers on Amazon EC2. The interface is an instrument panel: dark by default, quiet grays, one electric volt accent, and status colors that only ever mean a worker's state.

## Principles

- **The fleet is the content.** Worker names, states and numbers carry the color and weight; chrome stays in `surface`, `line` and `ink-muted`.
- **Volt is said once.** One `volt` fill per view: the primary button, the active nav marker or the selected worker ring. Never decorative.
- **State is word plus mark.** Every status uses a StatusPill with its word; color alone never carries meaning.
- **Identifiers are mono, language is sans.** `code` for worker names, instance IDs, regions and commands; `body` for everything people read as sentences.
- **Flat on borders, lifted only when floating.** Cards sit on `line` hairlines; only menus, popovers and the command bar get `shadow-pop`.

## Voice and content

- Sentence case everywhere: "Launch worker", "Instance type". Uppercase only in the `eyebrow` style for regions (`US-EAST-1`).
- Verb-first actions: Launch, Drain, Terminate, Assign task, Open shell. Name the object when it could be ambiguous ("Terminate fleet-w-07").
- Plain, specific numbers: "Last heartbeat 4s ago", "8 vCPU, 32 GiB". No exclamation marks, no emoji.
- Errors say what happened and how to fix it: "AMI IDs are 17 hex characters after ami-."
- Map EC2 states onto five display states: pending → Provisioning/Booting, running → Running, stopping → Draining/Stopping, stopped → Stopped (idle), and any failed health check → Failed.

## Color

- Ground: `canvas` behind everything; `surface` for panels and tiles; `surface-raised` for hover, menus and secondary buttons; `surface-sunken` for terminals and input wells.
- Text: `ink` for primary text, `ink-muted` for metadata and labels, `ink-faint` for timestamps and placeholders. All three meet 4.5:1 on every surface they are noted for, in both themes.
- Brand: `volt` fill with `on-volt` text for the primary action; `volt-text` for brand text and links; `volt-soft` for the selected row. On the light theme `volt` is a fill only, never text.
- Status: `running`, `provisioning`, `draining`, `failed`, `idle`, each with a `-soft` fill for pills. The five differ in lightness as well as hue, and always ship with their word.
- Focus: `focus` (an alias of `volt-text`), a solid 2px outline at 2px offset, 3:1 or better on every surface in both themes.
- Themes: Hangar (dark) is the default; Daylight (light) mirrors every token. Set `data-theme="light"` on the root to switch.

## Type

- Geist for UI and Geist Mono for identifiers and numbers, both from Google Fonts; fallbacks are the system UI stack and Cascadia Code or Consolas on Windows.
- `display` once per page for the fleet headline number; `title-1` for the page title; `title-2` for panels and dialogs; `heading` inside panels.
- `body` 14/20 is the default; `body-sm` for table cells and metadata; `label` for field labels and pill text.
- `code` for identifiers, `numeric` for aligned figures (tabular numerals), `eyebrow` for one uppercase tag above a title.

## Space, radius, layout

- A 4px grid: `space-1` 4 through `space-12` 48. Text keeps at least `space-3` from any card edge; cards pad `space-4`; page gutters are `space-8`.
- Radii nest: `radius-sm` 6 for small controls, `radius-md` 10 for buttons and inputs, `radius-lg` 16 for cards, terminals and the command bar, `radius-pill` for pills and meters only.
- Desktop layout: a 64px nav rail on `canvas`, a worker grid of 300px WorkerTiles with `space-4` gaps, and a detail pane on `surface` that holds the Terminal.

## Motion

- 120ms ease for hover and press; 200ms for menus opening. Nothing bounces.
- Only two things move on their own: the Provisioning spinner and the terminal cursor, both static under `prefers-reduced-motion`.
- Values update in place on each poll; bars never re-animate from zero.

## Iconography

- Phosphor Icons, Fill weight, pinned at `@phosphor-icons/web@2.1.1`, at 16px, colored `ink-muted` or `ink` (never status colors except inside a pill or a field error).
- Core set: `ph-desktop-tower` (worker), `ph-terminal-window` (shell), `ph-rocket-launch` (launch), `ph-stop-circle` (drain), `ph-power` (terminate), `ph-arrows-clockwise` (refresh), `ph-magnifying-glass` (search), `ph-warning-circle` (errors).
- No sparkles, no hand-drawn glyphs, no emoji as icons.

## Logo

- There is no logo yet. Set the name "Slop Machine Fleet" in Geist 600 at `title-2` or larger, in `ink`. Do not draw or invent a mark.

## Components

- Button, StatusPill, Meter, Field, WorkerTile, Terminal and CommandBar, as plain CSS classes prefixed `sf-` in `components/bundle.css`. Each has a live preview and guidelines.
- Consumers provide the markup shown in each preview and load `tokens.css` then `components/bundle.css`, plus the Phosphor Fill stylesheet.
