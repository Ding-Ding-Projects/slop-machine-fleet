# WorkerTile

One isolated Windows coding worker on EC2: where it runs, what it is, its state, its load and one action.

## Provide
- `<article class="sf-tile" tabindex="0">` containing, in order: `.sf-tile__head` (eyebrow region or AZ, `.sf-tile__name` worker name, `.sf-tile__meta` instance type and size on one line, then a StatusPill), two or three Meters, and `.sf-tile__foot` (one line of progress and one small button).
- `sf-tile--selected` for the worker shown in the detail pane: a volt-text ring, no fill change.

## Do
- Lay tiles in a grid with `space-4` gaps; 300px wide, height follows content.
- Keep the name in mono exactly as the worker reports it.
- Show one action in the foot; the rest live in the detail pane or command bar.

## Don't
- Don't color the whole tile by status; the pill carries it.
- Don't add a colored left border.
