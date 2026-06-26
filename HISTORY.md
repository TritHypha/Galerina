# Galerina: Project History & Architectural Evolution

> A lightweight, append-only record of the project's major decisions and pivots.
> For verified test counts and runtime status, see
> `docs/Knowledge-Bases/galerina-runtime-status-SOT.md` (the source of truth).
> For the build roadmap, see `docs/Knowledge-Bases/galerina-build-roadmap.md`.

## Overview
This document records the conceptual origins, evolution, and architectural pivots
of the Galerina project. It tracks the shift from a memory-safe language concept to
a hardened, governance-first inference runtime.

---

## Chronological Development

### Phase 1: Conceptual Origins (Logic Omega)
* **Initial Name:** "Logic Omega" (LO).
* **Core Philosophy:** Investigate memory-safe language design with compliance and
  auditing at the *language* level, rather than prioritizing raw speed.
* **Target Audience:** Senior developers building bespoke, large-scale industrial frameworks.
* **Target Industries:** Medical, Finance, Aerospace, Government / regulated data.
* **Governance Concept:** Initially envisioned as a deny-first contract system
  regulating the flow of functions.
* **State Management:** Originally banned global variables to ensure security;
  later pivoted to a "Global Vault" hybrid secure pattern.

### Phase 2: Refinement & Identity (Galerina)
* **Rebranding:** Renamed to **Galerina**, inspired by mathematical "N" (any number).
* **Syntax Refinement:** Shifted syntax to be more TypeScript-like to reduce cognitive load and noise.
* **Security Primitives:** Introduced types within contracts and explicit
  `safe` / `unsafe` (later `secure` / `protected`) variable markers.
* **Contract model:** `contract {}` placed *outside* the flow body (between signature
  and body), carrying `intent`, `effects` (deny-by-default), `invariant`, `ai`, etc.

### Phase 3: Runtime Maturity & WASM Integration
* **Two-stage compiler:** Stage A (TypeScript reference compiler) + Stage B
  (self-hosted `.spore` compiler emitting WASM, with Wasmtime as the only host).
* **Self-Hosting push:** Drove runtime components toward 100% in `.spore` (Pre-P9),
  so Galerina compiles itself rather than relying on Node.js/TypeScript long-term.
* **WASM Integration:** `.spore` → WAT → WASM. Benchmarked against Rust (incl. AVX2),
  Python, and Node.js across a multi-tier execution model
  (cache / passive plan / manifest / governed / WASM).
* **Economic Model:** Introduced a cost/value graph and token-based accounting on
  runtime usage (the `economics {}` layer + CostGraph).

### Phase 4: The Tower & Hardened Border
* **The Governed Tower:** A 4-floor execution architecture with a V_DPM governance
  register (capability bits, quarantine, emergency transitions).
* **DRCM (Deterministic Runtime Containment Model):** 7 phases — invariant proofs,
  `.lmanifest` admission gates, structured capabilities, DWI shared-nothing isolates
  with fuel, the DSS supervisor, Epilogue Receipts, and an OWASP negative-test suite.
* **Hardened Border:** Plugin schema validation + hard erasure + blacklist on a
  strict Load → Execute → Erase cycle.
* **Evidence & crypto:** CBOR (RFC 8949) manifests, AuditEvent/DAG tags (410–417),
  Ed25519 + ML-DSA-65 (NIST FIPS 204) governance signatures.
* **Aerospace Hardening:**
    * **Compulsory Auditing:** mandatory, non-negotiable audit for aerospace-grade deployments.
    * **Runtime Integrity:** non-deterministic constructs (e.g. unconstrained `try-catch`)
      disabled in the boot sequence for flight-critical determinism.

### Phase 5: Photonic & Ternary Integration — the Governed Inference Tower
* **Visionary Goal:** native support for next-generation photonic hardware and
  Tri-Logic (ternary, `[-1, 0, +1]`).
* **Three-package split ("Brain / Brawn / Governance"):**
    * `galerina-tower-citizen` — **Brain**: the Unified Hybrid Inference Engine
      blending BitNet ternary (MIT), NVFP4 block-scaling (Apache-2.0), and Groq
      static scheduling (MIT IP) inside one governed pass.
    * `galerina-ext-bridge-cpp` — **Brawn**: the first real `InferenceBridge`
      (BitNet CPU), with the native SIMD addon + CUDA kernel as documented seams.
    * `galerina-devtools-package-graph` — **Governance**: per-package boundary auditor
      / CI "Hardened Border" gate.
* **TPL core:** byte-faithful BitNet I2_S simulator — 2-bit packed trits, T-MAC
  (add/subtract/skip × scale), guard-page canaries, Epistemic-Hold (0→+1 requires
  an audit signature), hard erasure. Integer math only — no floating point on the
  ternary path.
* **Efficiency rationale:** ternary weights cut memory bandwidth (the CPU "memory
  wall"); maps to integer add/sub/skip and (future) SIMD `v128` / Tensor Cores.
* **Language surface unchanged:** TPL is *engine-internal* — `.spore` flows stay
  binary control-flow + governed contracts; ternary math lives inside the Tower.

### Phase 6: Runtime Wiring & The Sentinel Ecosystem (2026-06-06)
* **Brain → Brawn connected:** `HybridInferenceEngine` gained a `BridgeRegistry`
  and now dispatches each routed op through a real bridge (was an inline stub);
  ternary results pass `assertDeterminism()` (Citizen Standard 1).
* **`ai {}` governance enforced at runtime:** `approved_models` / `max_model_calls`
  trap *before* any compute (Hold-First) — `ERR_AI_MODEL_NOT_APPROVED` /
  `ERR_AI_CALL_BUDGET`.
* **Sentinel Ecosystem (Core Plugins):** Formalized "Sentinel" hardened infrastructure
  for mission-critical determinism:
    * **LSIO (Sentinel I/O):** Governed, zero-copy, manifest-driven ingestion. ✅ BUILT (23 tests).
    * **LSM (Sentinel Memory):** Fixed-block, SIMD-aligned memory management + ternary TPL buffer. ✅ BUILT (30 tests).
    * **LST (Sentinel Time):** Deterministic 'Logical Clock' for audit immunity to jitter. ✅ BUILT (13 tests).
    * **LSP (Sentinel Power):** Thermal/power envelope governance + kernel down-tiering. ✅ BUILT (17 tests).
    * **LSS (Sentinel State):** Atomic HMAC-verified snapshots for cold-boot recovery. ✅ BUILT (11 tests).
    * **Egress (Sentinel Egress):** Governed audit write path — ring buffer + batched HMAC-chained
      tamper-evident flush; closes the `fs.appendFileSync` Hardened-Border leak. ✅ BUILT (20 tests).
* **Audit border sealed:** the AuditLogger now stamps each event with an LST **LogicalTick**
  (replayable timing) and routes ALL ledger writes through the Egress sentinel — the runtime
  no longer calls `appendFileSync` directly. HMAC-chained, tamper-evident, query stays O(n).
* **Passive governance / plan memoization** (governance-cost reduction): the
  `HybridInferenceEngine` no longer re-plans on every `infer()` — the deterministic
  `HybridPlan` is memoized per op-signature, and `seal()` locks the deployment at
  preflight (an op-set never preflighted is denied in flight, `ERR_PLAN_NOT_PREFLIGHTED`
  — deny-by-default extended to routing). Governed in-mem throughput 22.2K→24.6K/s.
  Honest finding: the proposed "ManifestRegistry/CBOR cache" was a no-op (verifyGovernance
  is already hoisted out of the timed loop); the real per-call redundancy was the re-plan.
* **Brain/Brawn contract extraction** (audit CF-4): new neutral, zero-dependency
  package `@galerina/inference-bridge-contract` owns `InferenceBridge`/`BridgeOp`/
  `BridgeResult`/`assertDeterminism`, the precision-type vocabulary, a `FixedScale`
  fixed-point type, the **bridge-manifest schema** (sets up CF-3 attestation), and the
  determinism-oracle interface. `tower-citizen` + `ext-bridge-cpp` now import the
  contract; the Brawn no longer imports the Tower for the seam. Compatibility shim
  kept all tests green with no edits. Package-graph caught the new dep (gate FAIL →
  reviewed → admitted to the allowlist → PASS).
* **P9 Certified Runtime Profile** (from a ground-up security audit): `createHybridEngine({
  certified: true })` fails CLOSED — requires a governed egress sink (no direct-fs audit),
  a non-empty approved-models allow-list + named model, `max_tokens`, `max_token_cost`, and
  denies host-native fallback (`ERR_CERTIFIED_*`). Plus `max_tokens` budget enforcement
  (`ERR_AI_TOKEN_BUDGET`) and opt-in `strictKey` on Egress/State that rejects the all-zero
  dev HMAC key (`EGR-KEY-001`/`LSS-KEY-001`). Open items (bridge/addon attestation, Brain/Brawn
  package split, ECC/TMR, atomic kernel failover) tracked in the audit report's remediation table.
* **Governance-first hardening (from a deep code analysis):** closed real bypasses —
  `approvedModels` now denies a missing model (`ERR_AI_MODEL_REQUIRED`); aerospace mode
  (`denyHostNativeFallback`) traps silent host-native fallback (`ERR_HOST_NATIVE_DENIED`);
  the stub bridge TRAPS the illegal `0b11` trit encoding instead of masking it; `engine.shutdown()`
  releases bridges once. Deferred throughput items (packed-end-to-end execution, fixed-point
  scale, richer BridgeOp metadata, `canCommit()` in `execute()`) logged in ARCHITECTURE_ISSUES.
* **Triple-Lock proven:** LSM stages trits (aligned, segmented) → LSIO integrity-verifies
  (HMAC/SHA-256) → Tower Brawn runs the T-MAC, zero-copy; tamper is rejected before compute.
  Sentinel ingestion overhead ~1.3–2.1× per op (vs ~1000× for the disk audit ledger).
* **Audit performance:** in-memory + **batched-async durable** modes added (recovers
  ~1000× on the governed path while keeping durability; per-event sync disk is no
  longer forced). `query()` is now O(n), not a full-file re-read.
* **Aerospace constant-time boot:** two-phase Flight-time sequence — PREFLIGHT does
  all fallible work (LSIO integrity-verify + LSM stage + pool flight-lock, fail-fast);
  FLIGHT is pure compute with batched audit. Measured **p99 0.019 ms — 5× tighter
  worst-case than verify-in-loop, 190× tighter than per-event disk audit**.
* **Status:** 39/39 packages, 4,002 tests, security audit 0 findings, KB stale-links 0.
  P9 self-hosting certification (#120 P9.4) is the immediate target.

---

## Key Architectural Principles
1. **Deny-First Governance:** security is the baseline; permissions must be explicitly granted.
2. **Hardened Border:** absolute isolation between the Tower (runtime) and plugin execution.
3. **Cognition ≠ Compute:** deciding (Brain) is separated from executing (Brawn).
4. **Hardware Agnosticism:** the runtime discovers hardware (CPU/GPU/NPU) at runtime;
    nothing is hardcoded. Absent acceleration falls back to a deterministic simulator
    (fail-safe, not just fail-fast).
5. **Auditability:** every state transition is recorded in an immutable, append-only
    JSONL audit ledger, correlated by `correlationId` (which decouples the log from raw data).
6. **Determinism:** ternary results are bit-identical across CPU/GPU/photonic; critical
    boot sequences disable non-deterministic constructs to prevent unaudited branching.
7. **Permissive licensing:** BitNet/Groq (MIT) + NVFP4 (Apache-2.0) — all bundlable.

---

## How to update this file
Append a dated bullet under the relevant phase (or open a new phase) when a major
**decision** or **architectural pivot** lands — not for routine tasks. Keep entries
to one or two lines; link to the KB doc that carries the detail.