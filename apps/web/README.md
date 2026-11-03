# Fleet browser workspace

React and Vite client for the same-origin authenticated fleet service. Production assets are generated into `dist/`; the controller serves that directory and `/api` together. The desktop wrapper opens the same product surface.

## Local development

Install the root workspace dependencies, then run `npm run dev --workspace @fleet/web`. The Vite development server proxies `/api` to the controller on loopback port 3000. Product builds use the repository's root `build.bat`; this workspace's build script performs TypeScript checking and Vite asset production as its child step.

## Implemented routes

- Controller owner setup and sign-in, session-derived CSRF mutation headers, sign-out and expired-session handling.
- Real worker list with empty and offline states, independent lifecycle and transport status, multi-select actions with a two-key confirmation, durable per-target operation results.
- Worker creation with server-side cost review, exact reviewed specification, review expiry and unavailable-price blocking, explicit cost approval and stable idempotency key.
- Separate Codex, GitHub and pairing connection flows with status reads, start/input/disconnect, transient verification presentation and secure-link validation.
- Task dispatch, actual result inspection, individual approval responses, interactive input and explicit cancellation.
- Persisted language, theme, density, reduced-motion, attention and audio preferences; local-only personal-wording import and clearing; task-led help with persisted reading progress.
- Independent adjacent regex editors on the implemented collection searches. Evaluation runs in a disposable browser worker with a 250 ms wall-clock limit, a 512-character pattern bound, a 32 KiB sample bound and 200 displayed matches.

## Boundaries and incomplete acceptance

This client never populates production with demonstration workers. A provider code does not imply a verified connection. No browser credential or wording payload is included in task requests or diagnostics. Personal wording uses `{ "schemaVersion": 1, "entries": { "source": "replacement" } }`, limited to 256 KiB UTF-8, depth 8, keys of 160 Unicode code points and values of 1,000. Duplicate JSON keys, unsafe keys, additional schema fields and unsupported versions are rejected. Empty inventories are valid; the entry count is derived from the payload rather than capped independently.

The regex engine is the current browser's JavaScript RegExp, not an emulation of other engines. Full RegexBuddy parity, native tracing, cross-engine conversion, filesystem replacement and backup workflows are unfinished. The complete required-feature inventory remains the authoritative list of wider unfinished product work. Many controls currently use native HTML semantics; primary/outlined action buttons, core outlined fields, preference switches/sliders and confirmation checkboxes/sliders use registered Material Web primitives, so complete component conformance is not claimed. Synthesized outcome cues are not the Windows system tada sound. Full narration serialization, per-element appearance/locks, universal utility suites, complete control-search coverage and complete localized runtime proof remain unfinished.

Type checking and loader unit tests do not prove built UI interaction, layout parity, real cloud provisioning, remote account authentication or release acceptance. Those require the integrated service, actual configuration, deterministic built captures and the owning repository's acceptance record.


## Task transcript

The task detail reads the authenticated same-task `/api/tasks/:id/output` endpoint with a sequence cursor. It renders actual assistant text, commands, command output, file changes, progress, state and results. Assistant and result content use a safe Markdown subset (paragraphs, headings, lists, emphasis, inline code, fenced code and explicit HTTP/HTTPS links). Raw HTML is inert, images are never fetched, credential-bearing URLs are not linked and external links open with no opener relationship. Other event classes remain escaped text. Combined command output is labelled combined; stdout and stderr labels appear only when the service supplies those real stream values.

Each request is abortable and owned by the current task generation. Changing tasks, closing the detail or losing authentication cancels owned reads and rejects late responses. Local retention is bounded to 512 events and 256 KiB of content; a visible warning reports local removal, server replay gaps, worker resets, truncation and redaction. A successful later poll does not erase a prior gap. No progress percentage, completion claim or missing event is synthesized.

Following pauses when the reader scrolls more than 48 pixels away from the bottom. Pause following keeps receiving data without forcing scroll position. Follow latest is an explicit action that returns to the bottom. A named keyboard-scrollable region contains output; a separate polite status reports retained-event count without reading every incoming line aloud. The transcript has its own independent search and adjacent regex editor.

Local tests cover cross-task rejection, unknown event kinds, sequence order, duplicate replay, reset semantics, retention bounds, sticky truncation/gap markers and inert Markdown/link handling. These are protocol and rendering-model checks, not built-browser scrolling or assistive-technology proof.

## Preserved design version 2

Runtime `theme.css` imports the original `design/design-system/tokens.css` from the integrated source tree. Vite bundles the referenced Geist, Geist Mono and Material Symbols Rounded files without fetching a CDN. The build also emits the original font licences under `licenses/` and a SHA-256 `design-font-provenance.json`. The preserved reference tree is therefore a required build input, not a second stylesheet copied into this workspace.

New profiles default to the reference's dark theme; explicit existing light/system preferences remain unchanged. `reference.css` maps surface roles, type, spacing, shapes, focus and elevation onto the current productive workflows. The brand is the named deployed-code symbol and wordmark, not a new invented logo. Status chips retain the actual state word and a named symbol, with separate data colors. Account codes remain hidden until an explicit per-flow reveal, and replacement/expiry resets the reveal.

The adapter module uses registered Material Web controls and native input events for controlled values, while retaining form validation and labels. This pass covers core fields, common primary/outlined actions, preference switches/sliders and destructive confirmation controls. Native selects, remaining collection controls, complete CJK vendoring, full-screen references and full design parity remain unfinished. Type checks and source mapping do not substitute for built font, form, keyboard, layout or screen-reader evidence.
