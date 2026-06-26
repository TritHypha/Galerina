# Galerina — Domain Guard Policies (Static Manifest Clamping)

**Version:** 1.1 (2026-06-04)  
**Source:** notes/25-handling contract component information.md  
**Status:** Design proposal — implement in Stage A governance verifier (task #56).

> **Disambiguation — Two distinct "policy" concepts exist in Galerina:**
> - **Domain Guard Policy** (`policy DomainName { ... }`) — THIS document. External immutable anchor. Defines permission ceilings. Referenced via `[conforms_to: Name]` on `contract {}`.
> - **Emergency Policy Overlay** (`policy { emergency { on X { deny Y } } }`) — runtime monotonic overlay, inline between `contract {}` and `{ body }`. See `galerina-governance-rules.md` S-008.

---

## 1. Architectural Relationship: External Anchor + Local Declaration

The design is built around a strict separation of concerns:

```
EXTERNAL ANCHOR (Guardrail Manifest)           LOCAL DECLARATION (Flow Contract)
──────────────────────────────────────────     ───────────────────────────────────────
governance/policies/invoicing_guard.spore        flows/processInvoice.spore

policy InvoicingDomainGuard {                  secure flow processInvoice(...) -> Result<...>
  permitted_effects {                          contract [conforms_to: InvoicingDomainGuard] {
    gateway.charge                               intent { "Process billing..." }
    audit.write                                  effects { gateway.charge }  ← validated
  }                                              limits { max_memory: 4MB }  ← validated
  enforced_limits {                            }
    max_memory_ceiling: 4MB                    {
    max_instructions_ceiling: 5_000_000          ;; body
  }                                            }
}
```

### The Policy (External Anchor — Guardrail Manifest)

- Defined globally or in a domain-specific governance library
- Lives in `governance/policies/` — **never inside a flow file**
- **Immutable** from the perspective of local code — cannot be loosened from inside the flow file
- Sets the **ceiling** for what any contract that references it is permitted to declare
- The compiler loads it by name and performs a Differential Proof against the local contract

### The Contract (Local Declaration)

- Defined in the flow file, **outside the body** (between flow signature and `{ body }`)
- Declares what this specific workflow *intends* to do
- Must explicitly `conforms_to` an external policy via the `[conforms_to: Name]` decorator on the contract block header
- The local `effects {}` and `limits {}` values are validated against the policy ceiling — they must be a **subset** of what the policy permits

### Why the Separation is Mandatory

If the policy were defined inside or adjacent to the `contract {}` block in the same local file, any developer or AI authoring tool could modify it to loosen constraints (e.g., change `max_memory_ceiling: 4MB` to `16MB`). By keeping the policy **external and immutable**, the ceiling is physically impossible to bypass from inside the flow file.

This also enables the compiler's **Manifest Validation Pass**:
1. Compiler reads the local `contract` declarations
2. Compiler loads the referenced external policy (Guardrail Manifest)
3. Compiler performs the **Differential Proof**: local contract ⊆ policy ceiling?
4. If any local declaration exceeds the ceiling → hard build fault (SPORE-GOV-004 / SPORE-LIMIT-001)

---

## 2. The Problem Without Clamping

In multi-tenant or AI-assisted environments, local contracts are modified by developers or AI agents. Without an external ceiling, this can introduce privilege escalation.

**Without clamping:** an AI tool writes `effects { filesystem.wipe_all }` in a payment module that should only ever have `effects { gateway.charge }`. The compiler accepts it because the effect is syntactically valid — there's nothing to compare against.

**With domain guard policies:** the Governance Verifier loads `InvoicingDomainGuard`, checks that `filesystem.wipe_all` is not in `permitted_effects`, and rejects the build with `SPORE-GOV-004`.

---

## 3. Compiler Validation Flow

```
┌──────────────────────────────────────────────────────┐
│ STEP 1: External Guardrail Manifest loaded            │
│  governance/policies/invoicing_guard.spore              │
│  policy InvoicingDomainGuard {                        │
│    permitted_effects { gateway.charge, audit.write }  │
│    enforced_limits   { max_memory_ceiling: 4MB }      │
│  }                                                    │
└───────────────────────┬──────────────────────────────┘
                        │ referenced by [conforms_to: ...]
                        ▼
┌──────────────────────────────────────────────────────┐
│ STEP 2: Local contract declaration                    │
│  contract [conforms_to: InvoicingDomainGuard] {       │
│    effects { filesystem.wipe_all }  ← ATTEMPTED      │
│  }                                                    │
└───────────────────────┬──────────────────────────────┘
                        │ validated by Governance Verifier
                        ▼
┌──────────────────────────────────────────────────────┐
│ STEP 3: Differential Proof                            │
│  contract.effects ⊆ policy.permitted_effects?        │
│  { filesystem.wipe_all } ⊆ { gateway.charge, ... }? │
│  ❌ NO → SPORE-GOV-004: Policy Violation               │
│  'filesystem.wipe_all' forbidden under               │
│  'InvoicingDomainGuard'                               │
└──────────────────────────────────────────────────────┘
```

---

## 4. Policy Definition Syntax

Policy files live in `governance/policies/` and are referenced by name:

```spore
;; File: governance/policies/invoicing_guard.spore

policy InvoicingDomainGuard {
  ;; Maximum allowable effects — anything outside this set is rejected at compile time
  permitted_effects {
    gateway.charge,
    ledger.mutate,
    audit.write
  }

  ;; Maximum allowable capabilities (DRCM Phase 4 — typed SystemCapability)
  permitted_capabilities {
    SystemCapability.CallGate(
      module: "gateway",
      function: "charge_endpoint",
      enforce_tls: true
    )
  }

  ;; Non-negotiable physical ceilings — local contract cannot exceed these
  enforced_limits {
    max_memory_ceiling:       4MB,
    max_instructions_ceiling: 5_000_000
  }
}
```

---

## 5. Contract Binding Syntax

The `[conforms_to: PolicyName]` is a **decorator on the contract block header**, not a sub-block inside it:

```spore
;; File: flows/processInvoice.spore

secure flow processCorporateInvoicing(merchantId: String, invoiceBatch: List<Invoice>)
  -> Result<Void, Fault>
contract [conforms_to: InvoicingDomainGuard] {
  intent { "Execute corporate invoicing under strict domain lockdowns." }

  ;; gateway.charge is in permitted_effects ✅
  effects { gateway.charge, audit.write }

  ;; max_memory: 4MB <= max_memory_ceiling: 4MB ✅
  limits { max_memory: 4MB }
}
{
  ;; Pure transform business execution
  return Ok(Void)
}
```

---

## 6. Violation Examples

### Violation A — Undeclared Effect

```spore
contract [conforms_to: InvoicingDomainGuard] {
  effects {
    gateway.charge,
    filesystem.delete_logs   ;; 🔴 NOT in permitted_effects
  }
}
```

**Compiler response:**
```
SPORE-GOV-004: Policy Violation. The effect 'filesystem.delete_logs' is
explicitly forbidden under policy context 'InvoicingDomainGuard'.
```

### Violation B — Exceeding Resource Ceiling

```spore
contract [conforms_to: InvoicingDomainGuard] {
  limits {
    max_memory: 16MB   ;; 🔴 Ceiling is 4MB
  }
}
```

**Compiler response:**
```
SPORE-LIMIT-001: Resource bounds exceeded. Requested max_memory (16MB)
exceeds the maximum policy constraint (4MB) in 'InvoicingDomainGuard'.
```

---

## 7. Key Properties

**1. Local Declarations Are Intentional, Not Absolute**  
The values in the local `contract {}` express what the code *intends* to use. The external policy sets the ceiling those intentions must fit within. Both layers are necessary — local for traceability, external for security invariants.

**2. Deterministic Manifest Matching**  
When a bound contract compiles successfully, the validated permissions are embedded in the `.lmanifest`. At runtime, DSS.wasm reads the manifest to configure V_DPM bitmask gates — the policy ceiling is burned into the deployment artifact.

**3. Unlocked Contracts**  
A contract without `[conforms_to: ...]` is **unlocked** — it falls back to standard Governance Verifier rules (effects deny-by-default, etc.). High-trust modules that declare `effects { filesystem.write }` or similar without a domain guard emit `SPORE-GOV-019: Unbound contract in high-trust module`.

**4. AI Safety Amplification**  
Domain guards make the AI authoring safety pipeline structurally stronger. Even if an AI tool proposes a widening (rule C-005: propose → verify → approve), the domain guard ceiling ensures the widening is **compile-time impossible** if it exceeds the ceiling — the proposal fails regardless of the approval state.

---

## 7a. `permitted_effects` state machine (GOV-001 — ratified 2026-06-16)

A Gate-6 audit found the conformance check failed open: an empty/omitted `permitted_effects` was
treated as allow-all, and an unresolvable `[conforms_to: …]` was only a warning. The ratified
semantics map `permitted_effects` to the K3 calculus:

| Form | K3 | Meaning |
|---|---|---|
| **Omitted** (no `permitted_effects` block) | `0` neutral | The policy makes **no claim** on effects — auto-inherit / get-out-of-the-way. A clean **limits-only** guard; no `SPORE-GOV-004` for any declared effect. |
| **Explicitly empty** `permitted_effects { }` | `−1` hard deny | **Revokes all effects** — every declared effect emits `SPORE-GOV-004`. |
| **Populated** `permitted_effects { a, b }` | `+1` allow | Allows **only** the listed effects (subject to parent constraints); others emit `SPORE-GOV-004`. |

**Strict `conforms_to` resolution:** because an omitted block auto-inherits its boundary from the
named policy, an **unresolvable `[conforms_to: X]`** breaks the inheritance chain — a **FATAL
`DOMAIN_GUARD_NOT_FOUND` error in `production`/`deterministic`** (fail-closed; the chain collapses
to `−1` deny) and a **warning in `dev`** (the policy may be in another file still being authored).
This keeps limits-only guards boilerplate-free while satisfying zero-trust: an empty array denies,
a broken pointer halts the production build. Implemented in `verifyDomainGuardConformance`; tests
in `tests/governance/guard-decl.test.mjs`.

---

## 8. New Diagnostic Codes

| Code | Description |
|---|---|
| `SPORE-GOV-004` | Policy violation — effect/capability not in `permitted_effects`/`permitted_capabilities` |
| `SPORE-LIMIT-001` | Resource bounds exceeded — `limits {}` value exceeds policy `enforced_limits` ceiling |
| `SPORE-GOV-019` | Unbound contract in high-trust module (no `[conforms_to: ...]`) |

---

## 9. Implementation Plan (Task #56)

**Phase 1 — Parser extension:**
- Recognise `[conforms_to: PolicyName]` as an attribute list on the `contract` keyword
- Store the bound policy name on the `ContractDecl` AST node

**Phase 2 — Policy definition syntax:**
- Parse top-level `policy Name { permitted_effects {} permitted_capabilities {} enforced_limits {} }` in `.spore` files
- Load from `governance/policies/` directory at compile time (or from `galerina.policy.spore` in project root)

**Phase 3 — Governance Verifier — Differential Proof pass:**
- For each flow with a bound contract, look up the named policy
- Check: every declared `effects {}` entry ⊆ `permitted_effects`
- Check: every declared capability ⊆ `permitted_capabilities`
- Check: every declared `limits {}` value ≤ corresponding `enforced_limits` ceiling
- Emit `SPORE-GOV-004` / `SPORE-LIMIT-001` on violations

**Phase 4 — Manifest integration:**
- Write the bound policy name and ceiling values into the `.lmanifest`
- DSS admission gate verifies ceiling consistency at runtime load

---

## 10. Multi-Tenant Directory Layout

```
project/
├── governance/
│   └── policies/
│       ├── invoicing_guard.spore      ← gateway.charge only, 4MB
│       ├── auth_guard.spore           ← database.read, secret.read, 32MB
│       ├── analytics_guard.spore      ← database.read, network.outbound, 128MB
│       └── admin_guard.spore          ← unrestricted (requires architecture review)
├── flows/
│   ├── invoicing/
│   │   └── charge.spore               ← contract [conforms_to: InvoicingDomainGuard] { ... }
│   ├── auth/
│   │   └── verify.spore               ← contract [conforms_to: AuthDomainGuard] { ... }
│   └── analytics/
│       └── report.spore               ← contract [conforms_to: AnalyticsDomainGuard] { ... }
```

Each module is statically ceiling-capped at compile time. A dependency injection attack that tricks the invoicing module into calling `database.write` is rejected at the Governance Verifier — not at runtime after damage is done.

---

## Cross-References

| Topic | Document |
|---|---|
| Emergency policy overlay (separate concept) | `galerina-governance-rules.md` S-008 |
| Governance rules C-005 (AI proposal pipeline) | `galerina-governance-rules.md` |
| Contract authoring guide | `galerina-contract-authoring-guide.md` |
| DRCM — V_DPM bitmask gates | `galerina-deterministic-runtime-containment.md` |
| Architecture patterns | `galerina-architecture-patterns.md` |
