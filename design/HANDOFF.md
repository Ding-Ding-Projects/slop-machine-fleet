# Fleet workspace design handoff

Status: proposed design, awaiting independent review. No runtime or visual acceptance is claimed.

## Product and framework

Slop Machine Fleet is a React and Vite operational workspace served by the authenticated local controller, with the same browser interface used by the desktop shell. The opening view is a productive fleet list, never a marketing page. The service contract is `docs/API.md`. Only actual service records appear; empty, unavailable, expired-session and partial-result states remain distinct.

## Visual direction

A quiet Material Design 3 console uses a warm neutral canvas, blue primary actions, compact outlined status chips and generous readable table rows. Desktop has a 216px navigation rail, a 64px top bar and a single scrollable content area. A pale-blue selected navigation item and a restrained primary button establish hierarchy. Dark mode uses charcoal surfaces with blue accents and readable contrast. System fonts avoid remote asset requests. Icons are original inline SVG line geometry, with text labels on navigation and actions.

At widths below 760px navigation becomes a horizontally scrollable compact bar. Fleet rows become stacked cards with visible labels rather than squeezing a table. Dialogs become full-width sheets with internally scrolling content, bounded at 100dvh. Every layout must work at 320 CSS pixels and 200% scale. No fixed-height content boxes truncate bilingual copy.

## Screen inventory and actions

| State ID | Surface | Workflow and real service binding |
| --- | --- | --- |
| auth.loading | Session check | GET auth/status and auth/session, explicit retry on unavailable service |
| auth.setup | First-owner setup | Local owner setup authorization, username and password sent once to auth/setup; no persistence of inputs |
| auth.login | Owner sign-in | POST auth/login, show service errors without exposing credentials |
| onboarding.connection | Setup checklist | Real health and discovery checks, optional appearance choice, saved step, Back/Next and resume |
| fleet.empty | Fleet | Empty workspace explains no workers exist and offers Create workers |
| fleet.list | Fleet | GET workers, independent search, infrastructure/auth/pairing/task status, selected IDs and bulk actions |
| worker.detail | Worker | GET worker detail; independent infrastructure controls and auth states, update/repair/drain actions |
| worker.auth | Worker connection | Separate Codex, GitHub and pairing sections; start/status/input/disconnect routes; transient values never enter history or export |
| create.spec | Create workers | Discover region/type/subnet choices, worker count and storage; server review before launch |
| create.review | Cost review | Exact reviewed specification, currency/rates/expiry when returned, separate explicit launch confirmation; edits invalidate review |
| tasks.list | Tasks | Actual queued/running/completed state, local search, dispatch to real available worker |
| task.detail | Task | Actual events/output, explicit approval cards and cancel/input actions; no invented progress percentages |
| operations.list | Operations | Durable operation rows and per-target results, retry from actual outcomes, partial success displayed |
| settings.preferences | Settings | Local language/theme/density/motion/sound/narration/wording preferences and reset, searchable sections |
| docs.tasks | Help | Task-led guides for setup, cost review, auth, dispatch, recovery and data boundaries; visitor-owned checklist persistence |
| global.offline | Service unavailable | Last fetched records marked stale, mutations unavailable, retry |
| global.error | Action error | Inline actionable result, pending control restored, no success claim |

## Interaction, accessibility and privacy

All controls have visible focus, semantic labels and at least 40px targets. Dialogs use native dialog semantics, initial focus, Escape dismissal and focus restoration. Destructive controls require a distinct confirmation naming exact targets and preserve workspaces by default. Bulk results name each target separately. Status does not depend on color. Live results use polite announcements without moving focus. Fetches use same-origin cookies and CSRF from the session; responses are parsed defensively. Codes, prompts and auth inputs are never console logged. Sensitive auth responses remain in component memory and clear when closed or disconnected.

Search fields own separate plain/regex mode, pattern, flags, validity and saved snippets. The adjacent editor provides guided syntax insertion, bounded isolated match/replace/split execution, groups, timing, export and explanations. It truthfully identifies JavaScript engine semantics. Native tracing, cross-engine conversion, filesystem replacement and full RegexBuddy parity remain unfinished and visibly disclosed, never simulated.

## Localization and personal wording

English, Cantonese and bilingual choices persist locally; bilingual labels wrap. Plain professional copy is the shipping default for this product. Theme, spacing and motion preferences persist separately from server configuration. Personal wording uses the documented versioned JSON contract with 256 KiB byte limit, depth 8, bounded string entries, duplicate/unsafe/unknown-key rejection, complete validation before atomic caching, revalidation on load, local-only application at owned UI text boundaries and immediate clear/reset. File paths, source filenames, actual mappings and external records never enter exports, requests or diagnostics. Global JSON drop and Settings upload share one loader. Successful import provides a nonblocking three-second celebration, reduced-motion behavior and optional outcome audio; invalid input preserves the prior wording.

## Deterministic references and acceptance

Reference screen identifiers above are stable. Required tuples: 1440x900 and 320x720 browser viewports, English/Cantonese/bilingual, light/dark, 100/125/150/200% scale. Representative visual states include empty fleet, populated test-only fixture, create review, worker auth, task approval, operation partial result, settings and help. Test fixtures must be separately identified and must never populate production service state. Source inspection and this design document are not visual evidence. Capture receipts must name exact source commit and built asset hash.

The complete required-feature inventory is maintained by the integrating owner. This handoff does not claim completion of universal tool suites, all appearance/context-menu controls, full regex parity, credential-vault features or release/runtime acceptance. Unfinished applicable items remain explicit in that inventory.
