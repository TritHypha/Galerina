# `galerina-core-economics` — Package Design

**Version: 1.0 — 2026-06-01**
**Status: Phase 29 planned implementation**

---

## Why a Separate Package?

The governance hierarchy is inviolable:

```
galerina-core-compiler    ← Governance, Proof, Authority  [Layer 1-3]
galerina-core-economics   ← Economics, CostGraph           [Layer 4]
galerina-core-runtime     ← Execution, Performance         [Layer 5-6]
```

If CostGraph lived inside `galerina-core-compiler`, the economics layer would
sit inside the governance layer. That inverts the stack. Economics must be
a **downstream consumer** of governance artifacts — it reads the ProofGraph
and GovernanceGraph but cannot modify them.

**The test**: can an economics decision cause a previously denied flow to
become allowed? If the answer is ever yes, the package boundary is wrong.

---

## The Total Cost Formula

```
total_cost = compute_cost
           + audit_cost
           + governance_cost
           + AI_cost
           + storage_cost
           + network_cost
           + risk_cost
```

**compute_cost**: CPU/GPU/NPU time × hardware price per unit time
**audit_cost**: cost of writing to AuditGraph (I/O, storage, seal computation)
**governance_cost**: ProofGraph construction, capability lease resolution
**AI_cost**: tokens × model pricing (from contract.ai.max_token_cost)
**storage_cost**: lineage data, audit records, retained evidence
**network_cost**: data transfer to/from cloud targets
**risk_cost**: breach_probability × breach_loss (from contract.value.estimated_loss_per_incident)

**The CostGraph's question is not "what is fastest?" — it is:**
> "What is the cheapest option that still satisfies governance, safety, privacy, audit, and latency?"

**Dynamic Proof Level Matching:**
The CostGraph assigns proof overhead based on the hardware target's ProofLevel:
```
CPU target  → ProofLevel.Standard  (zero runtime overhead — compile-time proof)
NPU target  → ProofLevel.Sealed    (Input/Output seal cost — ~2 SHA-256 hashes)
Quantum     → ProofLevel.Formal    (time-lock verification — significant overhead)
```

You only pay the security overhead tax for the exact risk level your hardware introduces.

**Zero-allocation pipeline splicing:**
Because ProofGraph resolves all capability and governance checks at compile time,
runtime execution reduces to:
```
check lease (O(1) cache lookup)
check input seal (one hash comparison)
dispatch to hardware
validate output seal (one hash comparison)
write audit record (one append)
```

No runtime interception agents. No per-request permission checks. No cache invalidation.
Governance checks run once at compile time. Execution runs at hardware speed.

---

## Package Responsibilities

```
galerina-core-economics
├── CostGraph          — Expected cost per execution path (total_cost formula)
├── ValueGraph         — Risk-adjusted value per data classification
├── RouteGraph         — Hardware routing decision (CPU / GPU / NPU / WASM)
├── EconomicConstraint — Budget rules from contract.economics
└── ROIReport          — Audit savings quantification
```

**Does NOT own:**
- Governance rules (those are in galerina-core-compiler)
- Capability checks (those are in galerina-core-runtime)
- Hardware feature detection (those are in galerina-target-*)

---

## Package Interfaces

### Input (reads from governance layer)

```typescript
import type { ProofGraph, GovernanceVerifyResult } from "@galerina/core-compiler";
import type { ExecutionPlan } from "@galerina/core-compiler";
```

### Output (consumed by runtime layer)

```typescript
export interface CostEstimate {
  readonly flowName: string;
  readonly computeCost: number;       // estimated CPU-ms
  readonly dataCost: number;          // data transfer cost (APU/network)
  readonly breachProbability: number; // 0-1 based on ProofGraph.verified
  readonly breachCost: number;        // estimated GBP loss from value block
  readonly expectedCost: number;      // computeCost + (breachProbability × breachCost)
  readonly preferredTarget: "cpu" | "wasm" | "gpu" | "npu" | "apu";
}

export interface RouteDecision {
  readonly flowName: string;
  readonly selectedTarget: "cpu" | "wasm" | "gpu" | "npu" | "apu";
  readonly reason: string;
  readonly governanceApproved: true;  // always true — economics never bypasses governance
  readonly emergencyBrake?: string;   // set if economics BLOCKED a safe-but-expensive path
}
```

---

## CostGraph Position in Stack

```
[ Inbound Galerina Flow ]
          │
          ▼
   [ ProofGraph ]      ← galerina-core-compiler
          │
          ▼
   [ GovernanceGraph ] ← galerina-core-compiler
          │
          ▼
   [ CostGraph ]       ← galerina-core-economics  ← HERE
          │                (CAN: block expensive paths)
          ▼                (CANNOT: unblock unsafe paths)
   [ ExecutionGraph ]  ← galerina-core-runtime
```

---

## The Emergency Brake Rule (preserved)

Economics can pull the emergency brake on a safe path.
Economics can never press the gas pedal on an unsafe one.

```typescript
// VALID — economics blocks a safe-but-expensive route
if (estimate.expectedCost > budget.maxGBP) {
  return { blocked: true, reason: "exceeds budget", governanceApproved: true };
}

// INVALID — economics cannot grant capability
// if (!proofGraph.verified) { allow anyway because it's cheap }  ← NEVER
```

---

## Risk-Adjusted Cost Formula

```
expected_cost = compute_cost + (breach_probability × breach_loss)
```

Example (from galerina-governance-economics-platform.md):

| Path | Compute | Breach P | Breach Loss | Expected Cost |
|---|---|---|---|---|
| Cloud (unverified) | £1 | 10% | £700,000 | **£70,001** |
| Enclave (ProofGraph verified) | £3,500 | 0.0001% | £700,000 | **£3,500.70** |

ProofGraph reduces breach_probability by proving governance compliance.
This makes the expensive-but-safe path economically optimal.

---

## NPU / APU Economics

On NPU: all units are homogeneous — no routing decision needed within NPU.
CostGraph governs routing **to** the NPU (vs CPU vs GPU vs WASM):

```
CostGraph evaluates:
  - Energy budget (NPU energy cost vs CPU energy cost)
  - Queue depth (NPU busy? → route to WASM fallback)
  - Wake cost (NPU sleep state → startup latency)
  - Data transfer (APU shared memory = zero transfer cost)
```

On APU: shared memory eliminates data transfer costs.
CostGraph sees transfer_cost = 0 for APU paths.

---

## Intel i5 / i9 Integration

```typescript
export interface HardwareProfile {
  readonly vectorAffinity: "generic" | "wasm_simd128" | "avx2" | "avx512" | "avx10";
  readonly coreTopology: {
    readonly performanceCores: number;  // P-cores
    readonly efficientCores: number;    // E-cores
  };
  readonly l1CacheLineBytes: 64;        // Intel: always 64 bytes
}

// CostGraph decisions:
// P-cores: ProofGraph construction, crypto, hot compilation
// E-cores: audit.write buffer, lineage tracking, package verification
// AVX2 (i5): WASM SIMD 128-bit, dual 256-bit paths
// AVX-512 (i9): tensor operations, 512-bit SHA256, matrix math
```

---

## Phase 29 Implementation Plan

1. Create `packages-galerina/galerina-core-economics/`
2. Implement `CostGraph` type + `estimateCost(flow, proofGraph, hardwareProfile)`
3. Implement `ValueGraph` type + `classifyRisk(flowName, classification, estimatedLoss)`
4. Implement `RouteGraph` type + `selectTarget(costEstimate, runtimePolicy)`
5. Wire into `galerina-core-runtime` — runtime reads RouteDecision before dispatch
6. Tests: 50+ test cases covering emergency brake, AVX2 vs AVX-512 routing, APU zero-transfer

---

## What Economics Cannot Do

```typescript
// BLOCKED by type system — RouteDecision.governanceApproved is always true
// Economics cannot produce a RouteDecision where governanceApproved is false
// because the type does not have a governanceApproved: false variant

// BLOCKED by package boundary — CostGraph cannot import from governance-verifier
// It can only READ ProofGraph (read-only input), never WRITE to it
```

**Security is not negotiable. Governance is not optional. Economics is not authority.**
