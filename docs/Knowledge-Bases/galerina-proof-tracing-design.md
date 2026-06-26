# Galerina — Proof-Tracing Design (`assuming {}` block)

**Version:** 1.0 (2026-06-04)  
**Source:** notes/28-what next  
**Status:** Design proposal — implementation tasks #73 and #74.

---

## The Problem: Redundant Runtime Checks

When a parent flow has already proved `ensure amount > 0` at its boundary, a child
flow that calls it should not need to re-inject the same WAT assertion gate. Without
proof-tracing, every flow that uses `amount` independently re-proves the same condition.

**Without proof-tracing:**
```spore
pure flow validatePayment(amount: Int) -> Bool
contract { invariant { ensure amount > 0; } }   ;; Gate injected here
{ return amount > 0 }

secure flow processPayment(amount: Int) -> Result<Receipt, Error>
contract { invariant { ensure amount > 0; } }   ;; Same gate re-injected (redundant)
{ ... }
```

**With proof-tracing (`assuming {}`):**
```spore
secure flow processPayment(amount: Int) -> Result<Receipt, Error>
contract {
  ;; No invariant {} needed — proof is referenced from validatePayment's manifest
  assuming(validatePayment, "ensure amount > 0") {
    ;; Compiler verifies: validatePayment's .lmanifest contains
    ;; ProofObligation { claim: "ensure amount > 0", verified: "static"|"runtime-precheck" }
    ;; If found and manifest is valid + signed → skip WAT gate here (zero overhead)
  }
}
```

---

## The `assuming {}` Block — Design Spec

### Syntax

```spore
assuming(flowRef, "condition-expression") {
  // Code in this block has the named proof in scope as an axiom.
  // The compiler does NOT emit a WAT gate for the named condition here.
  // All other invariants still apply.
}
```

### Compiler verification procedure

When the compiler encounters `assuming(flowRef, condition)`:

1. **Resolve `flowRef`** → look up the flow's `.lmanifest` (via import resolver)
2. **Load the manifest** → parse the `proofObligations` array (CBOR Tag 403)
3. **Match the condition** → check if any `ProofObligation.claim` matches the canonical form of `condition`
4. **Verify the obligation is satisfied** → `verified` field must be `"static"` or `"runtime-precheck"` (NOT `"pending"`)
5. **Verify manifest signature** → ML-DSA-65 signature over the manifest body must be valid
6. **If all checks pass** → mark the condition as `assumed_via_manifest` in the ProofGraph; skip WAT gate
7. **If any check fails** → emit `SPORE-ASSUME-001: ProofNotFoundInManifest` (hard error)

### Security Properties

**`assuming {}` is NOT a "trust me" escape hatch.** It is a **proof certificate check**:
- The referenced manifest must be cryptographically signed (ML-DSA-65)
- The condition must be in the manifest's `proofObligations` with a verified status
- The manifest's `sourceHash` must match the currently deployed version of `flowRef`
- The assumption is logged in the caller's ProofGraph with a reference to the dependency manifest hash

**Comparison with similar systems:**

| System | `assuming` mechanism | Audit trail? | Cryptographic verification? |
|---|---|---|---|
| Dafny `assume` | Developer declaration, no proof | ❌ None | ❌ None |
| SPARK `pragma Assume` | Developer + justification string | ⚠️ Text only | ❌ None |
| Frama-C `//@ assumes` | External justification required | ⚠️ Manual review | ❌ None |
| Rust `unsafe` | Developer assertion | ❌ None | ❌ None |
| **Galerina `assuming {}`** | Manifest ProofObligation lookup | ✅ CBOR Tag 403 | ✅ ML-DSA-65 signed |

Galerina's `assuming {}` is the only mechanism in this class that provides both a structured audit trail AND cryptographic proof verification. A developer cannot use `assuming {}` to bypass a proof — they can only reference a proof that already exists in a signed manifest.

### New SPORE Diagnostic Codes

| Code | Severity | Meaning |
|---|---|---|
| `SPORE-ASSUME-001` | ERROR | Condition not found in referenced flow's manifest ProofObligations |
| `SPORE-ASSUME-002` | ERROR | Referenced manifest signature invalid or expired |
| `SPORE-ASSUME-003` | ERROR | Manifest sourceHash mismatch — referenced flow has been modified |
| `SPORE-ASSUME-004` | WARNING | Condition found but only as `runtime-precheck` (not `static`) — partial proof |

---

## Governance-as-Evidence: Runtime Failure Audit Events

When a WAT `unreachable` instruction fires (from an invariant gate, capability violation, or
fuel exhaustion), the DSS.wasm supervisor intercepts the Wasmtime trap signal and records a
structured Audit Event.

### New Diagnostic Code: `SPORE-INV-000`

`SPORE-INV-000` is the **runtime governance violation** code — fired when an `unreachable` trap
reaches the DSS supervisor. It is distinct from compile-time codes:

| Code | When | Layer |
|---|---|---|
| `SPORE-INV-001` | Compile time — statically proved false | Floor 3 (Proof Zone) |
| `SPORE-INV-002` | Compile time — post-condition (Phase 4) | Floor 3 (Proof Zone) |
| `SPORE-INV-003` | Compile time — empty block warning | Floor 3 (Proof Zone) |
| `SPORE-INV-004` | Compile time — unresolved symbol | Floor 3 (Proof Zone) |
| **`SPORE-INV-000`** | **Runtime — hardware trap fired** | **Floor 2 (Containment)** |

### Audit Event Schema (CBOR Tag 410 — new)

When `SPORE-INV-000` fires, the DSS supervisor records:

```
AuditEvent (CBOR Tag 410) {
  code:            "SPORE-INV-000",
  flowId:          string,         ;; the flow that was executing
  contractHash:    bytes,          ;; sha256 of the flow's contract block
  meterSnapshot:   uint,           ;; fuel consumed at time of trap
  trapKind:        string,         ;; "invariant_pre" | "invariant_post" | "capability" | "fuel"
  vdpmAtTrap:      uint32,         ;; V_DPM register value at time of trap
  rollbackStatus:  string,         ;; "clean" (trap was atomic — no partial state)
  timestamp:       string          ;; ISO-8601
}
```

**Why `rollbackStatus` is always "clean":** Because `unreachable` fires atomically (the CPU
raises a hardware interrupt before the next instruction executes), no side effects can have
occurred after the invariant violation was detected. The Confused Deputy problem is structurally
eliminated — there is no "between" state.

### The Confused Deputy Elimination

The [Confused Deputy Problem](https://en.wikipedia.org/wiki/Confused_deputy_problem) (Hardy, 1988)
occurs when a trusted program is tricked into misusing its authority due to runtime conditional
logic being exploitable.

**Galerina's answer:** `unreachable` makes partial execution structurally impossible.

If a flow's invariant is violated, execution terminates before the next instruction. There is
no branch the attacker can exploit, no "confused" state where the flow has consumed resources
but not completed correctly. The DSS supervisor receives the trap signal, records the audit
event, and the isolate is discarded. The host process continues.

This is a stronger guarantee than "defensive coding" — it is **structural impossibility of
the confused deputy state**.

---

## Phase Numbering Reconciliation

The notes/28 document uses a different phase numbering from the build roadmap:

| notes/28 Phase | Content | Build Roadmap |
|---|---|---|
| Phase 3 | DSS.wasm Supervisor | DRCM Phase 5 (#40-#41) |
| Phase 4 | SMT Proof Integration | DRCM Phase 4 (partial) + future |
| Phase 5 | `assuming {}` Proof-Tracing | Tasks #73-#74 (new) |

The build roadmap's DRCM phases are the authoritative sequence. notes/28's phase numbering
is a conceptual simplification. The content is consistent; only the labels differ.

---

## Implementation Tasks

| Task | Description |
|---|---|
| **#73** | Parser: `assuming(flowRef, condition)` block — new AST node `assumingDecl` |
| **#74** | Compiler: manifest-lookup proof verification for `assuming {}` blocks |
| **#75** | Governance-as-Evidence: structured audit event schema (CBOR Tag 410) |
| **#76** | SPORE-INV-000: DSS.wasm trap handler → Audit Event emission (DRCM Phase 5 gate) |

---

## Research Notes

The `assuming {}` pattern is a form of **proof certificate checking** — analogous to:
- **TLS certificate verification**: "I trust this because a signed authority vouches for it"
- **SLSA provenance checking**: "This binary came from this verified source"
- **Lean4's `have` tactic**: "I know P because I can reference this proof term"

The key distinction from all existing `assume` mechanisms in other languages: Galerina's
version is **cryptographically verified** via the signed `.lmanifest`. A developer cannot
write `assuming(flow, condition)` and have it silently pass if the proof doesn't exist
in a valid, signed manifest. This makes Galerina's proof-tracing auditable in the same way
that the `.lmanifest` itself is auditable — by any third party with the public signing key.

---

## Cross-References

| Topic | Document |
|---|---|
| `invariant {}` implementation | `galerina-floor3-proof-zone-graph.md` |
| `.lmanifest` binary CBOR (ProofObligation Tag 403) | `galerina-cbor-manifest-spec.md` |
| DSS.wasm supervisor (where SPORE-INV-000 fires) | `galerina-deterministic-runtime-containment.md` |
| Agile governance patterns | `galerina-agile-governance-pattern.md` |
| Domain guard policies | `galerina-domain-guard-policies.md` |
