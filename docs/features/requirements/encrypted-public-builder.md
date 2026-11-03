# Encrypted public builder for private repositories

Private repositories build and release through the encrypted-public-builder skill: a gibberish-named public builder holds only an encrypted, name-free payload behind opaque per-project ids, releases publish only back to the private repository, and the private source keeps .github/workflows absent. No public location ever reveals the private repository's name, products, build details, or release target. An unavailable builder is an exact blocker, never a fall back to an unencrypted installer.

## Applicability

The product source is public; no private source is sent to a public builder.

## Current delivery state

Not applicable for the specific reason above.

## Acceptance

Reassess if the product scope changes.
