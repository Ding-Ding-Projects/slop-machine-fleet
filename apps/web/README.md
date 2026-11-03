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

The regex engine is the current browser's JavaScript RegExp, not an emulation of other engines. Full RegexBuddy parity, native tracing, cross-engine conversion, filesystem replacement and backup workflows are unfinished. The complete required-feature inventory remains the authoritative list of wider unfinished product work. Many controls currently use native HTML semantics; only primary and outlined action buttons use registered Material Web primitives, so complete component conformance is not claimed. Synthesized outcome cues are not the Windows system tada sound. Full narration serialization, per-element appearance/locks, universal utility suites, complete control-search coverage and complete localized runtime proof remain unfinished.

Type checking and loader unit tests do not prove built UI interaction, layout parity, real cloud provisioning, remote account authentication or release acceptance. Those require the integrated service, actual configuration, deterministic built captures and the owning repository's acceptance record.

