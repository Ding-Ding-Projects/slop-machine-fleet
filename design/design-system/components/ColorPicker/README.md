# ColorPicker

The infinite colour picker: swatch grid, recent and custom colours, spectrum, direct entry in every notation, a live contrast readout, and the translator that turns words or other formats into a colour.

- **Material 3 primitive:** Dialog or menu with text fields and custom colour surfaces
- **Covers:** `color-picker`, `appearance-editor`, `accessibility-sizing`

## Provide
- Spectrum and hue, recents, the value in hex, RGB, HSL and OKLCH, the token name when it matches, a contrast check against the element's ground, and a translator field.

## Do
- Warn, never block, when contrast drops below 4.5:1.

## Don't
- Don't limit choice to presets.
