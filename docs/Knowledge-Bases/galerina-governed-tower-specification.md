# Galerina — The Governed Tower: Master Technical Specification

**Version:** 1.0 (2026-06-04)  
**Status:** Authoritative architecture specification — supersedes individual component documents
where they conflict.  
**Source:** notes/28-what next synthesis

---

## 1. Executive Summary

Galerina is a **High-Assurance Governance-as-Code** platform. It departs from traditional
runtime architectures — which rely on software-level "policing" — in favour of
**Deterministic Enforcement**. By integrating static proof generation at compile-time with
atomic hardware-level traps at runtime, Galerina eliminates the Confused Deputy Problem and
ensures that every execution adheres strictly to a cryptographically signed, immutable
governance manifest.

> **The core architectural claim:**
> Intelligence lives in the compiler (Floor 3 + Floor 4).
> Enforcement lives in the hardware (Floor 2 + Floor 1 + Foundation).
> The runtime has no decisions to make — only transitions to execute.

---

## 2. The Four-Floor Architecture

| Floor | Zone | Purpose | Enforcement Mechanism |
|---|---|---|---|
| **4** | **Attestation** | Governance & Identity | ML-DSA-65 signing; manifest-based policy gates; CBOR binary (RFC 8949) |
| **3** | **Proof Zone** | Analysis & Logic | Static verification; constant-folding; ProofObligation (CBOR Tag 403); `assuming {}` proof-tracing |
| **2** | **Containment** | Isolation & Enforcement | DSS.wasm supervisor; DWI isolates; `unreachable` hardware traps; V_DPM monotonic register |
| **1** | **Execution** | Compute Dispatch | Wasmtime Cranelift JIT; CBOR dispatch; fuel injection; guard pages |

**Foundation (below Floor 1):** CPU hardware guard pages (2GB); ML-DSA-65 (NIST FIPS 204);
WASI Preview 2; gVisor/OCI Layer 2.

---

## 3. Core Architectural Mechanisms

### 3A. The Invariant Bridge (Floor 3 → Floor 2)

The Invariant Bridge is the compiler logic that connects static governance to runtime
enforcement. Every `ensure expr` in an `invariant {}` block follows one of two paths:

**Path 1 — Statically Verified:**
- Compiler proves the condition is always true (e.g. `ensure 5 > 0`)
- The check is **elided entirely** — zero WAT instructions emitted
- ProofObligation recorded as `statically_verified` (CBOR Tag 403)
- **This is Goal A: zero-overhead security for proved invariants**

**Path 2 — Runtime Precheck:**
- Condition is dynamic (e.g. `ensure amount > 0` where `amount` is a parameter)
- Compiler injects an atomic hardware trap gate:
  ```wat
  (if (i32.eqz CONDITION_WAT) (then unreachable))
  ```
- ProofObligation recorded as `runtime-precheck` (CBOR Tag 403)
- `unreachable` fires atomically before the next CPU instruction — no TOCTOU window

**Symbol Resolution Gate (SPORE-INV-004):**
All identifiers in `ensure` expressions must be in the flow's parameter scope. The Governance
Verifier (Floor 3) catches unresolved symbols before they reach the emitter. The emitter is
"dumb" — it assumes the AST is valid.

### 3B. The Single-Exit Transformation (Phase 4 prerequisite — task #70)

For Phase 2 (parameter-only invariants), pre-condition gates are sufficient because parameters
are immutable — the invariant value cannot change during execution.

For Phase 4 (computed-result invariants, e.g. `ensure ledger.credits == ledger.debits`),
post-conditions must fire on ALL return paths. This requires:
- Function body wrapped in `(block $exit)`
- All `return V` emissions replaced by `(local.set $result V)` + `(br $exit)`
- Post-condition gate fires after `$exit`

**Performance:** Cranelift eliminates the `local.set`/`br`/`local.get` boilerplate at register
allocation time. Zero overhead in JIT output for simple flows.

### 3C. Proof-Tracing: `assuming {}` (task #73/#74)

Instead of complex auto-propagation, Galerina uses **Explicit Assertion Bridging**. The
developer signals that a proof was established in a parent flow:

```spore
assuming(validatePayment, "ensure amount > 0") {
  // Compiler verifies: validatePayment's .lmanifest contains
  // ProofObligation { claim: "ensure amount > 0", verified: "static" }
  // AND the manifest is ML-DSA-65 signed AND sourceHash matches
  // If all pass → skip WAT gate here (zero overhead)
}
```

This is a **proof certificate check** — not a "trust me" statement. A developer cannot
bypass a proof; they can only reference a proof that exists in a valid, signed manifest.

### 3D. The Emergency State Machine (Floor 3 → Floor 2, DRCM Phase 4)

The `emergency {}` policy block defines a pre-compiled state machine. At runtime, DSS.wasm
performs an **O(1) lookup** — not a decision:

```
Signal: invariant_failure
  → ApplyPolicy(EmergencyManifest_A)
  → V_DPM &= ~network_bit        // monotonic: clear, never set
  → emit AuditEvent (CBOR Tag 410)
```

**Three properties preserved:**
1. **Zero Decision Entropy** — no branching logic, no heuristics, no judgment
2. **Monotonicity** — V_DPM bits can only be cleared, never set (permissions shrink only)
3. **Audit-First Recovery** — every transition is a known, authorized event from the signed manifest

### 3E. Governance-as-Evidence (CBOR Tag 410, task #75)

Every runtime failure is not a crash — it is **structured evidence**:

```cbor
AuditEvent (Tag 410) {
  code:           "SPORE-INV-000",
  flowId:         string,
  contractHash:   bytes,
  meterSnapshot:  uint,    // fuel at time of trap
  trapKind:       string,  // invariant_pre | invariant_post | capability | fuel
  vdpmAtTrap:     uint32,
  rollbackStatus: "clean", // ALWAYS — unreachable is atomic
  timestamp:      string
}
```

`rollbackStatus` is **always `"clean"`** because `unreachable` fires before the next CPU
instruction. No partial state mutation is possible. This is the structural elimination of the
Confused Deputy Problem.

---

## 4. The V_DPM — Dynamic Posture Matrix (Extended for Topology)

The 32-bit V_DPM register is the physical enforcement mechanism for capability monotonicity.
It lives exclusively in DSS.wasm's private linear memory. Guest DWI isolates cannot address it.

**Bit layout (v2 — updated by Topological Graph Engine):**

| Bit | Name | Category | Description |
|---|---|---|---|
| 0 | `network.outbound` | Capability | All outbound network calls |
| 1 | `storage.write` | Capability | Filesystem writes |
| 2 | `secret.access` | Capability | Vault/secrets access |
| 3 | `audit.write` | Capability | Audit log writes |
| 4 | `database.write` | Capability | Database mutations |
| 5 | `ai.inference` | Capability | AI/LLM calls |
| 6 | `shell.execute` | Capability | Shell execution (restricted) |
| 7 | `native.call` | Capability | Native FFI (restricted) |
| **8** | **`dag_edge_valid`** | **Topology** | **Current transition is authorized in the ExecutionDAG** |
| **9** | **`mmcp_read`** | **Topology** | **Isolate has an active read-capable MMCP** |
| **10** | **`mmcp_write`** | **Topology** | **Isolate has an active write-capable MMCP** |
| **11** | **`mmcp_execute`** | **Topology** | **Isolate has an active execute-capable MMCP** |
| **12** | **`mmcp_secret`** | **Topology** | **Isolate has a secret-access MMCP** |
| **16–19** | **phase_0..3** | **Path** | **Which ExecutionDAG phase is currently active** |
| 20–29 | Reserved | — | Future capability/topology families |
| 30 | `quarantine_engaged` | Containment | Set when any DWI is quarantined |
| 31 | `emergency_mode` | Override | Set when any emergency {} response fires |

**Topology-first check order (DSS.wasm):**
1. Bit 8 (`dag_edge_valid`) — is this a DAG-authorized transition? If 0 → all subsequent capability checks fail
2. V_DPM capability AND (bits 0-7) — does the capability exist?
3. MMCP mask check (bits 9-12) — is this memory operation permitted?
4. Behavioral deviation check — does rolling hash match BehavioralFingerprint (CBOR 417)?

**Capability check operation (O(1)):**
```
request_mask = capability_to_bitmask(requested_effect)
result = V_DPM & request_mask
if result == 0: fire unreachable trap
```

**DPM_DEFENSIVE_MODE** (from `resilience { fallback circuit_breaker }`):
```
V_DPM &= ~(bit_0 | bit_1 | bit_5)  // clear network, storage, AI
V_DPM |= bit_31                      // set emergency_mode
```
Note: setting bit_31 is the ONE case where a bit is "set" — but it's not a permission
expansion, it's a mode flag that further restricts what the emergency overlay permits.

---

## 5. DSS.wasm Scaffolding Sequence

**The V_DPM structure must be defined FIRST.** Every other Phase 5 component references
specific bit positions:

```
1. V_DPM bit layout definition  ← START HERE
        ↓
2. Capability → bitmask mapping function
        ↓
3. Capability check O(1) comparison
        ↓
4. Emergency state machine transitions (clear bits on signal)
        ↓
5. Trap-handling signal loop (intercept unreachable, emit AuditEvent)
        ↓
6. DWI fuel injection + isolate allocation
        ↓
7. WASI import broker (guest calls → V_DPM check → allow/deny)
```

**Why V_DPM first:** You cannot write "deny network.outbound" in the emergency {} handler
without knowing which bit corresponds to `network.outbound`. The bit layout is the data
foundation for every other component in the supervisor.

---

## 6. Completion Status Map

| Mechanism | Floor | Status |
|---|---|---|
| Invariant parser + static eval | 3 | ✅ DRCM Phase 2 (#36) |
| WAT assertion gate injection | 2/3 | ✅ DRCM Phase 2 (#36) |
| SPORE-INV-001/003/004 diagnostics | 3 | ✅ ENFORCED |
| Binary CBOR .lmanifest (RFC 8949) | 4 | ✅ DRCM Phase 3 (#67) |
| Domain Guard Differential Proof | 3 | ✅ (#56) |
| resilience {} + observability {} | 3 | ✅ (#58) |
| `assuming {}` proof-tracing | 3 | ⬜ Tasks #73-#74 |
| Governance-as-Evidence (Tag 410) | 2 | ⬜ Task #75 |
| SPORE-INV-000 runtime trap handler | 2 | ⬜ Task #76 (Phase 5 gate) |
| emergency {} overlay parser | 3 | ⬜ DRCM Phase 4 (#39) |
| V_DPM structure + bit layout | 2 | ⬜ DRCM Phase 5 (#40-#41) |
| DSS.wasm supervisor (self-hosted) | 2 | ⬜ DRCM Phase 5 (#41) |
| step keyword + DWI allocator | 2 | ⬜ DRCM Phase 5 (#40) |
| Epilogue Receipt + ledger | 2 | ⬜ DRCM Phase 6 (#42) |
| Negative test suite (OWASP) | All | ⬜ DRCM Phase 7 (#43) |
| Single-exit body transformation | 2/3 | ⬜ Task #70 (Phase 4 gate) |

---

## 7. Cross-References (Full KB)

| Layer | Document |
|---|---|
| **Layer 0 — Principles** | `architecture-charter.md` |
| **Layer 1 — Rules** | `galerina-governance-rules.md` — 37+ SPORE codes |
| **Layer 2A — Patterns** | `galerina-architecture-patterns.md` |
| **Layer 2B — Syntax** | `galerina-contract-authoring-guide.md`, `galerina-contract-clause-reference.md` |
| **Layer 3 — Runtime** | `galerina-deterministic-runtime-containment.md` |
| **CBOR** | `galerina-cbor-manifest-spec.md` |
| **Proof-Tracing** | `galerina-proof-tracing-design.md` |
| **Agile Governance** | `galerina-agile-governance-pattern.md` |
| **CI/CD Pipeline** | `galerina-governance-cicd-pipeline.md` |
| **Floor 3 Graph** | `galerina-floor3-proof-zone-graph.md` |
| **Infographic Concept** | `galerina-platform-infographic-concept.md` |
| **Build Roadmap** | `galerina-build-roadmap.md` |
| **Engineering Goals** | `galerina-engineering-goals.md` (Goals A/B/C, T-006/007/008) |
| **Master Navigation** | `KNOWLEDGE-BASE-INDEX.md` |
