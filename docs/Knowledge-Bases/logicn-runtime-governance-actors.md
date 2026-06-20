# LogicN — Runtime Governance Actors (naming map + flow protocol)

**Status:** KB / documentation-of-reality (2026-06-06). This doc names three governance
*roles* and the flow-execution protocol. **Important:** each "actor" is a CONSOLIDATING
NAME for functionality that is **already shipped** — this is not a build proposal. The few
genuinely-new deltas are flagged explicitly at the end with their preconditions.

---

## 1. The three actors → existing components

| Actor (role name) | Responsibility | Already implemented by |
|---|---|---|
| **Access Gatekeeper** | Policy enforcement + boundary attestation at ingress | Bridge attestation **CF-3/CF-7** (`logicn-tower-citizen/bridge-attestation.ts`, Ed25519 + hash pin); the **#105 WASM admission gate** (`logicn-core-compiler/wasm-runtime.ts`, attestation-first verify before host linking); the **V_DPM capability gate** (`hybrid-engine.ts`, branchless `(req&granted)==req`). |
| **Memory Sanitizer** | Deterministic state hygiene / no data remanence | The Tower's **`LOAD→EXEC→ERASE`** lifecycle (`tower-runtime.ts` `erase()` wipes sandbox state); **LSM** (`logicn-core-sentinel-memory`) fixed-block pool + segmentation. |
| **Resilience Verifier** | Fault injection / fail-closed validation | **`diagnostic-runner.mjs`** fault-injection (`toxic-input`, `governance-violation`); the **DRCM Phase-7** OWASP negative suite (#43). |

The model is a useful *vocabulary* for the Hardened Border, but the team should **map, not
rebuild** — the capabilities exist.

## 2. Flow execution protocol → the Tower lifecycle

The proposed Admission → Provisioning → Execution → Finalization handshake is the Tower's
existing per-call governance lifecycle:

1. **Admission (Gatekeeper).** `checkBridgeAttestation` / capability gate / `checkAiGovernance`
   trap BEFORE compute (Hold-First). In the #105 harness: `admitAndInstantiate` verifies the
   Ed25519 attestation **before** `WebAssembly.instantiate` — Hook 1 (pre-instantiate) is DONE.
2. **Provisioning (Sanitizer).** Fresh sandbox; record bump-allocator heap (`$__lln_heap`)
   starts at a fixed base in zeroed linear memory.
3. **Execution.** Dispatch through the closed host-import allowlist (no ambient scope).
4. **Finalization (Sanitizer).** `tower.erase(...)` wipes sandbox state; audit receipt flushed
   via the HMAC-chained egress (Sentinel-Egress).

## 3. Genuinely-new deltas (filed as todos, NOT built — see notes)

- **Compliance *ledger* report** (beyond `devtools-pci`'s static analysis): a report generator
  that runs over the **HMAC-chained audit-egress ledger** to emit a signed, auditor-verifiable
  evidence document mapping runtime events → PCI/DO-178C requirements. `devtools-pci` already
  does the *static* contract→requirement mapping; this adds the *runtime evidence* half.
- **Warm-sandbox reuse + Memory Sanitizer** — **PRECONDITION:** only meaningful once the harness
  *reuses* a WASM instance across requests (a throughput optimization). Today each
  `admitAndInstantiate` makes a fresh, already-zeroed instance, so an explicit zero-after-run is
  **premature** — it solves a remanence risk the current design does not have. Build the sanitizer
  *with* warm-sandbox reuse, not before.
- **Resilience Verifier as a runtime monitor** — wiring the existing fault-injection catalogue as
  a live watchdog (timeout / fuel / resource) *inside* the #105 harness, vs. today's offline
  diagnostic runner. Overlaps Post-P9 real-Wasmtime fuel (#104).

## 3a. Full alias audit — "what exists under a different name"

Evidence-based sweep (2026-06-06) of every concept the advisory reports proposed under a
new name, vs. the shipped LogicN component. ✅ = exists · ◑ = partial (core exists, named
delta open) · ❌ = genuinely new.

| Proposed / external name | LogicN canonical | Location | Status |
|---|---|---|---|
| Certification Plugin / `logicn-plugin-pci` | devtools-pci | `logicn-devtools-pci` | ✅ PCI-DSS 4.0.1 static map, 12 tests |
| Access Gatekeeper / Security Officer | Bridge attestation + admission gate + V_DPM gate | `tower-citizen/bridge-attestation.ts`, `core-compiler/wasm-runtime.ts`, `hybrid-engine.ts` | ✅ CF-3/CF-7 + #105 + #139 |
| Memory Sanitizer / Janitor | Tower `LOAD→EXEC→ERASE` + LSM | `tower-runtime.ts` `erase()`, `sentinel-memory` | ✅ |
| Resilience Verifier / Firedrill | Fault-injection runner + DRCM Phase-7 negatives | `devtools-benchmarks/diagnostic-runner.mjs`, OWASP suite (#43) | ✅ offline (runtime monitor = open delta) |
| ManifestRegistry / ManifestCache / AdmissionController | `.lmanifest` (CBOR) + `logicn verify` admission gate | `manifest-generator.ts`, `governance-verifier.ts` | ✅ #37 / #109 |
| Signed Manifest / attestation | ML-DSA-65 manifest signing + Ed25519 | `manifest-generator.ts`, `attestation.ts` | ✅ #108 |
| CapabilityMaskCompiler / bitmask gates | `bitfield V_DPM` + `capability-types.ts` + capability gate | `capability-types.ts`, `wat-emitter.ts`, `hybrid-engine.ts` | ✅ #85/#87/#139 |
| GovernanceVerifier (eBPF "verify once") | static governance pipeline pass | `core-compiler/governance-verifier.ts` | ✅ |
| ProofGraph / proof cache / "pre-pay" | ProofGraph | `core-compiler/proof-graph.ts` | ✅ |
| Execution DAG / authorized transition graph | Execution DAG (CBOR Tag 414) | `core-compiler/execution-graph.ts` | ✅ #77 |
| Behavioral Fingerprinting / CFG hash | CFG hash (CBOR Tag 417) | `core-compiler` | ✅ #80 |
| MMCP / typed memory views | `view(cap)` (CBOR Tag 415) | `core-compiler` | ✅ #78/#83 |
| AuditDigestEmitter / Merkle "audit by digest" | Governance-as-Evidence (Tag 410) + HMAC-chained egress | `sentinel-egress/audit-egress.ts`, `manifest-generator.ts` | ✅ #75 |
| WASM Import Gating | effect→host-import emission + closed allowlist | `wat-emitter.ts` (#119), `wasm-runtime.ts` (#105) | ✅ |
| Numeric policy table / "pre-pay" hot path | CompiledPolicy | `tower-citizen/compiled-policy.ts` | ✅ #140 |
| `resilience {}` / `observability {}` | resilience inference | `core-compiler/resilience-inference.ts` | ✅ #58 |
| PolicyPartialEvaluator / Shadow Policy / what-if | `logicn check --what-if` + Pre-resolved Policy DAG (Tag 416) | #71, #79 | ◑ what-if + pre-resolved DAG exist; no discrete offline partial-evaluator |
| Capability Token / ExecutionToken / Macaroon/Biscuit | `seal()` preflight lock + `planCache` memoization | `hybrid-engine.ts` | ◑ preflight token + plan memo exist; **no signed/attenuable token** |
| Versioned Decision Cache (SELinux AVC / Zanzibar) | plan memoization | `hybrid-engine.ts` `planCache` | ◑ plan-level only; **no policy/data-epoch-keyed cache** |
| Compliance LEDGER (runtime evidence document) | — | (none; #146 filed) | ❌ genuinely new delta |

**Headline:** of ~20 proposed concepts, **~16 already ship**, **3 are partial** (named deltas:
delegatable capability token, versioned decision cache, offline partial-evaluator), and **1 is
genuinely new** (runtime compliance ledger, #146). The advisory stream is overwhelmingly
re-deriving shipped architecture — *verify and map* is the correct response, not build.

## 4. Decision

**None of the above is on the P9 critical path** (P9 byte-parity is now ✅ COMPLETE — #144 enum
lowering + #145 string table / host-stdlib / output reader + #143 tokenize byte-parity all shipped
2026-06-06; golden `tests/wat-p9-tokenize-parity`). These are post-P9 governance/compliance items,
recorded here so the naming is captured and the existing components are not re-implemented.

---

## 5. Todo map (audit → tracker)

The single cross-reference between the alias audit (§3a) and the task tracker. Every
proposed concept resolves to exactly one of: **DONE** (ship location, no task needed),
an **open task #**, or **KB-only** (documented, not worth a task yet). Check this before
opening any "new" governance/compliance work — if a row says DONE, do not rebuild it.

### Open tasks spawned by this audit
| Task | Scope | Priority |
|---|---|---|
| **#146** | Runtime compliance LEDGER over audit-egress (the one genuinely-new delta) | Post-P9 |
| **#147** | Warm-sandbox reuse + Memory Sanitizer (premature until reuse exists) | Post-P9, gated |
| **#148** | 3 partial deltas: delegatable capability token · versioned decision cache · offline partial-evaluator | Post-P9, evaluate-first |

### P9 critical path (NOT from this audit) — ✅ COMPLETE (2026-06-06)
| Task | Scope | Status |
|---|---|---|
| **#144** | Lower enum-variant member access (kills 9 `tokenize` placeholders) | ✅ |
| **#145** | String-intern table + host-stdlib expansion + output reader | ✅ |
| **#143** | tokenize.wasm == interpreter byte-parity (was: blocked by #144, #145) → completes P9 | ✅ |

### DONE — no task (rebuild guard)
Certification plugin → **devtools-pci** · Access Gatekeeper → **CF-3/CF-7 + #105 + #139** ·
Memory Sanitizer → **Tower ERASE + LSM** · Resilience Verifier → **diagnostic-runner + #43** ·
ManifestRegistry/AdmissionController → **#37/#109** · Signed Manifest → **#108** ·
CapabilityMaskCompiler → **#85/#87/#139** · GovernanceVerifier → **`governance-verifier.ts`** ·
ProofGraph → **`proof-graph.ts`** · Execution DAG → **#77** · Behavioral Fingerprint → **#80** ·
MMCP → **#78/#83** · AuditDigest/Merkle → **#75 + HMAC egress** · WASM Import Gating → **#119/#105** ·
Numeric policy table → **#140** · resilience/observability blocks → **#58**.

*Maintenance: when a new advisory report lands, add its proposals as rows here first; only
open a task for rows that resolve to ❌ (new) or ◑ (partial) in §3a.*
