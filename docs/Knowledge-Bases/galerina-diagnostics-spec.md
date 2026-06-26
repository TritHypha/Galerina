# Diagnostics Spec — Forensic Observability for Galerina

**Status:** Proposed (2026-06-06) · **Post-P9, non-blocking.** (The draft-agent for this doc hit a 529 overload; authored directly.)

Goal: make the system's internal state queryable, not just its outcomes. Every diagnostic output is tagged **`⟨diag⟩`** so it can never contaminate the production performance baseline (same discipline as the `⟨interp⟩` taxonomy). **Verify-before-build:** each item below reuses already-shipped components — do not re-implement.

## A. Differential Observability ("twin" diagnostic)
- **Concept:** run a non-governed "shadow" twin of a high-stakes flow (e.g. the future `tokenize.wasm` path) alongside the hardened instance; diff output + timing.
- **Capture:** `{ flowHash, hardenedNs, shadowNs, outputsMatch, deltaNs }`. A matching output where shadow is N× faster = the exact overhead of the security border.
- **Reuses:** the **#105 admission-gate harness** (`wasm-runtime.ts`) — instantiate the same module twice, one with the closed host allow-list + attestation, one bare. Isolate Governance-layer vs Compute-layer overhead.
- **P9 impact:** highest signal-to-noise for "is a regression a real bottleneck or just the cost of security?". Lowest change cost.

## B. Causality / Reasoning traces (beyond spans)
- **Concept:** when `GovernanceVerifier` denies/restricts, attach *why* — the `CapabilityToken` bitmask + the `PolicyDAG` nodes that triggered the decision — to the audit egress, not just `ACCESS_DENIED`.
- **Capture:** a sub-graph reference: `{ decision, requiredMask, grantedMask, policyDagNodeIds[], proofGraphRef }`. Makes the audit trail a *logic audit*: "show every flow delayed >10ms by the `ai.inference` gate."
- **Reuses:** **Governance-as-Evidence CBOR Tag 410** (#75) + **`proof-graph.ts`** (a reasoning trace = a subgraph of the proof graph) + the **HMAC-chained audit egress** (Sentinel-Egress).

## C. Runtime Verification (RV)
- **Concept:** compile "safety invariants" (e.g. "a photonic pulse must never share a memory slot with an array bridge") as non-intrusive `assert` probes into the #105 host harness; fire `DIAGNOSTIC_WARNING` *before* a violation, not after a crash.
- **Capture:** `{ invariantId, approached: bool, stateSnapshotRef }`.
- **Reuses:** the compiler's existing formal-method machinery (`invariant {}` blocks #36, SPORE-INV-000 #76) extended from compile-time to the runtime harness. The ultimate "Janitor" — detects the *potential* for a mess.

## D. Performance-history plugin (drift detector)
- **Concept:** async ring-buffer ingest of benchmark JSON → `performance-history.jsonl`; flag drift; sparkline per workload.
- **Capture / logic:**
  - Non-intrusive: offload metric ingestion to an async ring buffer (never block the Tower thread).
  - Trend: if throughput in any of the 17 workloads drops **>5%** vs the **10-run moving average**, emit `WARNING: P9_PERF_DRIFT`.
  - Visualization: ASCII sparkline per workload (P9 baseline vs current).
  - Bottleneck attribution: cross-reference governance-cost metadata to separate **Governance-Tax regressions** from **Compute regressions** (and, with the §1 benchmark suite, attribute to emission #144 vs harness #105).
  - **Attestation-gated:** the plugin is itself a signed/verified artifact (same `border-check` admission as other plugins) so it can't inject malicious telemetry.
- **Reuses:** `devtools-benchmarks` result JSON; the §-benchmark enforcement suite for attribution; `wasm-runtime.ts` attestation for the gate.
- **Output modules:** `performance-analysis.ts` (throughput variance + slope), a sparkline component, separate Governance-Tax vs Compute regression flags.

## Why "A→Z" (process observability) over outcome-only
Outcome monitoring answers "is throughput 2.33 B/s?"; these answer "how did the system behave A→Z, and *where* did the cost land?" — catching slow governance creep (58.1→60× over commits) a human misses, attributing it to emission vs harness, and (for the photonic sim) tracking fidelity/propagator-latency over time. Start with **(A) Differential Observability** — least change to the #105 harness, highest signal.
