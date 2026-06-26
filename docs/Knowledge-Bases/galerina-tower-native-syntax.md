# Galerina — Tower-Native Syntax

**Version:** 1.2 (2026-06-05)  
**Status:** Implemented — Stage A compiler + governance verifier (§1–§10)  
**Source:** User initiative document: governed/view/trap design + v2.1 Tower-native syntax

---

## Overview

Three syntax primitives map directly to the Governed Tower architecture and V_DPM register.
Unlike general-purpose control flow, these keywords are **declarative security primitives** —
each one causes the compiler to emit Tower-specific metadata, proof obligations, or WAT gates.

> **Design principle:** Move security invariants from runtime conditions into compile-time
> declarations. Each primitive eliminates a category of implicit, unverifiable assumptions.

---

## 1. `trap` — Hard Governance Invariant

### Syntax
```spore
trap CONDITION : ERROR_CODE
```

### Semantics
Fires an atomic hardware `unreachable` trap if CONDITION is **TRUE**.
This is the failure-condition form — the inverse polarity of `ensure`.

| Statement | Fires when | Condition polarity |
|---|---|---|
| `ensure amount > 0` | amount ≤ 0 | Positive (the invariant) |
| `trap amount <= 0 : ERR_NEG` | amount ≤ 0 | Negative (the failure case) |

Both produce identical WAT. `trap` is preferred when:
- The condition reads naturally as a failure case (`trap amount > balance`)
- A named error code is required for AuditEvent emission
- The check is a hard security invariant, not a precondition

### Compiler output
```wat
(if (i32.gt_s (local.get $amount) (local.get $balance))
  (then unreachable) ;; SPORE-INV-000 trapKind=ERR_AMOUNT_EXCEEDS_LIMIT
)
```

### Manifest recording
Each `trap` is recorded as a `ProofObligation` (CBOR Tag 403):
```json
{ "kind": "runtime-trap", "condition": "amount > balance", "errorCode": "ERR_AMOUNT_EXCEEDS_LIMIT" }
```

### Governance rules
- `SPORE-TRAP-001` — error code must be a valid SCREAMING_SNAKE_CASE identifier
- `SPORE-TRAP-002` — all symbols in condition must be in the flow's parameter scope

### Example
```spore
flow processWithdrawal(amount: Int, balance: Int) -> Result<Bool, Error>
contract {
  intent "Process a withdrawal — balance must cover amount"
  effects { allow database.write }
}
{
  trap amount > balance : ERR_INSUFFICIENT_FUNDS
  trap amount <= 0 : ERR_NEGATIVE_AMOUNT
  let newBalance = balance - amount
  return Ok(true)
}
```

---

## 2. `governed` — Tower Floor Qualifier

### Syntax
```spore
governed floor_N flow name(params) -> ReturnType
contract { ... }
{ body }
```

### Valid floor names
| Name | Alias | Tower Zone | V_DPM Topology |
|---|---|---|---|
| `floor_1` | `execution` | Compute Dispatch | Wasmtime Cranelift |
| `floor_2` | `containment` | Isolation + Enforcement | DSS.wasm supervisor |
| `floor_3` | `proof`, `proof_zone` | Analysis + Logic | Static verification |
| `floor_4` | `attestation` | Governance + Identity | ML-DSA-65 signing |

### Semantics
Declares which Tower floor this flow is authorized to execute in. The compiler:
1. Records the floor constraint in the manifest `ProofObligation` (CBOR Tag 403)
2. In Phase 5, DSS.wasm checks bit 8 (`dag_edge_valid`) in V_DPM before dispatching

### Stage A vs Phase 5 behavior
- **Stage A (now):** Floor constraint recorded in manifest; no runtime enforcement yet
- **Phase 5 (DSS.wasm):** Bit 8 check emitted as real WAT gate; unauthorized floor access → SPORE-INV-000

### Governance rules
- `SPORE-DAG-001` — governed flow declares an unknown floor name
- `SPORE-DAG-002` — floor is inconsistent with effects profile (floor_1 cannot access secret.access)

### Example
```spore
governed floor_3 flow verifyTransactionHash(tx: Transaction) -> Hash
contract {
  intent "Verify transaction hash in the Proof Zone — Floor 3 only"
  effects {}
}
{
  return tx.hash()
}

governed floor_4 flow signManifest(manifest: Manifest) -> GovernanceSignature
contract {
  intent "Sign a governance manifest — Floor 4 (Attestation) only"
  effects { allow audit.write }
}
{
  return manifest.sign()
}
```

---

## 3. `view(cap)` — MMCP Capability-Masked Pointer Type

### Syntax
```spore
let varName: view(capability1 | capability2) = expr
```

### Semantics
Declares a variable whose memory access is restricted to the specified capability mask.
The compiler creates a Memory-Mapped Capability Pointer (MMCP, CBOR Tag 415).

At runtime (Phase 5), DSS.wasm enforces: if the V_DPM bits corresponding to the
declared capabilities are not set, dereference is denied → `unreachable` trap.

### Capability names (map to V_DPM bits)
| Capability | Bit | V_DPM mask |
|---|---|---|
| `read` | — | no bit required (read-only, safe by default) |
| `secret` | 2 | `0x04` |
| `write` | 1 | `0x02` |
| `execute` | 11 | `0x800` |

### Stage A behavior
- `view(...)` type is parsed and stored in the AST
- An MMCP stub is emitted in `capabilityPointers` in the manifest
- Runtime enforcement deferred to DRCM Phase 5 (#78 full MMCP)

### Governance recording
Each `view(...)` declaration produces an MMCP record:
```json
{
  "variable": "secureData",
  "capabilityMask": "read|secret",
  "cborTag": 415,
  "status": "stub_phase_5"
}
```

### Example
```spore
pure flow readSensitiveData(ptr: view(read | secret)) -> String
contract {
  intent "Read secret data via capability-restricted pointer"
  effects { allow secret.access }
}
{
  return ptr.load()
}
```

### Why `view` beats raw `ensure`
```
❌ Without view: read(ptr)             — no compile-time capability record
✅ With view:    let x: view(read | secret) = ptr  — MMCP in manifest
```
The MMCP is generated **before code runs** — the restricted pointer exists at manifest-loading
time, not just at runtime. This turns a runtime permission check into a compile-time pointer restriction.

---

## 4. Match Exhaustiveness (SPORE-MATCH-001)

### Rule
When a `match` expression targets an enum-like expression (a V_DPM signal, a capability enum)
and has **no `_` wildcard arm** and fewer than 6 branches, the governance verifier emits
`SPORE-MATCH-001` as a warning.

### Why it matters
```spore
// ❌ Governance hole — what happens on "fuel_exhausted"?
match signal {
  "invariant_failure" => { deny network.outbound }
  "capability_denied" => { quarantine }
}

// ✅ Complete — all signals handled
match signal {
  "invariant_failure" => { deny network.outbound }
  "capability_denied" => { quarantine }
  _ => { emergency }  // catch-all required
}
```

Without exhaustiveness, a V_DPM signal can pass through an emergency {} handler unhandled —
creating a silent governance gap.

---

## Comparison Table

| Logic | Before Tower-native | Tower-native |
|---|---|---|
| Path security | `ensure isFloor3` (runtime) | `governed floor_3 flow` (compile-time) |
| Memory security | `read(ptr)` (no capability record) | `let x: view(read \| secret)` (MMCP) |
| Invariant failure | `ensure amount > 0` (positive form) | `trap amount <= 0 : ERR_NEG` (failure form) |
| Governance coverage | Match may silently miss arms | SPORE-MATCH-001 warns on gaps |

---

## Architecture Integration

These primitives make Galerina source code **Proof-Carrying Code**:

```
governed floor_3 flow verifyTx(...)
  ↓
Compiler sees governed qualifier
  ↓
Records ProofObligation { floor: "floor_3", bit: 8 } in .lmanifest (CBOR Tag 403)
  ↓
DSS.wasm reads .lmanifest at load time
  ↓
Before every verifyTx dispatch: checks V_DPM bit 8 (dag_edge_valid)
  ↓
Unauthorized floor access → unreachable trap → AuditEvent (CBOR Tag 410)
```

The code is not just *running* — it is *self-describing its security requirements* to the Tower.

---

## Implementation Status

| Feature | Status | Phase |
|---|---|---|
| `trap` parse + WAT gate | ✅ Stage A | #81 |
| `governed` qualifier + manifest | ✅ Stage A | #82 |
| `view()` type + MMCP stub | ✅ Stage A | #83 |
| Match exhaustiveness SPORE-MATCH-001 | ✅ Stage A | #84 |
| `static` compile-time constants | ✅ Stage A | #86 |
| `bitfield` governance register + V_DPM rewrite | ✅ Stage A | #87 |
| `gate {}` admission guard (verifier) | ✅ Stage A | #88 |
| `access {}` Default Deny + `grant` enforcement | ✅ Stage A | #89 |
| `guard Name {}` domain ceiling syntax | ✅ Stage A | #92 |
| `import "./path.spore"` DAG merge | ✅ Stage A | #93 |
| `import plugin safe/assimilate` syntax | ✅ Stage A | #94 |
| `assuming(flowRef, "claim") {}` proof-tracing | ✅ Stage A | #73/#74 |
| `governed` real DAG_CHECK WAT | ⬜ Phase 5 | #77 |
| `view()` full MMCP enforcement | ⬜ Phase 5 | #78 |
| AuditEvent on trap | ⬜ Phase 5 | #75 |
| `gate {}` Phase 5 WAT bit-8 enforcement | ⬜ Phase 5 | #88 |
| `policy {}` State Mutation Governance | ⬜ Phase 5 | #90 |
| Migrate `vdpm.spore` to `bitfield V_DPM {}` | ⬜ After #87 | #91 |

---

## 5. `static` — Compile-Time Constants

### Syntax
```spore
static NAME = VALUE
```

### Semantics
Defines a compile-time constant. The compiler substitutes VALUE everywhere NAME appears —
zero memory overhead, O(1) lookup. Equivalent to C's `#define` but type-safe.

**Compile-time folding:** The WAT emitter folds every `static` reference into an inline literal.
`static FLOOR_PROOF = 3` causes every reference to emit `(i32.const 3)` in WAT output — no
heap allocation, no memory load, no indirection. This is the zero-overhead guarantee.

**Primary use cases:**
- Tower topology constants: `static FLOOR_PROOF = 3`
- Bitmask thresholds: `static MAX_RETRY = 3`
- Any value known at compile time that should never change at runtime

### WAT output example
```spore
static MAX_RETRY = 3

// A flow using MAX_RETRY emits:
// (i32.const 3)   ← not a load, not a global — literal immediate
```

### Governance rules
- `SPORE-STATIC-001` — value is not a compile-time constant (contains runtime expressions)
- `SPORE-STATIC-002` — name declared more than once in the same scope

---

## 6. `bitfield` — Type-Safe Governance Registers

### Syntax
```spore
bitfield NAME {
  field_name: BIT_POSITION
  ...
}
```

### Semantics
Defines a structured governance register. Replaces the verbose `pure flow VDPM_BIT_*() -> Int` pattern.

The compiler generates two accessors per declared field:
- `NAME.field_name` → `(1 << BIT_POSITION)` — the **bitmask value** (for AND/OR checks)
- `NAME.BIT_field_name` → `BIT_POSITION` — the **raw bit position** (for shift operations)

So `bitfield V_DPM { network_outbound: 0 }` produces:
- `V_DPM.network_outbound` = `1`  (i.e. `1 << 0`)
- `V_DPM.BIT_network_outbound` = `0`  (raw bit index)

**Primary use case: V_DPM register definition**
```spore
// Before (verbose):
pure flow VDPM_BIT_NETWORK_OUTBOUND() -> Int { return 1 }
pure flow VDPM_BIT_STORAGE_WRITE() -> Int { return 2 }

// After (bitfield):
bitfield V_DPM {
  network_outbound: 0    // V_DPM.network_outbound = 1, V_DPM.BIT_network_outbound = 0
  storage_write: 1       // V_DPM.storage_write = 2,   V_DPM.BIT_storage_write = 1
  secret_access: 2
  audit_write: 3
  database_write: 4
  ai_inference: 5
  shell_execute: 6
  native_call: 7
  dag_edge_valid: 8      // V_DPM.dag_edge_valid = 256, V_DPM.BIT_dag_edge_valid = 8
}
```

**Usage in flow bodies:**
```spore
// Check if network capability is active (bitmask AND):
let has_network = (current_vdpm & V_DPM.network_outbound) != 0

// Shift by raw bit position:
let bit_pos = V_DPM.BIT_network_outbound   // = 0
```

### Governance rules
- `SPORE-BF-001` — duplicate bit positions in same bitfield
- `SPORE-BF-002` — bit position > 31 (V_DPM is 32-bit)

---

## 7. `gate {}` — Admission Guard Block

### Syntax
```spore
gate(condition) {
  flow name(params) -> ReturnType
  contract { ... }
  { body }
}
```

### Semantics
Wraps one or more flows with an admission guard. The `condition` names a Domain Guard Policy.
Only callers satisfying the policy ceiling can dispatch flows inside the gate block.

**Maps to V_DPM bit 8 (`dag_edge_valid`)** — the topology check fires before capability checks.

```
Caller → dispatch → gate check (bit 8) → if authorized → capability check (bits 0-7) → flow body
                                        → if denied → unreachable trap → AuditEvent (Tag 410)
```

### Stage A vs Phase 5
- **Stage A:** gate condition recorded in manifest; no runtime enforcement yet
- **Phase 5:** DSS.wasm emits real bit 8 check before every gated flow dispatch

### Governance rules
- `SPORE-GATE-001` — condition not in knownDomainGuards (warning — full enforcement Phase 5)
- `SPORE-GATE-002` — gate wrapping a `pure flow` (redundant — pure flows have no effects)

---

## 8. `access {}` — Capability Negotiation Block

### Syntax
```spore
flow name(params) -> ReturnType
contract { ... }
access {
  purpose "machine-readable-tag"
  allow TypeName to "action"
  deny TypeName
  require effect.name
}
{ body }
```

### Semantics
Replaces the deprecated inline `policy {}` block. Declares who may call this flow and
what data types are authorized to cross the call boundary.

**Position:** Between `contract {}` and `{ body }` — represents the boundary crossing:
- `contract {}` = DECLARES what the flow is
- `access {}` = NEGOTIATES who may use it
- `{ body }` = EXECUTES

**Why `access` not `policy`:** The `policy` keyword is RESERVED for State Mutation Governance
(see §Policy Reservation below).

### Policy keyword reservation

The `policy` keyword is reserved for a future v2.1 feature: **State Mutation Governance**.

```spore
// FUTURE (not yet built):
contract {
  invariant { ensure balance > 0 }   // safety bounds — what must always be true
  policy {                            // mutation governance — how state may change
    balance: only_decrease
    max_change_per_call: 1000
    requires audit.write
  }
}
```

`invariant {}` defines *what must never happen*.  
`policy {}` (future) will define *how governed variables are allowed to evolve*.

### Default Deny

`access {}` operates under **Default Deny** semantics. Only capabilities explicitly listed with
`grant` are permitted. Everything else is automatically denied — no need to list denials.

```spore
access {
  grant network.outbound   // permitted
  grant audit.write        // permitted
  // db.write automatically denied — not listed
}
```

### `;;` govComment in access blocks

Governance annotations (`;;`) placed inside or near `access {}` blocks are collected into
`governanceAnnotations[]` in the `.lmanifest`. They appear in the manifest narrative alongside
`ProofObligations` and are scanned by the governance verifier at verify time.

```spore
access {
  ;; This flow may only reach the payments gateway — all other network is denied by default
  grant network.outbound
  grant audit.write
}
```

### Governance rules
- `SPORE-SYNTAX-LEGACY-003` — deprecated inline `policy {}` used instead of `access {}`
- `SPORE-ACCESS-001` — `grant` references unknown capability name
- `SPORE-ACCESS-002` — `grant` capability not declared in flow's `effects {}`

---

## 9. `import` — DAG Merge File Import

### Syntax
```spore
import "./path.spore"
```

### Semantics
Merges the target `.spore` file into the current compilation DAG. All top-level symbols defined in the
imported file become available in the importing scope. File resolution is relative to the importing file.

**Import chain rules:**
- The imported file must exist and be error-free before the merge proceeds
- Circular imports (A → B → A) are rejected at compile time
- If an imported symbol name collides with a local definition, the local wins (warning emitted)

### Manifest recording
Imports are tracked in the `.lmanifest` — the compiler records the resolved path and source hash
of each imported file, enabling the admission gate to verify the full dependency chain.

### Diagnostic codes
| Code | Severity | Condition |
|---|---|---|
| `SPORE-IMPORT-001` | error | Target file not found |
| `SPORE-IMPORT-002` | error | Imported file has parse errors |
| `SPORE-IMPORT-003` | error | Circular import detected |
| `SPORE-IMPORT-004` | warning | Imported symbol name collides with local definition |

### Example
```spore
import "./shared_types.spore"    // symbols from shared_types.spore are now in scope

flow processOrder(id: OrderId) -> Result<Void, Fault>
contract {
  intent { "Process an order using shared type definitions." }
  effects { db.write }
}
{
  return Ok(Void)
}
```

---

## 10. `import plugin` — Bridged Plugin Import

### Syntax
Two forms — choose based on isolation model:

```spore
// Form A — Safe (sandboxed bridge)
import plugin safe "./path" as X {
  contract {
    access { grant capability.name }
  }
}

// Form B — Assimilate (Hot-Code Residency)
import plugin assimilate "./path" as X {
  contract {
    access { grant capability.name }
  }
}
```

### Safe vs Assimilate

| | `safe` | `assimilate` |
|---|---|---|
| **Isolation** | Sandboxed — runs as a separate WASM module | Hot-Code Residency — loaded into DSS bootstrap memory |
| **Location** | Any `.spore` file | **`boot.spore` only** (`SPORE-ASSIMILATE-001` if elsewhere) |
| **Memory budget** | Per-call DWI allocation | `assimilation_memory_budget` required in `governance {}` |
| **Performance** | Standard cross-module overhead | Near-zero — resident at boot time |
| **Use case** | Untrusted or third-party plugins | Trusted, performance-critical core extensions |

### Default Deny on plugin access

The `access { grant }` block inside the plugin import declaration controls which capabilities
the plugin is permitted. Default Deny applies — an assimilated plugin with **no** `access {}` block
is rejected with `SPORE-ASSIMILATE-003`.

### Manifest recording
- `assimilatedPlugins[]` in the `.lmanifest` tracks all Hot-Code Residency plugins loaded at boot
- Each entry records the plugin path, source hash, and granted capabilities

### Example
```spore
// boot.spore — assimilate a trusted crypto library at boot time
import plugin assimilate "./crypto/fast_hash.spore" as FastHash {
  contract {
    access {
      ;; FastHash only needs secret access — all other capabilities denied by default
      grant secret.access
    }
  }
}

// Any file — safe plugin for an untrusted data transformer
import plugin safe "./transforms/sanitize.spore" as Sanitize {
  contract {
    access { grant storage.read }
  }
}
```

### Governance rules
| Code | Severity | Condition |
|---|---|---|
| `SPORE-ASSIMILATE-001` | warning | `assimilate` declared outside `boot.spore` |
| `SPORE-ASSIMILATE-002` | warning | `assimilation_memory_budget` not declared in `governance {}` |
| `SPORE-ASSIMILATE-003` | error | Assimilated plugin has no `access { grant }` block |

---

## Cross-References

| Topic | Document |
|---|---|
| V_DPM bit layout | `galerina-governed-tower-specification.md` §4 |
| MMCP (Tag 415) | `galerina-cbor-manifest-spec.md` |
| ExecutionDAG (Tag 414) | `galerina-topological-graph-engine.md` |
| `gate {}` topology integration | `galerina-topological-graph-engine.md` §gate-admission-guard-integration |
| Invariant bridge (`ensure`) | `galerina-governed-tower-specification.md` §3A |
| DSS.spore foundation | `packages-galerina/galerina-core-security/src/dss/vdpm.spore` |
| Build roadmap | `galerina-build-roadmap.md` |
