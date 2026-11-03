# Shared parser integration verification

## Candidate and scope

- Integrated candidate: `c6d30ad42787f6b851516ae6a33fa93bd1730618`.
- Exact shared parser delta: `50ad71f0986312db4d66110eb46973a1c9d22cdd`.
- Common baseline: `8fd472a947f5021ad23a66e1adcc7155f2a118a7`.
- The merge preserves both histories and changes only the twelve paths in that parser delta. The public preference, history, storage and worker isolation adapters remain unchanged.

## Verified source and build results

The exact root command `cmd /c build.bat /s` completed with exit code 0 for the candidate above. The generated documentation records version `0.1.2`, source commit `c6d30ad42787f6b851516ae6a33fa93bd1730618` and build provenance `2026-11-03T15:08:43.265Z`.

- `node --test apps/web/tests/tools*.test.mjs`: 47 passed, 0 failed.
- `node --test apps/docs/tests/*.test.mjs`: 18 passed, 0 failed.
- `node apps/docs/scripts/verify-public-bundle.mjs`: four actual production module graphs inspected; two storage graphs use the public adapter; forbidden application-state modules absent.
- Documentation inventory: 149 complete articles, no local image references, five font/licence files. No verified release download was claimed by the generated inventory.

The tests cover exact percent-decoded octets, chunk-split escapes, malformed-percent absolute offsets, preserved Base64 behavior, bounded large literal payload handling, storage ownership and cleanup, and public namespace/isolation negatives.

## Bound production assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `base64-stream-worker-ClL-VSs_.js` | 28,927 | `4c0d65952c493d3f9b73af705da0e1ae68bb6d2562b27b6f311baf1725a9ec76` |
| `index-Cy-b2YBz.js` | 670,695 | `f73060c5f09ba8d4c2eb2df8e9698c2556896093ab7b5ab9be8e669fc423ab0c` |
| `worker-DZUF_F3J.js` | 11,124 | `7e56b5ae9a8fb31232ae274715d4dbded825252b42ee6d211edb7dbed5b11152` |

## Acceptance boundary and continuation

This record proves the named source checks and exact build only. Browser use and updater launches were prohibited and did not occur. There was no alternate runtime route, trust change, provider configuration, publication or remote push. Native OPFS, clipboard, media, audio, navigation and GUI acceptance remain unverified. The existing large-entry-chunk build warning remains visible.

Independent parser review is tracked separately by the integrating owner. Integrate only after that verdict is resolved. A later source or build must retain its own binding rather than inheriting these asset hashes. This handoff itself does not relabel the candidate build as a later commit's output.
