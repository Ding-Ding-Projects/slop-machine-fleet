# Terminal

A worker's live PowerShell session or log stream, read-only or interactive.

## Provide
- `.sf-term` with `.sf-term__bar` (icon, `.sf-term__title` "worker · shell", a StatusPill for the connection) and `.sf-term__body` holding pre-formatted lines.
- Line marks: `.sf-term__prompt` (volt-text), `.sf-term__cmd` (ink), `.sf-term__ok` (running), `.sf-term__warn` (draining); plain output stays `ink-muted`.
- `.sf-term__cursor` at the live prompt only.

## Do
- Keep it short in overviews: the last few meaningful lines; full output belongs in the logs page.
- Use Windows chrome conventions: no macOS traffic lights.

## Don't
- Don't syntax-highlight output; color only marks and prompts.
