# LiveChart

A live line chart in the Liveline style: smooth line, a glowing leading point, the current value large above it.

- **Material 3 primitive:** Card with a data visualization
- **Covers:** `live-charts`, `motion`

## Provide
- A title with its window, the current value in `headline-large` mono, a delta chip, and an accessible text summary.

## Do
- Advance smoothly; under reduced motion update without animation.

## Don't
- Don't re-animate from zero on each update.
