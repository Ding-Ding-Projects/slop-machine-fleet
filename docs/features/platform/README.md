# Authenticated workspace platform

This reusable module provides real registered navigation, local safe records and bounded appearance editing. Parent application integration is required; importing the module does not register imaginary destinations or establish complete coverage.

## Integration

Import `PlatformProvider`, `PlatformShell`, `PlatformSettings` and `usePlatform` from `apps/web/src/platform/index.ts`.

The provider requires:

- `authenticated`: actual current service authentication state.
- `scopeKey`: the exact 64-lowercase-hex value returned by authenticated `GET /api/auth/session`. The service derives it from durable opaque controller/owner identities and normalized origin. Never derive a substitute from a password, credential, CSRF value, account name or arbitrary client string. Clear authentication and scope on logout/expiry.
- `destinations`: every actual destination, with unique bounded technical `id`, `{en,yue}` labels/descriptions, a Material Symbols name, `kind`, a real `render(tab)` callback and an optional `canLeave(tab)` dirty-draft veto. Each tab renderer stays mounted while inactive. Supply a veto for every editable destination whose replacement or closure can lose work. The built-in appearance draft also registers its own dirty state and a two-key discard decision for tab/section/target changes. Other registered editors can use usePlatformTabId and setDraftDirty for the same bounded draft protection.
- `settings`: actual setting IDs, bilingual descriptions, owning `destinationId` and exact registered `elementId`. Palette selection waits for the destination render then focuses that exact control. Missing or duplicated targets produce an unavailable state.
- `elements`: explicit stable technical IDs with bilingual names. The real target carries the same `data-element-id`. No selector strings are accepted.

Mount `PlatformShell` where the workspace should render. Register `PlatformSettings` as a real utility destination or place it inside the existing settings surface. The parent must remove its previous Ctrl+Shift+F handler when adopting the platform palette to avoid duplicate ownership. This module captures that shortcut only while authenticated and ready.

## Navigation operations

`navigate(destinationId)` focuses an existing destination or replaces the active tab without growing the strip. A pinned tab cannot be silently replaced. `newTab(destinationId)` is for explicit New tab catalog choices. `openWorkspace(opaqueKey,destinationId)` focuses an existing stable workspace identity or creates it; the key must be 32 to 64 lowercase hexadecimal characters, never a repository URL/path or account name. `activate`, `pinTab`, `moveTab` and `closeTab` operate actual tabs. Close and replace honor dirty-draft vetoes; pinned tabs require unpinning before closure.

The strip supports all four docking edges, keyboard arrow/Home/End focus, pinning, order changes, explicit selected-tab closure and local search with its independent adjacent regex editor. Unknown saved destination IDs stay visible as unavailable recovery tabs. Grouping, all universal tab searches and full tab appearance parity remain unfinished.

## Safe notifications and persistence

`notify` accepts only `{kind,outcome,destinationId,count}`. Kind is operation/settings/export/navigation; outcome is queued/running/completed/failed/cancelled/partial/unavailable; destination must be registered; count is a nonnegative safe integer no greater than one million. Unknown fields are rejected. Never pass provider messages, task text/output, authentication codes, credentials, account names, file paths or personal wording. The generated UI reads technical metadata; display translations are not persisted.

State is stored at `fleet.platform.v1.<scopeKey>` in the current browser. Entire records are revalidated before load and write, with a 2 MiB bound. Corruption fails closed and exposes explicit recovery. Storage failure leaves the previous state intact. The module does not synchronize or transmit its records.

Notification and append-only history capacity is 500 records each. Reaching capacity rejects additional recorded work instead of silently evicting the old prefix. The two-key reset explicitly removes this scoped platform data, after dirty-draft vetoes. Export before reset. Product records and credentials are not stored here or changed by reset.

## Appearance and history

`changeAppearance(id,patch)` validates and merges a typed patch. `replaceAppearance(id,value)` replaces one target's complete local override. `resetAppearance(id)` restores that target's inherited styles; omitting the ID resets all appearance overrides. `changePreferences` changes actual docking/label consumers. Each mutation appends a sequence and snapshot; `restore(sequence)` appends a new restore record rather than rewriting history.

Supported appearance properties are six-digit text/background colors; allowlisted Geist, Geist Mono, system, serif or monospace families; bounded integer font size/weight, padding, gap, radius and border width; and reduced motion. URLs, selectors, arbitrary CSS, content and unknown fields are rejected. The editor uses a draft, then Apply commits one coherent change. Clearing a draft property returns it to inheritance. Stored state and inline assignment are distinct; assigned does not prove the winning computed effect: absent or duplicated targets are not claimed styled. Original inline declarations are restored when overrides change, reset or authentication ends. Shadow-internal component styles may require a specific registered wrapper; complete per-element typography and locks remain unfinished.

## Export formats

Explicit downloads provide JSON, YAML, TOML, XML, CSV, TSV, Markdown, HTML and SQLite-compatible SQL. The envelope includes safe preferences, appearance, notifications and full retained history. It explicitly excludes product data, task prompts/output, authentication values, personal wording, source images/file metadata and workspace navigation identities.

JSON and the JSON-compatible YAML 1.2 subset preserve native types. TOML uses typed inline arrays/tables. XML uses typed object/array/member nodes. CSV/TSV every cell is prefixed `json:` and then contains a JSON-typed value; parse the table, remove that prefix and JSON-decode each cell to reconstruct it. This convention prevents spreadsheet formula execution and retains nested fields. Markdown and escaped HTML include the complete safe envelope. SQL uses fixed table/column names, escaped strings and JSON values inside a transaction. No file is uploaded; download URLs are revoked.

## Verification and limitations

Sixteen focused platform tests pass, covering safe registry/notification rejection, tab identity, explicit-only growth, pin protection, appearance bounds, append-only restoration, capacity, corrupt storage and all nine export routes. A separate local standard-parser check parsed TOML, XML, CSV, TSV and SQLite SQL, with typed TOML/table/SQL round trips; YAML uses the valid JSON subset. These are model/serialization checks, not built UI proof.

Actual catalog completeness, dirty-draft prompts, focus/keyboard behavior, current-owner isolation, element styling, narrow layouts, screen-reader behavior and built captures remain integration acceptance. Custom image logos/cropping, full typography and element locks, complete tab grouping, unlimited history and complete required-feature coverage are explicitly unfinished. No product data, sample workers or automatic cloud operations are created.
