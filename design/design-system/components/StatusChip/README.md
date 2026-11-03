# StatusChip

A state as a word with an icon on a soft fill: infrastructure, sign-in, pairing and task states all use it.

- **Material 3 primitive:** Assist chip anatomy with a data colour (status palettes are exempt from chrome roles)
- **Covers:** `functional-ui`, `accessibility-sizing`

## Provide
- `sf-status--running|provisioning|draining|failed|idle` with its icon (`check_circle`, `progress_activity` spinning, `hourglass_top`, `error`, `pause_circle`) and a word.

## Do
- Map EC2 and tool states onto the five display states and keep the exact state in a tooltip.

## Don't
- Don't show colour alone.
- Don't spin under reduced motion.
