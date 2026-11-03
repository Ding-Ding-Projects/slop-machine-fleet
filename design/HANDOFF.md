# Design handoff: Slop Machine Fleet design system

Status: **design reference, version 1 (milestone).** Nothing here is implemented, verified or shipped behaviour.

## What is in this folder

| Path | What |
| --- | --- |
| `design-system/README.md` | Brand book: principles, voice, color, type, space, motion, iconography |
| `design-system/tokens.json` | Source tokens: two color themes (Hangar dark, Daylight light), type scale, spacing, radii, shadow |
| `design-system/tokens.css` | CSS custom properties generated from `tokens.json` |
| `design-system/components/bundle.css` | Component classes, prefixed `sf-` |
| `design-system/components/<Name>/` | `preview.html` (live preview) and `README.md` (guidelines) for Button, StatusPill, Meter, Field, WorkerTile, Terminal, CommandBar |
| `design-system/components/Cover/preview.html` | The system's cover |
| `design-system/design-system.json` | Index for the hosted design-system canvas |
| `frames/<Name>-<theme>.png` | Local renders of every preview in both themes at 2x |

## How the frames were made

Each `preview.html` was rendered with headless Chrome after inlining `tokens.css` and `components/bundle.css`, once per theme (`data-theme="dark"` and `data-theme="light"`), at 2x device scale.

## Review

- Contrast: every text pair named in a token's usage note was checked in both themes (WCAG 2: 4.5:1 for text, 3:1 for control borders and the focus ring). Two failures were found and fixed (`line-strong` on `surface-raised`, `ink-faint` on light `surface-sunken`); 0 remain.
- Fresh-eye fixes from the frames: worker tile metadata wrapped to two lines (shortened to one line), the Running pill glow read as a smudge on light grounds (removed), meter value column left a wide gap (narrowed).
- Design guidance: the Stageshow skill, pinned commit `802057409787133703c56001080169e347305572`. Rules applied: restraint (few real strings, filler at the edges), type and spacing insets, icons from one set at one size, no AI tropes. Rules not applicable: animated demo choreography, cursor beats, device framing, since this is a component system rather than a marketing scene.

## Known gaps, next version

- The product's UI contract requires Material Design 3 (Expressive) on every surface. Version 1 uses its own component styling; version 2 re-expresses the tokens as Material 3 color roles generated from the volt seed, the Material 3 type and shape scales, and Material Symbols icons.
- Fonts and icons load from Google Fonts and unpkg in these previews. The shipped app must bundle complete font files locally.
- Screens and patterns still to design: frameless title bar, tabbed navigation, navigation rail, setup wizard, device-login and pairing panels, cost review with the machine cap, bulk action results, settings with appearance editing, notifications, command palette on `Ctrl+Shift+F`.
