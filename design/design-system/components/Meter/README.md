# Meter

A labeled usage bar for one resource on one worker, value in `numeric` mono.

## Provide
- `.sf-meter` with three children: `.sf-meter__label` (short word), `.sf-meter__track` holding `.sf-meter__fill` with an inline `width`, and `.sf-meter__value`.
- Thresholds: under 70% plain fill (`running`), 70 to 89% `sf-meter__fill--warn` (`draining`), 90% and up `sf-meter__fill--hot` (`failed`).

## Do
- Always print the number; the bar is the glance, the number is the fact.
- Stack meters with `space-3` between them.

## Don't
- Don't animate the fill on every poll; update in place.
