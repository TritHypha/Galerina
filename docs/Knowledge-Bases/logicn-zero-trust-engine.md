# Concept: LogicN as a Zero-Trust Engine

> **Status:** settled-design / narrative concept (2026-06-17). This is a **description of already-shipped, test-passing architecture**, not a proposal. Origin: `notes/39-zero-trust`. A codebase-grounded review classed it ~95% recap; do **not** open build tasks from it. The two genuine residuals are tracked at the bottom. Authoritative runtime status remains the runtime-status SOT, not this concept doc.

## The concept

In conventional stacks a "zero-trust engine" is a module bolted onto the side of an app. In LogicN there is no bolt-on: **the language and runtime *are* the zero-trust engine.** The component that performs the physical enforcement is the **Governance Border Gateway** — an inescapable choke point (the "Toxic Border") between governed business logic and untrusted external "brawn" compute. Nothing in the brawn layer reaches the host OS or network without passing back through this gateway.

Pipeline position:

```
Brain (LogicN flow)  →  GIR (Governance Intermediate Representation)
        →  ▌ZERO-TRUST ENGINE — the Border▐  →  Brawn (external compute)
```

Brawn = `.tmf` NVFP4 vector streaming, the elastic-precision photonic CPU (tower-citizen), or an out-of-process subprocess such as the IBM `ffsim` quantum backend.

## The four mandates (and where each is implemented)

| # | Mandate | What it does | Shipped implementation | Status |
|---|---|---|---|---|
| 1 | **K3 Capability Gate** | Evaluates the environment in strict 3-valued logic before brawn spins up; `Allow(+1)` proceeds, `Deny(-1)`/`Unknown(0)` → fail-closed. Never silently collapses (emits `LLN-GOV-3VL-001`). | `logicn-tower-citizen/src/three-valued-governance.ts` (`vAnd/vOr/vNot`, `decideAtBoundary`); transition form in `governance-enforcer.ts` (`0→+1` is a RESTRICTED transition needing audit signature). Reuses balanced-trit gates in `tpl-simulator.ts`. | ✅ shipped · 17/17 tests |
| 2 | **Substrate Validator** | Keeps bit-exact crypto on the deterministic digital core; rejects crypto on a noisy/analog/photonic lane (`LLN-SUBSTRATE-001`), and unvoted analog into a deterministic sink (`-004`). Compiler pass, always-error, fail-closed. | `logicn-core-compiler/src/substrate-inference.ts` (`CRYPTO_EFFECT`, `checkSubstrateViolations`); wired into the pipeline at `governance-verifier.ts`. | ✅ shipped · 27/27 tests |
| 3 | **Attestation Verifier** | Verifies cryptographic proofs before letting the app read payload: TMX-256 root digest + signature verify-before-read; hybrid **Ed25519 + ML-DSA-65** (verify BOTH, no PQ downgrade). | In-process **BridgeManifest** path fully verifying: `logicn-tower-citizen/src/bridge-attestation.ts` (`verifyAttestation`, `verifyAttestationHybrid`). TMX-256 core in `logicn-ext-tmf/src/tmx256.ts`. | ✅ in-process path shipped · ⚠️ `.tmf` *file-format* signature pending (see residuals) |
| 4 | **`LOAD → TRAP → ERASE` kill-switch** | On any violation: trap the error, write a cryptographic audit record, and hard-wipe memory (`zeroize`) so no state survives for an attacker to scrape. | `logicn-tower-citizen/src/tower-runtime.ts` (load/execute/erase + budget trap), `audit-logger.ts` (TRAP/ERASE phases, HMAC-chainable), `tpl-simulator.ts` (`mem.fill(0,…)`), `logicn-core-config/src/posture.ts` (`zeroizeAfterUse` default-on, fail-secure). | ✅ shipped |

The concrete Tier-3 example (the `ffsim` quantum subprocess) composes all four: hybrid attestation is **required by default, no classical fallback** (`logicn-ext-bridge-quantum/src/attestation.ts`).

## Honest caveats (do not let the narrative over-claim)

- **`.tmf` file-format signatures are not yet verified.** The note implies signed `.tmf` files are signature-checked before read; today only the **in-process BridgeManifest** path verifies. The on-disk `.tmf` reader computes/checks the TMX-256 root but **fails closed** on a signed file (rejects rather than downgrading) — safe, but a completeness gap. → tracked as **.tmf engine slice 4 / roadmap #7**.
- **JS-level `zeroize` cannot guarantee no paged/GC copy survives.** Honestly documented (`logicn-core/docs/memory-safety.md`, report-if-cannot-guarantee). Don't market "no state survives" literally.
- K3 collapse uses balanced trits `{-1,0,+1}` (`DENY < INDETERMINATE < ALLOW`), **not** `{0,½,1}`; and the calculus is **no-coercion** (0 preserved mid-composition, collapsed only at the boundary). See `logicn-three-valued-governance.md`.

## Genuine residuals (the only forward-looking items)

1. **`.tmf` file-format signature verify-before-read** — engine slice 4 / roadmap #7 (already on the build plan; current behaviour is safe/fail-closed).
2. **Mid-compute capability revocation** — re-evaluate the K3 verdict *during* a long-running brawn job and pre-empt + zeroize. All primitives exist (`decideAtBoundary` + `TowerRuntime.evict` + `tpl-simulator.erase`); only the orchestration is unbuilt. File a separate scoped note **only if** a real long-running-external-compute use case needs pre-emption.

## Cross-refs
- `logicn-three-valued-governance.md` (K3 calculus, LLN-GOV-3VL-001)
- `logicn-governance-rules.md` (LLN-SUBSTRATE-001/004)
- `logicn-tmf-engine.md` (TMX-256, container, slices)
- `logicn-ext-bridge-quantum-design.md` (Tier-3 Toxic Border example)
