# Galerina — Topological Graph Engine

**Version:** 1.1 (2026-06-05)  
**Purpose:** Integrates the Governed Tower with topology-aware execution enforcement.
Evolves Galerina from a deterministic sandbox into a **Topology-Aware Governance Platform**.

---

## Design Review: What Was Adapted

The source specification (notes/28 extended) proposed "vector similarity metrics for permission
requests." This was **replaced with Behavioral Fingerprinting** because:
- Vector similarity introduces non-deterministic boundaries (fuzzy cluster matching)
- The Tower's core principle: all permission decisions are O(1) binary operations (V_DPM AND)
- A pre-computed SHA-256 of the expected execution path is equally powerful, fully deterministic,
  and cryptographically auditable

eBPF LSM / dedicated MMU segments were **not adopted** because they conflict with the
Wasmtime-only TCB constraint (`PRINCIPLE: No Rust in the project; everything is .spore → WASM`).

---

## The Three New Engine Components

### Component 1 — Execution DAG (Floor 3 → Floor 4 → Floor 2)

**What it is:** At compile time, the Governance Verifier constructs a DAG (Directed Acyclic
Graph) of valid execution state transitions from the flow's control flow graph + contract
constraints. This DAG is stored in `.lmanifest` as CBOR Tag 414.

**State-Space Nodes:** Every node in the DAG is defined as:
```
Node = {
  memory_snapshot: hash(linear_memory_state),
  vdpm_state:      uint32,   // current V_DPM bitmask
  proof_context:   bytes,    // active ProofObligation hashes from invariant {}
}
```

**Authorized Edges:** An edge `A → B` exists if and only if:
1. The instruction at A is permitted under `vdpm_state(A)`
2. The resulting memory and V_DPM state is provably `vdpm_state(B) ≤ vdpm_state(A)` (monotonic)
3. The transition is within the flow's declared `effects {}` set

**Unauthorized edge detection:** If DSS.wasm observes a state transition not in the DAG
(e.g., a call to `network.outbound` while on a path that was proved to be `pure`), it fires
`unreachable` immediately — the `SecurityViolation` trap. This is the second dimension of
security beyond the V_DPM bitmask check.

**CBOR Tag 414 — ExecutionDAG:**
```cbor
ExecutionDAG (Tag 414) {
  flowId:      string,
  nodeCount:   uint,
  edgeCount:   uint,
  rootNode:    uint32,   // V_DPM at entry
  edges:       array of { from: uint32, to: uint32, effect: string }
}
```

**Implementation gate:** DRCM Phase 6 (after DSS.wasm supervisor, task #41)

---

### Component 2 — MMCP: Memory-Mapped Capability Pointer (Floor 2)

**What it is:** A typed pointer that carries its own capability mask. When a DWI isolate
receives an MMCP to a memory region, the mask specifies what operations are permitted.

**The problem it solves:** Currently, memory access in WASM is bounded by linear memory
guard pages (physical impossibility of cross-isolate access). MMCPs add a *governance layer*
on top: even within a DWI's 4MB region, individual memory sub-regions have typed access rules.

**MMCP structure:**
```
MMCP = {
  base_offset:  uint32,   // offset within DWI linear memory
  length:       uint32,   // byte count
  capability:   uint32,   // bitmask: read=0x1, write=0x2, execute=0x4, secret=0x8
  owner_flow:   string,   // flow that owns this region
}
```

**Linear ownership semantics (inspired by Rust + CHERI):**
- When an MMCP is "moved" to another flow's scope, the source's access bits are cleared
- This prevents Use-After-Free and Double-Free by design
- No runtime check needed — the V_DPM update handles it atomically

**CBOR Tag 415 — CapabilityPointer:**
```cbor
CapabilityPointer (Tag 415) {
  baseOffset:   uint32,
  length:       uint32,
  capabilityMask: uint32,
  ownerFlowId:  string
}
```

**Implementation gate:** DRCM Phase 5 (alongside step keyword + DWI allocator, task #40)

---

### Component 3 — Pre-Resolved Policy DAG (Floor 3 → Floor 4)

**What it is:** During the admission gate (`galerina verify`), all `[conforms_to:]` domain
guard policy conflicts are resolved into a compact, conflict-free DAG. Stored in `.lmanifest`.
DSS.wasm loads this at startup and uses it for O(1) transition validation.

**Conflict example:**
```
Policy A: deny network.outbound
Policy B: allow storage.write (required by invoiced flow)
```
Without pre-resolution, the DSS.wasm supervisor must evaluate `deny` vs `allow` at runtime.
With pre-resolution, the DAG already contains the resolved outcome: `allowed = { storage.write },
denied = { network.outbound }`.

**Pre-resolution algorithm (Floor 3, compile time):**
1. Load all referenced domain guard policies via `[conforms_to:]` annotations
2. Build conflict graph: nodes = effects, edges = allow/deny rules from all policies
3. Resolve conflicts using precedence: `deny > allow` (deny-by-default)
4. Output conflict-free effect matrix as compact bit array
5. Store in `.lmanifest` CBOR Tag 416

**CBOR Tag 416 — PolicyResolutionDAG:**
```cbor
PolicyResolutionDAG (Tag 416) {
  allowedEffects:  uint32,  // bitmask of permitted effects for this flow
  deniedEffects:   uint32,  // bitmask of denied effects
  conflictsFound:  uint,    // number of conflicts resolved
  resolvedAt:      string   // ISO timestamp
}
```

**Status:** Can be implemented now (Task #79). Builds on existing domain guard infrastructure.

---

### The Adapted Element: Behavioral Fingerprinting

**Replaces:** "Vector similarity metrics for permission requests" (spec §3)  
**Why replaced:** Vector similarity is non-deterministic — cluster boundary decisions vary
between runs. This violates the Tower's O(1) binary permission guarantee.

**What Behavioral Fingerprinting does instead:**
- At compile time: hash the expected execution path (CFG hash: ordered sequence of effects)
- Store in `.lmanifest` as a `behavioralFingerprint: sha256(cfgPath)` field
- At runtime: DSS.wasm computes rolling hash of actual execution path
- If the rolling hash deviates from `behavioralFingerprint` → trigger `emergency {}` overlay

This is **deterministic, auditable, and cryptographically verifiable** — an attacker cannot
produce a hash collision without breaking SHA-256. The anomaly detection is as strong as
a probabilistic vector model, but with zero false-positive rate.

---

## Updated V_DPM Bit Layout (Extended for Topology)

| Bit Range | Description | Scope |
|---|---|---|
| 0–7 | Core capabilities: network, storage, secret, audit, db, ai, shell, native | Capability layer |
| 8–15 | Topology flags: dag_edge_valid, mmcp_read, mmcp_write, mmcp_execute, mmcp_secret | Topology layer |
| 16–19 | Execution path: phase_0..3 (which DAG phase is active) | Path tracking |
| 20–29 | Reserved: future capability/topology families | — |
| 30 | `quarantine_engaged` | Containment |
| 31 | `emergency_mode` | Override |

**New topology-layer bits (8–15):**
- Bit 8: `dag_edge_valid` — current transition is authorized in the ExecutionDAG
- Bit 9: `mmcp_read` — the isolate has an active read-capable MMCP
- Bit 10: `mmcp_write` — the isolate has an active write-capable MMCP
- Bit 11: `mmcp_execute` — the isolate has an active execute-capable MMCP
- Bit 12: `mmcp_secret` — the isolate has an active secret-access MMCP

When Bit 8 (`dag_edge_valid`) is 0, the capability check O(1) AND operation always returns 0
regardless of other bits — **topology check runs BEFORE capability check**.

---

### `gate {}` — Admission Guard Integration

The `gate(condition)` syntax maps directly to V_DPM bit 8 (`dag_edge_valid`) in the topology layer.

At the architectural level:
1. Compiler records `gate(condition)` → `dag_check_required: true` in flow manifest
2. DSS.wasm checks bit 8 before dispatching to any flow inside a gate block
3. If bit 8 is 0 (DAG transition not authorized) → `unreachable` trap → SPORE-INV-000 AuditEvent

The `condition` in `gate(condition)` maps to a Domain Guard Policy name. At Phase 5, the
pre-compiled decision tree from the PolicyResolutionDAG (CBOR Tag 416) is used for the O(1) lookup:

```
gate(admin_only)
    ↓
Compiler looks up 'admin_only' in knownDomainGuards
    ↓
Records { gateCondition: "admin_only", bit: 8 } in .lmanifest ProofObligation (Tag 403)
    ↓
DSS.wasm: before dispatch → V_DPM & 0x100 (bit 8) → if 0 → unreachable
```

**Stage A (now):** gate condition recorded in manifest; bit 8 check deferred to Phase 5.  
**Phase 5 (DSS.wasm):** real `(if (i32.eqz (i32.and (global.get $vdpm) (i32.const 256))) (then unreachable))` emitted.

**Governance rules:** `SPORE-GATE-001` (unknown condition), `SPORE-GATE-002` (gate on pure flow)

---

## Updated CBOR Tag Registry

| Tag | Type | Purpose |
|---|---|---|
| 400 | Capability | Resource authorisation bitmasks |
| 401 | Effect | Declared state-mutation tokens |
| 402 | SecretHandle | Opaque vault pointers |
| 403 | ProofObligation | Cryptographic evidence (invariant {}) |
| 404 | GovernanceSignature | ML-DSA-65 + Ed25519 bundle |
| 405 | DomainGuardRef | Pointer to policy ceiling |
| 406 | ResilienceState | Failure/retry/quarantine status |
| 407 | ObservabilitySpan | Telemetry metadata |
| 408 | EconomicsLease | Compute/credit budget balance |
| 409 | (Reserved) | — |
| 410 | AuditEvent | SPORE-INV-000 runtime governance violation |
| **414** | **ExecutionDAG** | **Authorized state transitions (Topology)** |
| **415** | **CapabilityPointer** | **MMCP typed memory view** |
| **416** | **PolicyResolutionDAG** | **Pre-resolved policy conflict matrix** |
| **417** | **BehavioralFingerprint** | **CFG hash for path deviation detection** |
| 411–413, 418–499 | Reserved | Future use |

---

## Implementation Sequencing

```
Existing:
  ✅ V_DPM bit layout (bits 0-7, 30-31) — defined in Tower spec
  ✅ Domain guard policies [conforms_to:] — task #56
  ✅ .lmanifest binary CBOR — task #67

Phase 3 (now):
  🔲 #79 — Pre-resolved Policy DAG (Tag 416) — builds on admission gate
  🔲 #80 — BehavioralFingerprint generation (Tag 417) — CFG hash at compile time

Phase 5 (DRCM Phase 5):
  🔲 #78 — MMCP types + capability mask structure (Tag 415)
  🔲 V_DPM topology bits (8-15) wired into DSS.wasm

Phase 6 (DRCM Phase 6):
  🔲 #77 — Execution DAG construction from CFG (Tag 414)
  🔲 #80 — DAG-edge validation in DSS.wasm signal loop
```

---

## Floor Map (Updated)

```
Floor 4 — Attestation:
  .lmanifest carries:
    CBOR 403: ProofObligation (invariants)
    CBOR 414: ExecutionDAG (authorized state transitions) ← NEW
    CBOR 416: PolicyResolutionDAG (pre-resolved conflicts) ← NEW
    CBOR 417: BehavioralFingerprint (expected CFG path) ← NEW

Floor 3 — Proof Zone:
  Compiler:
    DAG construction from flow CFG + contract constraints → CBOR 414 ← NEW
    Policy conflict pre-resolution → CBOR 416 ← NEW
    CFG hash computation → CBOR 417 ← NEW
    Invariant static eval → CBOR 403 (existing)

Floor 2 — Containment:
  DSS.wasm checks (in order):
    1. dag_edge_valid (bit 8) — is this a DAG-authorized transition? ← NEW
    2. V_DPM capability AND — does the capability exist?
    3. MMCP mask check — is this memory operation permitted? ← NEW
    4. Behavioral deviation — does rolling hash match fingerprint? ← NEW

Floor 1 — Execution:
  CBOR binary dispatch + fuel injection (unchanged)
  MMCP-typed memory allocation for DWI isolates ← NEW
```

---

## Cross-References

| Topic | Document |
|---|---|
| V_DPM bit layout | `galerina-governed-tower-specification.md` |
| CBOR tag registry | `galerina-cbor-manifest-spec.md` |
| Domain guard policies | `galerina-domain-guard-policies.md` |
| DSS.wasm scaffolding | `galerina-deterministic-runtime-containment.md` |
| Agile governance patterns | `galerina-agile-governance-pattern.md` |
| Proof-tracing design | `galerina-proof-tracing-design.md` |
