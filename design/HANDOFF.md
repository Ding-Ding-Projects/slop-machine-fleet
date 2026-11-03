# Design handoff: Slop Machine Fleet design system

Status: **design reference, version 2.** Nothing here is implemented, verified or shipped behaviour.

## What is in this folder

| Path | What |
| --- | --- |
| `design-system/README.md` | Brand book: principles, voice, colour, type, shape, motion, iconography, window and navigation |
| `design-system/tokens.json` | Source tokens: Material 3 colour roles for dark and light, status data colours, the Material 3 type scale plus mono roles, spacing, corner scale, elevation, state layers, sizes |
| `design-system/tokens.css` | CSS custom properties and font faces generated from `tokens.json` |
| `design-system/fonts/` | Bundled Geist, Geist Mono and Material Symbols Rounded (variable woff2) with their licences |
| `design-system/components/bundle.css` | Component classes, prefixed `sf-` |
| `design-system/components/<Name>/` | `preview.html` and `README.md` for 43 components and patterns |
| `design-system/components/Cover/preview.html` | The system's cover |
| `design-system/design-system.json` | Index for the hosted design-system canvas |
| `frames/<Name>-<theme>.png` | Local renders of every preview in dark and light at 1.5x |
| `COVERAGE.md` | Which requirement each component covers, and what is still to design |
| `scripts/generate-m3-scheme.mjs`, `scripts/m3-scheme.json` | How the colour roles were generated from seed `#C6F02A`, and the output |
| `scripts/fetch-fonts.sh` | Downloads the complete font files from pinned npm packages |
| `REHEARSAL.md` | Review notes |

## Inputs

- The product plan: desktop client and authenticated LAN web app sharing one service; one Windows Server 2025 EC2 machine per worker; guided device login, GitHub CLI login and pairing; coding-task dispatch; bulk lifecycle actions with per-worker outcomes; five-machine cap with cost review.
- The required feature catalogue and UI contract, including Material 3 Expressive conformance, bundled fonts, tabs, regex builders, the command palette, appearance customization and the safety patterns.

## Implementation notes

- Each component's guidelines name the Material 3 primitive it maps to. Build with genuine Material 3 components and these tokens; the CSS is the visual reference.
- Colour roles regenerate from the user's seed with Material Color Utilities (see `scripts/generate-m3-scheme.mjs`). Status colours are data and do not regenerate.
- Cantonese text falls back to Noto Sans HK, then Microsoft JhengHei UI. The app must vendor a complete CJK face by script.
- The Material Symbols font is the full variable file (about 4.4 MB); the app may subset it by script to the icons it uses.

## Review

- Contrast: every text, outline and status pair named in a usage note was checked in both themes (4.5:1 text, 3:1 outlines). One failure was fixed (light running status on `surface-container-high`); 0 remain.
- Frames: all 86 component frames plus the cover were rendered and reviewed. Fixes: status chips stretched in the worker card grid, segmented buttons stretched in columns, a wrapping context menu item, a two-line sign-in heading.
- Stageshow skill, pinned commit `802057409787133703c56001080169e347305572` (fresh install was not available in this environment, so the pinned copy was used). Applied: restraint, type and spacing insets, one icon set at one size, no AI tropes, frame review. Not applicable: animated demo choreography, cursor beats and device framing, since this is a component system.

## Still open

- Full screens for each built-in tool, the full regex builder, the grouped settings surface and the public documentation site (see `COVERAGE.md`).
- Narrow-width and high-scale renders, screen reader checks, and motion review (stills only so far).
