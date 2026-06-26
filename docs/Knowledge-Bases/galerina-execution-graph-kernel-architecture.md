# Galerina — Execution Graph Kernel Architecture

**Version: 1.0 — 2026-06-01**
**Status: Canonical architecture direction for Phase 30–40**

---

## Core Principle

```
Most runtimes execute instructions.
Galerina should increasingly execute proofs.
```

The pipeline evolves from:
```
Compiler → Runtime
```
toward:
```
Compiler → Governance Compiler → Execution Compiler → Runtime
```

Governance moves to compile time. Runtime becomes graph traversal of already-proven topology.

---

## The Convergence Point

The Execution Graph Kernel is not a new feature. It is the natural convergence of things already being built:

```
GIR                  → what the program IS
PassiveExecutionPlan → what it is ALLOWED to do
ExecutionGraph       → HOW it will execute
CapabilitySystem     → what it HAS PERMISSION to do right now
AuditChain           → what it DID
ComputePlanner       → WHERE it will execute
```

Each already exists. The Kernel is the runtime manager that holds them together.

---

## Pipeline Evolution

### Current
```
Source → GIR → PassiveExecutionPlan → ExecutionGraph → Runtime
```

### Target (Phase 35+)
```
Source → GIR → PassiveExecutionPlan → ProofGraph → ExecutionGraph → Runtime
```

---

## Suggestion 1: ProofGraph

A first-class stage between PassiveExecutionPlan and ExecutionGraph.

**Purpose:** Prove capability, effect, memory, target, and privacy legality BEFORE the ExecutionGraph exists.

```typescript
interface ProofGraph {
  readonly schemaVersion: "spore.proof.v1";
  readonly obligations: readonly ProofObligation[];
  readonly evidence: readonly ProofEvidence[];
  readonly signature: string;   // cryptographic proof the obligations were satisfied
  readonly governanceShape: ExecutionSignature;
}

interface ProofObligation {
  readonly kind: "capability" | "effect" | "memory" | "target" | "privacy";
  readonly claim: string;       // what was proven
  readonly satisfiedBy: string; // which contract section satisfied it
  readonly hash: string;        // tamper-proof
}
```

**Result:** `ExecutionGraph` becomes "already proven topology" rather than "topology + proof."
The RuntimeManifest.verified boolean becomes a full ProofGraph certificate.

**Connection to existing code:**
- `GovernanceVerifyResult.proofObligations` is a string array — ProofGraph formalises this
- `RuntimeManifest` already carries `verified: boolean` — ProofGraph replaces this with a full certificate
- `canonicalHash()` chain (`sourceHash → girHash → planHash → attestationHash`) becomes the ProofGraph spine

**Implementation phase:** Phase 32

---

## Suggestion 2: ControlNode / DataNode (Most Actionable Now)

Split ExecutionGraph nodes into two distinct types.

```typescript
type ExecutionNodeType = "control" | "data";

interface ControlNode extends ExecNode {
  readonly nodeType: "control";
  // Governs: policy evaluation, capability check, audit, validation, routing
  // ALWAYS runs on WASM (the governance layer)
  // NEVER delegates to native hardware
}

interface DataNode extends ExecNode {
  readonly nodeType: "data";
  // Computes: arithmetic, tensors, GPU kernels, inference
  // CAN run on any hardware the ControlNode authorises
  // Receives only what the ControlNode explicitly passes via DataHandle
}
```

**Example for classifyMessage:**
```
[C] validate rawText           → ControlNode (WASM)
[C] enforce privacy policy     → ControlNode (WASM)
[C] tokenize (boundary)        → ControlNode → DataNode transition
[D] run inference              → DataNode (NPU or GPU)
[C] validate output            → ControlNode (WASM)
[C] write audit                → ControlNode (WASM)
```

**Security property:** DataNodes NEVER receive protected values, governance metadata, or raw strings.
They receive only typed buffers through the DataHandle protocol.

**Why this matters:** The ControlNode/DataNode split makes the control/data plane separation structural (not conventional). You cannot accidentally pass a protected value to the NPU — the type system prevents it.

**Implementation phase:** Phase 27 (native Tensor.dot) — the DataNode concept is needed to correctly route to native hardware

---

## Suggestion 3: Capability Routing Graph

`database.read` is not a permission. It is a **route**.

```
database.read
    ↓
route resolution (capability routing graph)
    ↓
provider selection (Postgres / SQLite / PlanetScale / Edge KV)
    ↓
lease issuance
    ↓
resource access
```

**Connection to existing code:**
- `STDLIB_CAPABILITY_MAP` (stdlib-registry.ts) already maps function → WASM import
- The Capability Routing Graph generalises this to runtime provider selection

**Governance property:** The capability graph itself is governed. Adding a new route requires governance approval — you cannot silently reroute `database.read` to an unapproved endpoint.

**Implementation phase:** Phase 33 (cloud deployment — Deno Deploy / Cloudflare Workers)

---

## Suggestion 4: Graph Compression via CanonicalNodeHash

Identical operations used across many flows become shared references, not copies.

```
validateEmail (used in 200 flows) → Node #45 (one canonical node, referenced 200 times)
```

**Rules for safe sharing:**
1. Only pure ControlNodes (no external state, no lease binding) are shareable
2. AuditEdges from shared nodes correctly attribute invocations to the calling flow
3. CanonicalNodeHash includes `(operation, inputTypes, outputType, effectMask)` — different domain types = different nodes

**Connection to existing code:**
- `INT_POOL[0-255]` in interpreter.ts is the trivial version of this (integers)
- `ExecutionGraph` caching is per-flow — Graph Compression shares across flows

**Implementation phase:** Phase 36 (when graphs become large enough to warrant compression)

---

## Suggestion 5: Execution Signatures

Two completely different source files with the same governance shape share proofs, plans, and scheduling metadata.

```typescript
interface ExecutionSignature {
  readonly effectMask:      number;   // EffectFlags bitmask
  readonly capabilityMask:  number;   // which capabilities used
  readonly privacyMask:     number;   // which privacy qualifiers
  readonly targetMask:      number;   // which compute targets
  readonly inputStateFlags: number;   // ValueStateFlags of inputs
  readonly outputStateFlags: number;  // ValueStateFlags of outputs
}
```

**Example:**
```galerina
// These have identical ExecutionSignatures:
pure flow validateEmail(raw: String) -> protected Email
pure flow validateUuid(raw: String) -> protected Uuid
// Both: { effectMask: 0, inputStateFlags: Unsafe, outputStateFlags: Protected }
// → Share the same ProofGraph
```

**Connection to existing code:**
- `executionGraphCacheKey(flowName, sourceHash)` uses per-flow identity
- ExecutionSignature enables cross-flow proof sharing: `executionSignatureCacheKey(signature)`

**Implementation phase:** Phase 34 (when ProofGraph is formalised)

---

## Suggestion 6: Graph Fingerprints

Fingerprints explain WHY graphs differ. Hashes prove that they differ.

```typescript
interface GraphFingerprint {
  readonly effects:        readonly string[];
  readonly capabilities:   readonly string[];
  readonly privacy:        readonly string[];
  readonly targets:        readonly string[];
  readonly boundaryCount:  number;
  readonly auditRequired:  boolean;
}

function diffFingerprints(a: GraphFingerprint, b: GraphFingerprint): readonly string[] {
  // Returns human-readable explanation of governance differences
  // "B adds network.outbound → denied on wasm-standalone"
  // "B has 2 more boundary crossings → slower, requires more audit events"
}
```

**Developer experience:** Given a flow denied on WASM standalone, the fingerprint diff explains exactly why — without diffing source code.

**Connection to existing code:**
- `SPORE-EFFECT-005` (BroadAliasUsed) suggestedFix is a primitive version of this
- `getGraphFlagSummary()` in devtools-graph provides the raw data

**Implementation phase:** Phase 32 (developer tooling — galerina explain)

---

## Suggestion 7: Runtime Prediction Layer

AI planning layer that pre-warms leases and scheduler lanes based on predicted next requests.

**Constraint:** Prediction provides HINTS, never AUTHORITY. Governance still validates everything. Prediction only changes WHEN, never WHETHER.

```galerina
runtime policy {
  prediction {
    max_pre_warmed_leases 10
    lookahead_ms 100
    disable_in deterministic   // deterministic mode = no speculation
  }
}
```

**Implementation phase:** Phase 38 (distributed governance — needs enough telemetry data)

---

## Suggestion 8: Audit as Native Graph (AuditEdge)

Every node emits an AuditEdge. Audit proof = graph replay.

```typescript
interface AuditEdge {
  readonly kind:     "capability" | "boundary" | "policy" | "effect";
  readonly fromNode: NodeId;
  readonly toNode:   NodeId;
  readonly flowName: string;
  readonly detail:   string;   // "consumed database.read", "crossed PII boundary"
  readonly hash:     string;   // tamper-proof
}
```

**Result:** Audit proof IS the graph structure — not a separate log. Tampering with the graph invalidates the proof.

**Connection to existing code:**
- `RuntimeAuditEntry` in audit-writer.ts is a flat log entry
- `ExecutionProofChain` is a linear hash chain
- AuditEdge turns it into a full directed graph — more queryable, more verifiable

**Implementation phase:** Phase 35 (compliance framework — this is what regulators actually need)

---

## The Governance Fabric (5–10 Year Vision)

A meta-layer above all execution that owns the complete topology of trust in the system.

```
Source
  ↓
GIR
  ↓
PassiveExecutionPlan
  ↓
Governance Fabric        ← owns everything below
  ├─ Capability topology
  ├─ Trust topology
  ├─ Boundary topology
  ├─ Privacy topology
  └─ Target topology
  ↓
ExecutionGraph (a view of the Fabric)
  ↓
Scheduler
  ↓
Compute
```

**ExecutionGraphs become views of the Governance Fabric**, not independent structures.

**What this enables:**
- Single flow: Governance Fabric = the flow's contract
- Single server: Governance Fabric = all flows + their relationships
- Cluster: Governance Fabric = distributed capability mesh
- AI agent swarm: Governance Fabric = inter-agent trust topology

**The governance query always works the same way:**
```
"Which flows require database.write?" → graph query
"Which services have unaudited network.outbound?" → graph query
"Which agents in this AI swarm can access PHI?" → graph query
```

**Implementation path:**
- Phase 31 (package ecosystem): Governance Fabric as in-process registry
- Phase 36 (AI/ML full stack): Governance Fabric as service-level mesh
- Phase 39 (enterprise toolkit): Governance Fabric as cluster-level protocol
- Phase 40 (Galerina 1.0): Governance Fabric as the foundation of Galerina's market identity

---

## Governance Versioning (Not in Original Proposal)

When the governance shape of a flow changes:

```
ProofGraph v1: { database.read }
ProofGraph v2: { database.read, network.outbound }  ← requires new approval (tightened)
ProofGraph v3: { database.read }                    ← auto-approved (loosened, safer)
```

**Rule:** Tightening governance (adding effects/capabilities) requires sign-off.
Loosening governance (removing effects) is automatically approved.

This makes governance changes **auditable and directional** — the same model used in financial change control.

---

## Implementation Priority

| Suggestion | Priority | Phase | Reason |
|---|---|---|---|
| ControlNode/DataNode | **Highest** | 27 | Needed for native Tensor.dot routing |
| Execution Signatures | High | 34 | Unlocks proof sharing at scale |
| ProofGraph | High | 32 | Formalises governance certificates |
| Graph Fingerprints | Medium | 32 | Developer tooling foundation |
| Capability Routing Graph | Medium | 33 | Cloud deployment provider independence |
| Audit as Native Graph | Medium | 35 | Compliance framework |
| Graph Compression | Lower | 36 | Only matters at 100K+ node scale |
| Runtime Prediction Layer | Lower | 38 | Needs telemetry data to train on |
| Governance Fabric | Long-term | 39-40 | The north star, built incrementally |

---

---

## Intel Hardware Mapping (i5 and i9)

Galerina's ExecutionGraph maps directly onto Intel's hybrid core architecture.

### Core Affinity Enum

```typescript
export const enum IntelCoreAffinity {
  AnyCore     = 0,
  Efficient   = 1,  // E-cores: low-power, background, I/O-bound work
  Performance = 2,  // P-cores: hot-path compilation, crypto, ProofGraph
}

export const enum X86VectorAffinity {
  Generic_Wasm  = 0,  // WASM SIMD 128-bit — safe default on any x86
  Intel_AVX2    = 1,  // i5 and above: 256-bit registers, dual SIMD lanes
  Intel_AVX512  = 2,  // i9 (HX/K series): 512-bit registers, matrix math
  Intel_AVX10   = 3,  // Future: converged AVX10 instruction set
}
```

### Work Classification (i5 / i9)

| Work Type | Core Affinity | Reason |
|---|---|---|
| ProofGraph construction | P-core | Crypto + deterministic — needs full execution width |
| Compilation hot pass | P-core | Loop-intensive; benefits from branch prediction + large L2 |
| `audit.write` ring buffer | E-core | Non-blocking append; low compute, high frequency |
| Data lineage tracking | E-core | Background update; I/O-bound, not compute-bound |
| Package signature verify | E-core | Occasional, low-priority, not on critical path |
| Tensor.dot (Float32) | AVX2 / AVX-512 | 256-bit (i5) or 512-bit (i9) SIMD FMA |
| SHA-256 hash chain | AVX-512 (i9) | Intel SHA-NI + AVX-512 cuts hash time in half vs AVX2 |
| WASM hot loops | WASM SIMD 128 | Safe cross-platform default; V8/wasmtime will use AVX2 internally |

### The i5 vs i9 Development Matrix

**i5 Machine (baseline target):**
```
CostGraph routes to: WASM SIMD 128 / AVX2 paths
Tests: "can the compiler scan effect bitmasks without L1 cache miss?"
Validates: mass cloud deployment cost model (standard instances)
VTune check: no cache miss on SoA node arena 64-byte alignment
```

**i9 Machine (scale target):**
```
CostGraph routes to: AVX-512 / AVX10 tensor paths
Tests: parallel graph processing — 20+ pure flows concurrent
Validates: high-throughput compilation (Stage B self-host speed)
VTune check: AVX-512 utilisation > 60% on tensor.dot benchmarks
```

### Intel Thread Director Integration

The `ExecutionScheduler` emits thread affinity hints to the OS, which Intel
Thread Director uses to optimise core assignment:

```typescript
interface ExecutionSchedulerHint {
  workType: "governance_compile" | "hot_flow" | "audit_write" | "lineage";
  affinity: IntelCoreAffinity;
  priority: "realtime" | "normal" | "background";
  vectorRequirement: X86VectorAffinity;
}
```

Intel Thread Director reads these hints and places threads on the appropriate
core type. Galerina does not override the OS scheduler — it provides hints.

### Intel Hardware Shield (Security Boundary)

When a native module runs (AVX-512 kernel, NPU driver), it must execute
inside a process sandbox with Intel Hardware Shield isolation:
- Memory isolation: OS process boundary + hardware page protection
- Exception interception: hardware exceptions write to `AuditProofNode` before crash
- WASM escape proof: the ProofGraph records whether `preferred_execution: wasm`
  was honored or whether native code was invoked

```
If native module was used instead of WASM:
  → AuditLog.write({ event: "NativeEscapeFromWASM", reason: "avx512_required",
                       governanceApproved: true, cpuFeature: "avx512" })
```

The audit trail must cryptographically prove the execution path taken.

---

## See Also

- `galerina-hybrid-wasm-native-architecture-v1.md` — the canonical v1.0 hybrid WASM architecture
- `galerina-core-economics-package.md` — CostGraph package design and Intel routing
- `galerina-security-anti-abuse.md` — anti-botnet architecture and capability governance
- `galerina-explicitness-principles.md` — nothing important hidden
- `galerina-passive-execution-plans.md` — PassiveExecutionPlan (current proof foundation)
- `execution-graph.ts` — current ExecutionGraph implementation
- `pure-flow-cache.ts` — LRU memoization (proto-lease manager)
