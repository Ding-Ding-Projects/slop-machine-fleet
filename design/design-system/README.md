Slop Machine Fleet is a desktop app and an authenticated LAN web app that manage isolated Windows Server 2025 coding workers on Amazon EC2: setup, guided sign-in and pairing, coding tasks, and bulk lifecycle actions. This system expresses it in **Material 3 Expressive**: a volt-lime seed, near-neutral surfaces, round shapes that morph on press, and status colours that only ever describe state.

## Principles

- **Material 3 everywhere.** Every rendered control maps to a genuine Material 3 primitive (each component's guidelines name it). Chrome uses only the colour roles in `tokens.json`; status colours are data and stay in the `status-*` tokens.
- **Volt is the brand, said once.** `primary-fixed` (the same volt in both themes) marks the one action a view exists for (`sf-btn--brand`, the rail FAB) and the cover. Everything else uses `primary`, `secondary-container` and the surface roles.
- **State is word plus icon.** Machine, sign-in, pairing and task states are separate and each uses a StatusChip with a word and an icon.
- **Truthful by default.** No sample data, no fake checks. Empty states state the fact and offer the real next action. A partial bulk result is never shown as success.
- **Everything is reachable, customizable and recoverable.** Tabs instead of scrolling, `Ctrl+Shift+F` to any element, a context menu with "Edit appearance…" on every element, a search with its own regex builder everywhere, history and export for user data.

## Voice and content

- Sentence case; verb-first actions ("Launch worker", "Retry launch"); name the object when it could be ambiguous ("Terminate fleet-w-07").
- Three language modes: English, playful Hong Kong-style Cantonese, and bilingual (primary label in the body or label role, secondary in `body-small` and `on-surface-variant`).
- Two funny-level sliders (English and Cantonese, 1 to 5, ship at 5) change voice, never facts: numbers, names, errors and instructions stay identical at every level.
- Emoji only inside dialogs and message boxes when the user's emoji switch is on; never in buttons, labels or accessible names.
- Costs carry their source and time ("Estimate from AWS Price List, fetched 01:40") and what is not included.
- Codes (sign-in, pairing, OTP) are hidden until revealed and never appear in notifications, logs, history, exports or screenshots.

## Colour

- Generated with Material Color Utilities from seed `#C6F02A`: vibrant primary at the seed hue, secondary at chroma 14, tertiary teal at hue 190, neutrals at chroma 2 so surfaces read nearly neutral.
- Surfaces: `surface` for the window; `surface-container` for the title bar, tab strip and rail; `surface-container-low` for cards; `surface-container-high` for menus, dialogs and the palette; `surface-container-highest` for input fills and selected tabs; `surface-container-lowest` for terminals.
- Text: `on-surface` and `on-surface-variant` on every surface role, both at 4.5:1 or better in dark and light.
- Accents: `primary` for filled buttons and progress; `secondary-container` for tonal buttons, selected chips and the rail indicator; `tertiary` for links, the regex builder and live charts; `error` and `error-container` for destructive actions.
- Status (data): `status-running`, `status-provisioning`, `status-draining`, `status-failed`, `status-idle`, each with a `-soft` fill. Every status text meets 4.5:1 on its soft fill and on `surface`, `surface-container-low` and `surface-container-high` in both themes.
- Focus: a solid 3px `secondary` outline at 2px offset on every interactive element.
- Themes: Dark is the default; Light mirrors every role. Users can change the seed; the roles regenerate from it.

## Type

- Geist (variable, bundled in `fonts/`) for UI, Geist Mono (variable, bundled) for identifiers and numbers, Material Symbols Rounded (bundled) for icons. Cantonese falls back to Noto Sans HK, then Microsoft JhengHei UI; the shipped app vendors a complete CJK face by script.
- The Material 3 scale: `display-large` for the fleet headline number, `headline-*` for page and dialog headlines, `title-*` for cards and sections, `body-*` for text, `label-*` for buttons, chips and keys.
- Mono roles: `code` for worker names, instance IDs, regions and regex; `numeric` for aligned figures; `otp` for one-time codes grouped in threes.

## Shape, space, elevation, state

- Corners: `corner-full` for buttons, chips, switches and sliders; `corner-large` for cards; `corner-large-increased` for the selected card; `corner-extra-large` for dialogs, the palette and onboarding; `corner-extra-large-increased` for the cover and hero cards. Buttons morph to `corner-small` while pressed.
- Space on a 4px grid: `space-3` is the minimum text inset; `space-4` card padding; `space-6` dialog padding; `space-8` page gutters.
- Elevation: cards are flat (`elevation-0`) on container roles; menus `elevation-2`; dialogs, the palette and the FAB `elevation-3`; dragged items `elevation-4`.
- State layers: `state-hover` 0.08, `state-focus` and `state-pressed` 0.10, `state-dragged` 0.16, disabled content 0.38 on a 0.12 container.
- Targets: at least `target-min` (44px); title bar `titlebar-height`; tabs `tab-height`; rail `rail-width`.

## Motion

- Material 3 Expressive springs: spatial changes (shape morph, panels) use the expressive fast spatial spring; colour and opacity use the standard effects curve `cubic-bezier(0.2, 0, 0, 1)` at 150 to 200ms.
- Moving on their own: the Provisioning spinner, the live chart's leading point, and the countdown ring. All three hold still under `prefers-reduced-motion`, and every motion has a reduced path.
- Values update in place; nothing re-animates from zero on refresh.

## Iconography

- Material Symbols Rounded, filled at 20px and under, outlined at 24px for rail and empty states; weight 500 small, 400 large. One set, no hand-drawn glyphs, no emoji as icons.
- Core: `deployed_code` (app), `desktop_windows` (worker), `terminal`, `rocket_launch`, `stop_circle` (drain), `power_settings_new`, `restart_alt`, `key` (sign-in), `regular_expression`, `format_paint` (edit appearance), `lock`, `history`, `download`.

## Logo

- No logo exists yet. Set "Slop Machine Fleet" in Geist 500 beside `deployed_code` in `primary`. The user can rename the app; every surface then shows the chosen name. Do not invent a mark.

## Window and navigation

- Frameless window: the TitleBar draws the name, live fleet summary, palette and notification buttons, and the window controls. The operating system title bar is never shown.
- Every page is a browser-style tab (TabStrip) with pinning, colour groups, overflow and tab search; the NavigationRail opens or focuses tabs.
- `Ctrl+Shift+F` opens the CommandPalette; results include live settings and teleport to the exact element.

## Components and patterns

- Actions: Button, InfoIconButton, Chips, StatusChip, SegmentedButton.
- Inputs: TextField, SelectionControls, SearchWithRegexBuilder.
- Window: TitleBar, TabStrip, NavigationRail. Navigation: CommandPalette, ContextMenu. Feedback: Notifications.
- Fleet: WorkerCard, Terminal, DeviceLoginPanel, CostReview, BulkActionBar. Data: LiveChart, FilterPanel, EmptyState. Onboarding: SetupWizard.
- Personalization: LanguageMode, FunnyLevel, AppearanceEditor, ColorPicker, ScheduledSettings, SchoolMode, VoiceAndSound, FocusModes, DimSumSurprise, VocabularyDrop.
- Safety: SuperConfirmation, ElementLock, Authenticator, SupportDesk. Records: History, ExportDialog, Changelog, DocsBrowser, ProvenanceFooter. Tools: ToolsHub.
- Consumers load `tokens.css`, then `components/bundle.css`; classes are prefixed `sf-`. In the app, each maps to its Material 3 web component; the CSS here is the visual reference for tokens, sizes and states.
