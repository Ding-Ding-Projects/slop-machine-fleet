# Documentation design handoff

## Product and reference

A public, static documentation companion for Slop Machine Fleet. It explains the installed application without controlling workers or impersonating its live state. The original design at commit 3aa1ca8 supplies the lime primary, warm neutral surfaces, Geist typography and rounded cards. Build preparation reads pinned token/font bytes directly from that reference, never copying reference material into a new tracked source tree.

## Task-led reading

Home begins with three guided journeys: establish a trusted controller, provision with a reviewed cost estimate, and supervise/recover a worker. A visitor selects a journey and step, changing the contextual explanation and relevant article links. The local checklist stores only visitor progress and is visibly labelled as a reading aid, not evidence of installed execution. The article library follows task categories and human-readable titles, with complete content and source provenance.

## Routes and states

Hash routes support home, settings, category and complete article readers. A persistent search above every route indexes all article text and exposes the existing independent regex workbench. Article headings have stable deduplicated anchors; relative article/image links resolve to bundled internal content. Missing links display unavailable rather than silently fabricating a destination. Loading, empty search, invalid pattern, absent release, unknown route and storage failure have explicit states.

## Privacy and security

Public documentation has its own safe preference provider with language/theme/reduced-motion and visitor progress only. It never reads or imports personal wording, authentication or controller configuration. Shared search is bound at build time to this safe provider. Markdown uses a real parser and React token rendering, never raw HTML insertion. Only bundled local images render; unsafe URLs and external embeds remain inert. No controller calls, telemetry, remote fonts or CDN assets.

## Responsive and accessible behavior

Desktop: bounded reading column, task navigation alongside content. Narrow screens: single column from 320 CSS pixels, wrapping controls, independently scrollable code/tables, visible focus and skip link. English, Cantonese and bilingual interface modes; original articles retain their source language with an explicit note. Light/dark/system preference persists locally. Reduced motion is respected. Controls have native labels and state announcements.

## Build and delivery

The prepare script inventories every root docs Markdown article and root README, plus any prepared wiki present under docs/wiki. It records SHA-256 provenance and copies referenced local image assets safely. Downloads remain unavailable without a validated release configuration, verified externally by the parent. Base URL is /slop-machine-fleet/. Hosting and actual deployed evidence belong to parent integration.

## Gaps

Full regex parity, complete universal settings, all required feature equivalents, native onboarding, packaged documentation companion, translated full articles and real built/deployed matrix evidence remain incomplete. No generated interface image is runtime proof.
