# Private GitHub Pages delivered as a packaged desktop application

Private repositories do not host a GitHub Pages, because private hosting needs a paid plan; they deliver it as a packaged desktop application instead, under user’s owner exception of 2026-10-16 that is limited to this delivery format. The package carries the same reviewed static content a hosted site would: landing, download presentation, complete documentation articles, complete wiki content and working internal navigation, all offline with no remote asset. It is built through the repository’s existing build.bat and build-installer.bat entrypoints, released as a normal release artifact, and verified by launching the built package rather than a hosted URL. No About homepage URL is required, and private content is never published to a public host to work around the plan limit.

## Applicability

The source repository is public. Its public documentation and additional companion delivery remain required separately.

## Current delivery state

Not applicable for the specific reason above.

## Acceptance

Reassess if the product scope changes.
