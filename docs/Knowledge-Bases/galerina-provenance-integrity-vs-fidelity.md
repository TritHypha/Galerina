# Provenance: integrity ≠ fidelity (#36 P1 scoping)

**Date:** 2026-06-26 · **Type:** standing invariant + scoping pass (no deep build now) · **Origin:** threat-model
#36 finding **P1**, sharpened by the RD-0117 worker re-verify of the H5 photonic-admission fix (which surfaced a
*second* instance of the same gap). This is the one-page scoping the worker recommended: record the invariant,
enumerate the instances, define the acceptance bar, and **defer the build behind emitter-completeness**.

## The standing invariant

> **A verified signature proves AUTHENTICITY + INTEGRITY — that these exact bytes / this exact label are
> unmodified since a trusted key signed them. It does NOT prove FIDELITY — that the bytes faithfully realize
> the source semantics, nor that a named label faithfully reflects the physical substrate.**

Signing binds *who vouched* and *that nothing changed*. It says nothing about whether what was vouched-for is
*correct*. Treating a valid signature as a fidelity proof is the P1 fail-open: provenance attests the wrong
property for the trust decision being made. This invariant belongs in every place a signed artifact gates a
behavioural decision (admission, boot, dispatch).

## The two concrete instances now on record

| # | Where | What is signed | The fidelity gap | Acute risk bound |
|---|---|---|---|---|
| **P1-a** (original) | Emitter / build provenance — `manifest-generator` / `proof-graph` sign the emitted WAT/WASM | the exact emitter output bytes | a *non-faithful* emit (a legal `.spore` whose WAT the assembler rejects → minimal-encoder stub) is signed-as-correct: the signature attests the stub's bytes, not that the stub realizes the source flow | **bounded by C2's faithful-compile gate** — under `GALERINA_PROFILE=production` a non-faithful stub (`diagnostics≠0`) FAILS the build before signing. So the acute exploit (ship a signed stub) is shut; the deep gap (a *non-stub but divergent* emit) remains |
| **P1-b** (new, RD-0117 probe 5c) | Photonic certified admission — `verifyPhotonicCertifiedAdmission` (`hybrid-engine.ts`) | a `BridgeManifest` whose `hardwareIdentity` claims `"photonic…"` | `hardwareIdentity.startsWith("photonic")` is a self-asserted label the signer vouched for, NOT proof the backend is physically photonic. A trust-root holder can sign a coupon labelled photonic for a non-photonic backend | **bounded by trust-root possession + operator config** — reaching it needs the engine's pinned signing key AND the operator to declare the matching `bridgeId`. Outside the confused-deputy model (an unprivileged caller is dead: forgery/cross-policy/cross-id all fail closed, verified RD-0117 + RD-0129). The load-bearing binding is `bridgeId === declaredBridgeId` under a verified signature; `hardwareIdentity` is advisory |

Both are the *same shape*: a signature is load-bearing for a property it does not actually attest.

## The equivalence-attestation acceptance bar (what a real P1 fix must clear)

The deep fix is to attest **equivalence**, not bytes — i.e. sign a proof that the artifact *faithfully realizes
its source*, per construct, not merely that its bytes are unmodified. The acceptance bar:

1. **Reference semantics.** The walker (`interpreter.ts`) is the reference; the emitted WASM must be observably
   equivalent to it. This is the existing **0014 differential discipline** — the seed harnesses already in
   `galerina-core-compiler/tests/`: `fidelity-differential.test.mjs`, `wat-i64-differential.test.mjs`,
   `u64-wasm-differential.test.mjs`, `float-nonfinite-wasm-parity.test.mjs` (walker ≡ WASM, byte/value-exact).
2. **Per-construct coverage, fail-closed on a gap.** Equivalence must be established for *every* construct the
   emitter lowers; any construct without a differential witness must DENY the fidelity attestation (not pass by
   omission) — the deny-by-default discipline. A construct the emitter cannot lower must be a hard
   compile-reject, never a silent stub (this is the emitter-completeness dependency).
3. **The attestation signs the equivalence verdict, not the bytes.** `TestWitness`-style: a signed receipt that
   binds the artifact hash to *the differential corpus that passed for it*, so a verifier admits only an
   artifact whose fidelity (not just integrity) was witnessed. (`leak-proof.ts` `TestWitness` + the 0014
   harness are the two halves to join.)
4. **For P1-b specifically:** demote `hardwareIdentity` to documented-advisory (done — code comment +
   `bridgeId` binding is load-bearing); a true substrate-fidelity proof would require a hardware attestation
   root (TPM/secure-element measuring the actual backend), which Galerina does not own — so P1-b's deep fix is
   **out of scope by design** (Galerina governs; it does not manufacture a hardware root of trust). Keep the
   binding + the advisory label + the operator-config trust boundary.

## Decision — DEFER the build, keep the invariant

- **Do now (done this pass):** record the invariant (this doc); add the advisory-label code comment at the
  `hardwareIdentity` check; cross-link from the threat-model P1 row. No behavioural code change — the acute
  cases are already bounded (P1-a by C2, P1-b by trust-root + binding).
- **Defer:** the equivalence-attestation build is the **emitter-completeness workstream** — differential/
  equivalence checking of emitter output against the walker reference *per construct*, then signing the
  equivalence verdict. That is a large, separate effort, rightly not bundled into a security hotfix. It unlocks
  when the emitter lowers enough constructs that per-construct differential coverage is tractable.
- **Do NOT** treat a passing signature as a fidelity proof anywhere new without a differential witness behind it.

See also: the threat-model P1 row (`galerina-threat-model-unleashed-2026-06-25.md`), `galerina-rd-0128-cicd-native-testgen.md`
(the `TestWitness` receipt), and the 0014 differential harnesses.
