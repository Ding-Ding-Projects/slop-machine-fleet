# Authenticated workspace platform handoff

Status: proposed bounded module design. Independent review is required before runtime implementation.

## Ownership and integration

This module owns only `apps/web/src/platform/**`, `apps/web/tests/platform*`, `design/platform/**` and `docs/features/platform/**`. It imports the existing Material Web adapters, Search workbench and useUI localization. The parent integrates exported `PlatformProvider`, `PlatformShell`, `PlatformSettings` and `usePlatform`; no existing application, preferences, settings, material or tools file is edited by this module.

The provider requires an authenticated flag, an explicit destination registry and an explicit setting registry. Destinations have stable technical IDs, bilingual labels/descriptions, a named icon and a real renderer callback. Settings have stable IDs, bilingual labels/descriptions, a declared destination and a real focus callback or registered data-element-id. No default or guessed product destinations are generated. The catalog reports only actual registered entries. Parent integration must supply every real destination and setting before complete coverage can be claimed.

## Navigation

A browser-style tab strip maintains stable tab IDs, active state, pinning, reordering and explicit close controls. Opening a workspace uses an opaque caller-owned workspace key and focuses an existing matching tab. Ordinary navigation focuses an existing destination or replaces the current tab destination without adding tabs. Only explicit New tab catalog selection creates a utility tab. The catalog contains all actual registered destinations, searchable through its own adjacent independent Search editor. Ctrl+Shift+F opens the command palette with actual destination and setting results; setting selection opens its owning destination then focuses the exact registered control. Missing/unmounted controls report unavailable rather than claiming a successful teleport.

Persist only technical destination/tab/workspace IDs and user-owned platform preferences. Caller-owned workspace keys must be opaque, never repository paths, URLs, prompts or account data. Display labels come live from the registry, not saved snapshots. Unknown registry IDs remain recoverable unavailable entries, never silently remapped. Clear/reset and closure preserve current ownership boundaries.

## Safe notification center and append-only history

Notification input is a structured allowlisted status record: fixed event kind, fixed outcome, registered destination ID and numeric affected count. No provider body, arbitrary message, task content, code, credential, prompt, path, account identity or wording payload is accepted. UI copy is generated from that metadata at display time. History stores original technical metadata, never localized or personal wording text. Notifications can be selected, dismissed in bulk and revisited in the center. Each record and dismissal is bounded and persisted locally; storage failure leaves an explicit unsaved state.

History covers only the module's own nonsecret preferences and appearance records. Each mutation appends a new immutable sequence record. Restore appends a new restore event referencing the original sequence; it never rewrites history. Notification records and platform history are separate from product/task data. Exports include all supported safe records and disclose excluded sensitive/product data and unsupported projections. Source inputs and personal wording never enter these exports.

## Appearance

Explicit `data-element-id` registration supplies stable IDs and bilingual names. The editor selects only actual registered targets, discovers the live matching element under the provider root, and applies validated CSS custom properties/classes for foreground/background, font family/size/weight, spacing, border width/radius and motion. Values persist locally and can reset per target or globally. Existence and actual style application are reported separately. Invalid colors, CSS injection, unbounded values and missing targets are rejected. Changes use the same append-only history route. The editor itself is searchable with its own adjacent builder. This is a bounded appearance subset, not complete per-element Word-depth parity or element-lock implementation.

A local custom-logo upload is a secondary capacity item, not an assumed completed feature. If implemented, it needs byte/signature, dimensions and decode bounds, an actual crop/fit consumer, persistence, reset and no export of source pixels or metadata. Otherwise record it explicitly unfinished rather than shipping a decorative picker.

## Export formats

Generate valid JSON, YAML, TOML, XML, CSV, TSV, Markdown, HTML and SQL from one safe export envelope. JSON/YAML/TOML/XML preserve typed records; table formats use explicit typed cells or serialized nested fields with a documented reconstruction convention. Markdown and HTML are human-readable complete representations with escaping. SQL uses a declared SQLite-compatible schema and transaction, escaping string values. Every export includes schema version, exclusions and any format-specific representation limits. Downloads are explicit, object URLs are revoked, no network is used and no clipboard copy occurs automatically.

## Accessibility and proof

Use genuine Material Web buttons/fields/selection controls where existing adapters support them, original v2 role colors and bundled fonts, keyboard operation, named dialogs, focus restoration, 320px layouts and reduced motion. English, Cantonese and bilingual labels use useUI; stored/exported records never use display translations. Every owned search has an independent adjacent Search editor, with its existing truthful regex limitations.

Focused tests must cover registry uniqueness, stable workspace identity, explicit-only tab creation, unknown destination recovery, safe notification rejection, append-only restores, validated appearance bounds, storage corruption, and valid escaping/type retention in every export format. Built interaction, screen-reader behavior, complete catalog integration and genuine captures remain parent acceptance work. Full tab grouping, all discovery searches, every-element typography/locks, unlimited history retention and complete universal feature coverage remain unfinished unless actually implemented and proved.

## Real application integration milestone

Integration starts from exact parent App commit `67a691c`, preserving its Tools destination. Authenticated session scopeKey is required and cleared on expiry/logout; old session/refresh responses are rejected by epoch and abort ownership. Real destinations are fleet, tasks, operations, tools, features, settings, help and platform-control. The old palette shortcut owner is removed.

The setting registry contains 17 actual controls and four actual section controls. Prepare callbacks open the owning settings section before exact data-element-id focus. Appearance targets cover these real controls and eight actual surface wrappers. Repository workspaces use SHA-256 keys derived only from validated GitHub repository HTTPS URLs; current real task records resolve the scoped list without persisting raw URLs in platform metadata.

Safety consumer inventory: Fleet selection/bulk confirmation and mutation; CreateWorkers configuration/review/approval and discovery/review/launch pending state; Tasks dispatch draft and mutation; TaskDetail input/approval/cancel state; WorkerDetail lifecycle confirmation/mutation; each of Codex/GitHub/pairing input/pending state; Settings reset decision; preferences persistence and local wording-read booleans only; onboarding persistence/check state; Help checklist durability; both mounted Tools panels through their real onSafety/onLifecycle callbacks; platform appearance drafts/scoped readiness; and all API POST/PUT/PATCH/DELETE through an integer-only counter. Task snapshots are known only after a successful actual service read. Unknown task states, unavailable workflow reports or durability failures block updater restart.

Tools peers are read from `6a90e50` and DesktopUpdates from `8115fd7` in a read-only TypeScript virtual host; no peer duplicates are committed. Live Tools state is unknown until the actual callback reports; failed preference/Help/onboarding persistence remains blocked until explicit successful recovery. No provider text, prompts, authentication values or private wording are copied into safety records or generic notifications.

Checks: virtual integrated TypeScript passes; six focused integration tests cover actual API counter failures/overlap, stale workflow decisions, all unknown updater inputs and opaque repository identity. Parent build and native update behavior remain unverified.

## Integration review repairs

Update safety is now unknown during every reconciliation read, on stream disconnection and on every API mutation begin/end. Successful task snapshots carry an actual read timestamp, expire after four seconds and are refreshed every three seconds. A read that overlaps any API-write revision cannot restore readiness, even if that write has already settled. The updater remains subject to native bridge freshness and actual runtime acceptance.

Sign-out composes workflow vetoes with platform appearance-draft vetoes. Exact setting preparation waits for a scoped mounted Settings registration and the real target, instead of broadcasting before mount. Teleport includes genuine Material button hosts and verifies focus acceptance. Eight integration tests and the immutable-peer virtual TypeScript check pass. Background throttling, native bridge expiry, real custom-element focus and complete dirty-flow interactions remain runtime acceptance.
