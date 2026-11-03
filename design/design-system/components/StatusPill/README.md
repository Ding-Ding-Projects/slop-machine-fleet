# StatusPill

A worker's lifecycle state as a word with a colored mark: the one place status color appears in a row.

## Provide
- `<span class="sf-pill sf-pill--<state>">Word</span>` where state is `running`, `provisioning`, `draining`, `failed` or `idle`.
- The word is required: Running, Provisioning, Booting, Draining, Stopping, Failed, Idle, Stopped.

## Behavior
- Provisioning swaps its dot for a spinning ring (static under reduced motion).
- Colors: `running`/`running-soft`, `provisioning`/`provisioning-soft`, `draining`/`draining-soft`, `failed`/`failed-soft`, `idle`/`idle-soft`. Every label meets 4.5:1 on its fill in both themes.

## Don't
- Don't show a status by color alone (no bare dots in tables).
- Don't invent states; map EC2 states (pending, running, stopping, stopped, terminated) onto these five.
