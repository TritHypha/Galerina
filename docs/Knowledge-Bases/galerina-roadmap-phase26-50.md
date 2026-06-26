# Galerina — Roadmap: Phase 26 → Phase 50

**Version: 1.0 — 2026-06-01**
**Status: Planned — post Phase 25 completion**
**Base state: 2518 tests passing, Phase 25 WAT arithmetic complete**

---

## North Star

> By Phase 41: A deployed governed Galerina service running in WASM/WASI, serving real
> HTTP traffic, with Stage B compiler achieving partial self-hosting and the economics
> layer routing execution to Intel P/E-cores and NPU based on risk-adjusted cost.

---

## Phase 26 — WAT Control Flow
**Focus: real if/else and bounded loops in WAT output**
**Dependencies: Phase 25 (WAT arithmetic)**

Add to `emitWATFromFlowAST`:
- `ifStmt` → `(if (result i32) <cond> (then ...) (else ...))`
- `whileStmt` with bounded iteration → WAT loop + br_if
- Block labels and break targets
- `matchExpr` → nested if chains

Expected test count: +30
Expected performance impact: whileStmt flows now compile to O(N) WAT instead of O(N) recursive calls

---

## Phase 27 — WASM Instantiation
**Focus: pure flows execute inside WebAssembly.instantiate (Node.js)**
**Dependencies: Phase 26 (control flow in WAT)**

- Compile WAT → binary WASM via `wat-wasm` npm assembler (already decided)
- `WebAssembly.instantiate(wasm, imports)` for pure flows
- Wire WASM result back into Galerina value system
- Benchmark: pure flow compute-mix should reach 1-10M ops/s (vs 60K tree-walker)
- Both targets: `wasm-standalone` and `wasm-hybrid`
- Test: run `add(2,3)` via WASM, verify result = 5

Expected speedup: 10-100× on pure numeric flows

---

## Phase 28 — Profile Enforcement
**Focus: Strict + High-Integrity profiles enforced by compiler**
**Dependencies: Phase 25 (governance complete)**

Add `"strict"` and `"high_integrity"` to `DeploymentProfile` type.

Compiler checks for `profile strict`:
- `SPORE-PROFILE-001`: `try`/`catch` used in strict profile (error)
- `SPORE-PROFILE-002`: unbounded loop in strict profile (error)
- `SPORE-PROFILE-003`: recursion used in strict profile (error)
- `SPORE-PROFILE-004`: JIT target in strict profile (error)
- `SPORE-PROFILE-005`: LRU cache enabled in strict profile (error)

Compiler checks for `profile high_integrity`:
- `SPORE-PROFILE-006`: no `runtime_budget` declared (warning)
- `SPORE-PROFILE-007`: dynamic mutation in high_integrity (error)

Boot/main syntax:
```galerina
boot main {
  profile use strict, high_integrity
}
```

This makes the aerospace examples (`updateFlightPath.spore`) fully compilable
under strict profile — not just classified safety_critical but actually
running under the restricted language subset.

Expected test count: +40

---

## Phase 29 — `galerina-core-economics` Package
**Focus: CostGraph and ValueGraph as a separate package**
**Dependencies: Phase 25 (ProofGraph API stable)**

Create `packages-galerina/galerina-core-economics/`:

```
src/
  cost-graph.ts      — CostGraph, CostEstimate, estimateCost()
  value-graph.ts     — ValueGraph, RiskProfile, classifyRisk()
  route-graph.ts     — RouteGraph, RouteDecision, selectTarget()
  economic-rule.ts   — EconomicConstraint parser (from contract.economics)
  roi-report.ts      — ROI calculation wrapper (delegates to proof-graph.ts)
  intel-profile.ts   — IntelCoreAffinity, X86VectorAffinity, detectCapabilities()
  index.ts           — all exports
```

The emergency brake rule is enforced at the type level — `RouteDecision`
has `governanceApproved: true` as a literal type (not boolean).

Expected test count: +60
Risk-adjusted routing live: cloud path £70,001 vs enclave £3,500.70

---

## Phase 30 — Governance Overhead Optimisation
**Focus: reduce governed/manifest ratio from 6% to <3%**
**Dependencies: Phase 29 (economics package)**

Profile the governance verifier hot path:
1. `buildProofGraph()` — currently rebuilds per call, should cache by ExecutionSignature
2. `GovernanceFlags` bitmask — already O(1) but called per-flow
3. `extractValueClassification()` — string parsing, can be cached at parse time
4. Lease caching for capability checks — time-bounded proof-of-authority

Expected result: governance overhead drops to <3% on warm paths

---

## Phase 31 — Integer Fast-Path (Interpreter)
**Focus: skip boxing for Int+Int, reduce tree-walker allocation**
**Dependencies: Phase 25 (WAT baseline for comparison)**

Current: every `a + b` allocates `{ __tag: "int", value: N }` on heap
Proposed: detect `Int op Int` and operate directly on raw JS numbers
- Tagged integer representation (Pointer Tagging style, as in LRU)
- `fitsTagged()` and `tagInt()` already exported — use in interpreter
- Expected: 5-20× speedup on arithmetic-heavy pure flows in interpreter mode

Benchmark target: arithmetic-threshold Galerina from 245K/s → 1M+/s

---

## Phase 32 — Stage B Lexer Parity
**Focus: Stage B (self-hosting compiler) lexes 100% of Galerina syntax**
**Dependencies: None (parallel track)**

Stage B is the self-hosting compiler written in Galerina.
Phase 32 goal: `generateStageBReport()` shows 100% lexer parity.

Milestone check: Stage B can tokenize all 223 CEC examples without error.

---

## Phase 33 — Intel P/E-Core ExecutionScheduler
**Focus: wire IntelCoreAffinity into the ExecutionGraph scheduler**
**Dependencies: Phase 29 (CostGraph knows hardware profile)**

- Hardware detection: read `/proc/cpuinfo` (Linux) or CPUID (Windows native)
- On i5: detect P-cores only (no E-core topology on older i5)
- On i9 (HX/K series): detect P+E topology, set affinity hints
- `ExecutionScheduler` emits thread affinity hints per work type
- AVX2 (i5) vs AVX-512 (i9) — CostGraph selects WASM SIMD vs AVX-512 path

Expected: compilation 20-40% faster on i9 when parallel graph processing enabled

---

## Phase 34 — `verifyPassword` WASM Auth Service
**Focus: first real governed HTTP endpoint via WASM**
**Dependencies: Phase 27 (WASM instantiation)**

The original Phase 25 milestone (deferred from previous session):
- `verifyPassword(plain, hash) -> Bool` compiled to WASM
- Served via `serve()` as a governed HTTP endpoint
- Real HTTP request → Galerina governance check → WASM execution → response
- Audit trail: every verification attempt is logged to `audit.write`
- Test: `curl -X POST /auth/verify -d '{"plain":"secret","hash":"..."}'`

This is the first demonstration of Galerina as a real service, not just a compiler.

---

## Phase 35 — wasmtime CLI Deployment
**Focus: standalone WASM/WASI binary running outside Node.js**
**Dependencies: Phase 34 (WASM output stable)**

- Compile Galerina source → WAT → WASM binary → `wasmtime run app.wasm`
- WASI imports: filesystem, clock, stdout
- Governed memory limits enforced in WASM linear memory
- Test: pure flow benchmark runs under wasmtime and produces same checksums as Node.js

---

## Phase 36 — Deno Deploy First Endpoint
**Focus: governed Galerina service deployed to Deno Deploy**
**Dependencies: Phase 35 (WASM binary stable)**

- Build WASM binary → deploy to Deno Deploy
- First external traffic served by a Galerina service
- Audit trail written to persistent store
- ProofGraph certificate downloadable from `/governance/proof`

---

## Phase 37 — ValueGraph + Risk-Adjusted Routing Live
**Focus: economics layer routing real traffic**
**Dependencies: Phase 29 (CostGraph package), Phase 36 (deployed service)**

- CostGraph evaluates expected_cost for each inbound request
- High-risk data → enclave path; low-risk → cloud path
- ROI report: quantify governance audit savings in production
- `generateROIReport()` now shows real data from production traffic

---

## Phase 38 — Governance Marketplace Foundation
**Focus: `use governance_shape FCA_Trading_v2` from @galerina/certified-shapes**
**Dependencies: Phase 37 (ValueGraph stable)**

- Define the `governance_shape` import syntax in parser
- Create `@galerina/certified-shapes` package (local registry first)
- FCA trading shape: required effects, audit trail, PII handling
- Aerospace shape: safety_critical + deterministic_execution
- Shape verification: compiler checks flow against imported shape

---

## Phase 39 — Post-Quantum Crypto + Intel Hardware Shield
**Focus: quantum-resistant signatures in ProofGraph + native sandbox**
**Dependencies: Phase 29 (economics), Phase 33 (Intel detection)**

- `GovernanceSignature` on each ProofGraph — quantum-resistant, long-lived compliance evidence
  (internally: ML-DSA / FIPS 204 — the NIST post-quantum signature standard)
- Intel Hardware Shield process isolation for native modules
- `AuditLog.write({ cpuFeature: "avx512" })` — execution path in audit
- If WASM preferred_execution violated, audit records the escape

---

## Phase 40 — Photonic/Tri Target Stub
**Focus: Tri-photonic compute target foundation**
**Dependencies: Phase 33 (hardware detection)**

- Add `target photonic` to `compute { target ... }` block
- CostGraph: photonic path has 0.001× energy cost vs CPU
- ControlNodes always on CPU (deterministic), DataNodes can route to photonic
- Stub implementation: photonic target logs to audit, falls back to WASM
- Architecture: WASM governs, photonic accelerates

---

## Phase 41 — Self-Hosting Bootstrap Milestone
**Focus: Stage B compiler compiles part of Stage A**
**Dependencies: Phase 32 (Stage B lexer parity), Phase 35 (WASM deployment)**

The milestone: Stage B (written in Galerina) can compile at least one Stage A
source file (a simple utility module) without error.

This proves:
1. Galerina is expressive enough to write a compiler in itself
2. The governance model works for compiler-writing workloads
3. The WASM output is correct enough to run compiled programs

**Bootstrap sequence:**
```
Stage A (TypeScript) → compiles Stage B (Galerina source)
Stage B (running in WASM) → compiles a Stage A utility module
Checksums match → bootstrap verified
```

Milestone check: `node bootstrap-verify.mjs` passes with matching checksums.

---

---

## Phase 42 — Strict Profile Benchmark + Multi-Profile Testing
**Focus: measure the performance and correctness of strict/high_integrity profiles**
**Dependencies: Phase 28 (profiles enforced)**

Add a benchmark dedicated to profiled execution:
- Run the same arithmetic flow in: normal / strict / high_integrity / both
- Measure: compile-time overhead (extra checks), runtime overhead (no cache in strict)
- Verify: SPORE-PROFILE-* diagnostics fire correctly for prohibited constructs
- Baseline: `governance-cost` benchmark under strict profile vs normal profile

```bash
npm run run:profile-benchmark    # shows overhead per profile
```

Expected: strict profile adds ~15-30% compile time (extra checks), ~0% runtime overhead
(the disallowed features are caught at compile time, not runtime).

---

## Phase 43 — HTTP/2 Governed Service
**Focus: HTTP/2 + TLS with governed connections**
**Dependencies: Phase 36 (Deno Deploy)**

- Upgrade `serve()` to HTTP/2 with TLS
- Every connection carries a `connection_id` in the audit trail
- Request multiplexing governed by `contract.network { connections max 100 }`
- GovernanceSignature in every response header: `X-Galerina-Proof: <hash>`

---

## Phase 44 — Multi-Node Distributed Governance
**Focus: governed flows across multiple Galerina nodes**
**Dependencies: Phase 43 (HTTP/2)**

- `boundary.cross(node: "service-b")` effect type for cross-node calls
- Distributed ProofGraph: combined proof from source + target nodes
- No capability can be granted by crossing a node boundary
- GovernanceSignature chains: A signed B, B signed C → audit trail is the full chain

---

## Phase 45 — AI Governance Layer
**Focus: LLM-assisted flow generation with mandatory governance verification**
**Dependencies: Phase 29 (economics), Phase 28 (profiles)**

- `ai.generate` effect: LLM generates flow body, governance verifier checks it
- Generated flows must pass all SPORE-* checks before execution
- `contract.ai { model "gpt-4" max_tokens 500 deny eval }` 
- AI-generated code cannot bypass governance — it is verified the same as human code
- Benchmark: AI-generated vs human-written flow, governance overhead comparison

---

## Phase 46 — Governance Marketplace Public Beta
**Focus: `@galerina/certified-shapes` published, community contributions**
**Dependencies: Phase 38 (marketplace foundation)**

- Registry at https://marketplace.galerina.dev
- Certified shapes: FCA_Trading_v2, GDPR_DataProcessor_v1, DO178C_SafetyCritical_v1
- `use governance_shape DO178C_SafetyCritical_v1` in Galerina source
- Shape verification: compiler checks every declared flow against the imported shape
- Community submission process: shape must pass 50+ test cases to be certified

---

## Phase 47 — Hardware Cryptographic Attestation
**Focus: Intel TXT/SGX for native module attestation**
**Dependencies: Phase 39 (GovernanceSignature), Phase 33 (Intel detection)**

- `audit.write({ executionPath: "native-avx512", attestation: intelTxt.quote })` 
- ProofGraph includes hardware attestation quote when native code was used
- Intel SGX enclave for high-value computation (financial models, medical AI)
- Verifiable proof: "this computation ran in an Intel SGX enclave on this CPU"
- GovernanceSignature + hardware attestation = complete evidence chain

---

## Phase 48 — Real-Time Governance (Streaming Flows)
**Focus: bounded-latency governed execution for real-time systems**
**Dependencies: Phase 42 (strict profile), Phase 33 (Intel scheduler)**

For aerospace, industrial control, and real-time systems:
- `contract.timing { max_latency 50μs deadline hard }` — hard real-time constraint
- Strict profile automatically requires `deadline hard` for safety_critical flows
- Intel P-core scheduling guarantees isolated execution
- Deadline miss → `audit.write` + safe fallback, not crash

---

## Phase 49 — Formal Verification Integration
**Focus: proof assistant backend for mathematical governance proof**
**Dependencies: Phase 32 (Stage B), Phase 41 (self-hosting)**

- Export Galerina ProofGraph to Lean4 / Isabelle proof format
- Formal proof: "this flow satisfies these invariants under all possible inputs"
- For aerospace: DO-333 supplement compliance (formal methods)
- Not mandatory — opt-in via `contract.proof { verify formal }` 
- Galerina compiler generates Lean4 proof obligation from effect graph

---

## Phase 50 — Galerina v1.0 Release Candidate
**Focus: stable language spec, complete governance, production-ready runtime**
**Dependencies: All previous phases**

**v1.0 criteria:**
1. ✅ Language spec frozen (no breaking syntax changes)
2. ✅ All governance layers implemented and enforced
3. ✅ WASM deployment working (wasmtime + Deno)
4. ✅ Stage B compiling Stage A utilities (partial self-hosting)
5. ✅ `@galerina/certified-shapes` with at least 5 certified shapes
6. ✅ GovernanceSignature on all production ProofGraphs
7. ✅ Test suite: 3,500+ tests, 0 failures
8. ✅ Benchmark: governed overhead < 10% on production workloads
9. ✅ Complete KB (all components documented and cross-referenced)
10. ✅ One public production deployment (real HTTP traffic, audited)

**v1.0 is NOT:**
- Certified (certification is a regulatory process outside Galerina)
- Complete (governance platforms grow with their domains)
- Final (v2.0 will add distributed governance, more hardware targets)

---

## Phase Map (26–50)

```
Phase 25: WAT arithmetic ✅ (done)
Phase 26: WAT control flow (if/else, loops)
Phase 27: WASM instantiation (Node.js)
Phase 28: Profile enforcement (strict, high_integrity) + profile benchmark
Phase 29: galerina-core-economics package
Phase 30: Governance overhead <3%
Phase 31: Integer fast-path (5-20× interpreter speedup)
Phase 32: Stage B lexer parity (parallel track)
Phase 33: Intel P/E-core ExecutionScheduler
Phase 34: verifyPassword WASM HTTP service
Phase 35: wasmtime CLI deployment
Phase 36: Deno Deploy first endpoint
Phase 37: ValueGraph + risk-adjusted routing live
Phase 38: Governance Marketplace foundation
Phase 39: GovernanceSignature (quantum-resistant proof certificates)
Phase 40: Photonic/Tri target stub
Phase 41: Self-hosting bootstrap milestone
Phase 42: Strict profile benchmark + multi-profile testing
Phase 43: HTTP/2 governed service
Phase 44: Multi-node distributed governance
Phase 45: AI governance layer
Phase 46: Governance Marketplace public beta
Phase 47: Hardware cryptographic attestation (Intel TXT/SGX)
Phase 48: Real-time governance (streaming, bounded-latency)
Phase 49: Formal verification integration (Lean4 / Isabelle)
Phase 50: Galerina v1.0 Release Candidate
```

---

## Test Count Projections

| Phase | New Tests | Cumulative |
|---|---|---|
| 25 (done) | +39 | 2,518 |
| 26 | +30 | 2,548 |
| 27 | +25 | 2,573 |
| 28 | +40 | 2,613 |
| 29 | +60 | 2,673 |
| 30 | +15 | 2,688 |
| 31 | +20 | 2,708 |
| 32 | +30 | 2,738 |
| 33 | +20 | 2,758 |
| 34 | +25 | 2,783 |
| 35 | +20 | 2,803 |
| 36 | +15 | 2,818 |
| 37 | +30 | 2,848 |
| 38 | +25 | 2,873 |
| 39 | +20 | 2,893 |
| 40 | +15 | 2,908 |
| 41 | +20 | 2,928 |
| 42 | +25 | 2,953 |
| 43 | +20 | 2,973 |
| 44 | +25 | 2,998 |
| 45 | +30 | 3,028 |
| 46 | +25 | 3,053 |
| 47 | +20 | 3,073 |
| 48 | +25 | 3,098 |
| 49 | +30 | 3,128 |
| **50** | **+25** | **~3,153** |

---

## Governance Principle (Unchanging Through All Phases)

```
Security is not negotiable.
Governance is not optional.
Economics is not authority.
Performance is not authority.
```

No phase may introduce an optimisation that causes a previously denied
flow to become allowed. Every new capability must pass the test:
"Can this cause a denied flow to become allowed?" If yes → governance
decision, not optimisation.
