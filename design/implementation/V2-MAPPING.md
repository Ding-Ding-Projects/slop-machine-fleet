# Version 2 runtime mapping plan

Status: proposed mapping, awaiting independent review. This is not built-interface parity evidence.

## Source and ownership

Read-only source: imported `design/design-system/` at integration commit `3aa1ca892fd18a59775322fd610f232f0a321dea`, specifically `tokens.json`, `tokens.css`, `README.md`, `components/bundle.css`, and Button/TextField/SelectionControls guidance. The preserved handoff describes 43 component patterns, not complete product screens. Imported references and their fonts remain unchanged. Runtime edits are limited to `apps/web/**`; separate tool modules remain outside this lane.

## Mapping

1. Import the original `design/design-system/tokens.css` into the runtime theme so Vite resolves and bundles its exact Geist, Geist Mono and Material Symbols Rounded font files. Do not transcribe or replace the source palette, download a subset or depend on a CDN. The integrated checkout must contain the preserved reference commit. Complete CJK font vendoring remains a documented gap; preserve the reference's platform fallbacks without claiming bundled CJK coverage.
2. Keep original role names intact. Map the runtime aliases to those roles: canvas to surface, panels to surface-container-low, navigation/titlebar to surface-container, dialogs and anchored editors to surface-container-high, inputs to surface-container-highest, terminal wells to surface-container-lowest, text to on-surface, secondary text to on-surface-variant, decorative borders to outline-variant. Control outlines use outline. Map every available Material Web color role to the corresponding source role.
3. Dark is the default for a new profile. Preserve existing explicit light/system preferences; this update must not overwrite user choices. Use the lime primary and primary-fixed roles for actual primary actions, teal tertiary for links/editor accents, and the separate status data roles for state chips. A status is always actual service text plus an icon.
4. Use Geist UI/type-scale roles, Geist Mono for identifiers and numeric readouts, and the bundled Material Symbols Rounded icons. Replace the invented S mark and geometric navigation glyphs with the reference's deployed_code brand symbol and named icon set. No new logo is invented.
5. Map shape/spacing/elevation to the source: fully rounded resting action buttons, 8px pressed shape, 16px cards, 28px dialogs, 4px spacing grid, 32px normal page gutters, and at least 44px interactive hit targets. Reduced motion removes the shape transition while retaining state and focus. Keep responsive 320px layouts and bilingual wrapping; do not force the reference's desktop-only geometry into narrow layouts.
6. Expand the existing genuine Material Web adapters for supported controls: common buttons, outlined text fields, checkboxes, switches and sliders. Preserve real form association, required validation, controlled values, clear actions, labels, help and native keyboard behavior. Replace core Field, preference switches/sliders and confirmation controls first. Native selects and remaining controls stay explicitly nonconforming until their real adapters are completed; cosmetic CSS alone is not reported as primitive parity.

## Verification and bounds

Run focused type checks and adapter/token-mapping tests, then preserve the exact commit for the integrating owner to build through root build.bat. Actual built screenshots, font load checks, interaction, contrast and the complete viewport/theme/language/scale matrix are separate acceptance work. The existing functional state and current evidence are retained. No sample workers, fake checks, fabricated full-screen coverage, cloud action or publication is authorized by this mapping.
