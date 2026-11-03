# Streaming Base64 core

The reusable modules in `packages/shared/local-base64/` process at most 65,536 input bytes per chunk. Stateful encoding retains at most two source bytes; decoding retains at most three alphabet entries. Standard/URL-safe alphabets, canonical padding validation, absolute invalid-character offsets and wrapping survive arbitrary chunk boundaries.

`convertStream` accepts a source iterator, a sink and cooperative pause/resume/cancel controls. It hashes input and output incrementally with the maintained MIT-licensed `@noble/hashes` 2.0.1 implementation, seals and rereads the output, compares its independent readback hash, then performs a Base64 decoding round-trip before allowing the sink to commit. Cancellation, invalid input and altered output abort the sink rather than exposing partial data as complete. A source iterator may have one bounded chunk prefetched at a pause boundary; it does not continue advancing while paused.

The file workspace now wires this core to a module worker and browser-private temporary storage. It requires explicit payload-storage consent, checks estimated quota before opening output, rejects filename collisions, exposes pause/resume/cancel and records cleanup uncertainty in lifecycle safety. Results remain temporary until explicitly downloaded and are removed only by their exact owned identifier on clear or cancellation. Browser crashes can leave temporary copies; that limitation is disclosed before consent. Bounded text/hex and sandboxed dimension-checked image previews require an explicit preview action. ZIP export, durable metadata history, audio/video preview and streaming data URLs remain follow-up work. Actual browser runtime acceptance is pending.

## Dependencies and provenance

Exact pins are `@noble/hashes` 2.0.1 and `fflate` 0.8.2. Their official tagged sources are https://github.com/paulmillr/noble-hashes/tree/2.0.1 and https://github.com/101arrowz/fflate/tree/v0.8.2. Both use the MIT licence. Retained licence bytes and independently calculated downloaded-package SHA-512 receipts live beside the scoped package. Registry integrity comparison establishes downloaded bytes, not an independent security audit. Root dependency integration is separately reviewed.

## Verification

Tests compare codec output against Node's independent Base64 implementation across every small split, reject malformed padding/trailing bits and report offsets across chunks, corrupt real sink readback to prove commit prevention, verify pause/resume/cancel behavior and compare incremental SHA-256 against Node crypto. A synthetic file larger than the former 8 MiB UI bound uses a real disk-backed sink while every write and read remains bounded. Runtime and UI acceptance are not claimed by these core checks.


The independently exported `StreamingBase64` component is available for later documentation integration. It uses the host preference interface for localized copy and notifications. The current application cancels owned work and invalidates asynchronous generations on unmount; host authentication transitions must unmount or explicitly discard the owning tool. No controller API or payload network request is used. Three storage tests verify consent before access, quota failures, collision refusal, commit-before-exposure and exact-owned cleanup.
