# Galerina — Agile Governance Pattern

**Version:** 1.0 (2026-06-04)  
**Purpose:** Design pattern for maintaining execution-layer determinism while retaining
policy-lifecycle agility. Resolves the "rigidity vs. flexibility" tension in the
Governed Tower architecture.

---

## The Core Insight

The "loss of agility" from deterministic security is an architectural illusion.
You don't lose agility — **you move it one layer up.**

| Traditional orchestration | Governed Tower |
|---|---|
| Runtime is the centre of gravity — it re-configures itself | Governance Pipeline (Floor 4) is the centre of gravity |
| "Smart" runtime decisions via heuristics | Static "What-If" proofs run before deployment |
| Exception handling via runtime "negotiation" | Hierarchical delegate invariants with bounded local ranges |
| Policy updates require redeploying the runtime | CI/CD emits a new signed `.lmanifest` in minutes |

The binary stays perfectly simple, deterministic, and fast.
The intelligence moves into the tools that *create* the binary.

---

## Pattern 1 — Policy-as-Versioned-Proof

**The problem:** A new requirement emerges (e.g. "allow a previously blocked transaction type").

**Old approach:** Tell the runtime to "be flexible" — add conditional logic, flags, override modes.  
**Galerina approach:** Use the CI/CD pipeline to generate a new, cryptographically signed `.lmanifest`.

**How it works:**
1. The governance change is proposed as a `.galerina.proposal` artifact (C-005 AI safety pipeline)
2. The Governance Verifier runs the Differential Proof: `new_contract ⊆ new_policy_ceiling`
3. If the proof passes: a new `.lmanifest` is signed (ML-DSA-65) and deployed
4. The runtime loads the new manifest — same deterministic enforcement, new governance parameters
5. The runtime **never knew the policy changed** — it just verified a different signed manifest

**Status:** Foundation built. `.lmanifest` (binary CBOR) is live as of DRCM Phase 3 (#67).
CI/CD governance pipeline is live (#59, governance-review.yml).  
**Remaining:** Real ML-DSA-65 signing (requires key custody, DRCM Phase 5 #34/41).

---

## Pattern 2 — Shadow Policies ("What-If" Static Proofs)

**The problem:** You want to move fast but need mathematical proof that a proposed relaxation
is safe before it touches production.

**The concept:** Run "Agility Passes" in the compiler — test whether a proposed change would
break existing invariants before deployment.

**Example:**
```bash
# "What if I increase the transaction limit from $10K to $50K?"
galerina check --what-if "economics.max_billing_quota_per_call = 5_000_000" flows/processPayment.spore

# Compiler runs static analysis with the hypothetical constraint:
# → Checks all invariants still hold
# → Checks domain guard policy ceiling accommodates the new value
# → Reports: "SAFE — no invariants violated" or "BLOCKED — violates InvoicingDomainGuard.max_memory_ceiling"
```

**What it provides:** A mathematical "sandbox" that tells you exactly how much agility you can
safely afford before you ever modify a production file.

**Status:** `galerina check --what-if` is live as of Task #71. Parses `policy {}` files,
extracts `permitted_effects {}` and `enforced_limits {}`, scans `.spore` files for blocked
effects, reports change class (TIGHTENING / NEUTRAL), and exits 2 on violations.
DRY RUN — the policy is never applied. To apply: `cp <policy.spore> governance/ && galerina init-env`.

---

## Pattern 3 — Hierarchical Invariant Delegation

**The problem:** A global `ensure balance >= 0` is too rigid for a "Promotion Module" that
needs to temporarily create negative balances during a multi-step transaction.

**The concept:** The Penthouse sets the global ceiling; sub-components receive delegated
invariants within mathematically bounded ranges.

**Example in Galerina syntax:**

```spore
;; Root policy — global ceiling (floor 4 artifact)
policy PaymentSystemCeiling {
  permitted_effects { ledger.mutate, audit.write }
  enforced_limits   { max_memory_ceiling: 64MB }
}

;; Sub-component policy — bounded delegation
policy PromotionModuleDelegate {
  permitted_effects { ledger.mutate, audit.write }
  enforced_limits   { max_memory_ceiling: 8MB }      ;; tighter than parent
  parent_policy:    PaymentSystemCeiling              ;; must be subset of parent
}

;; Promotion flow uses the sub-policy
secure flow applyPromotion(order: Order) -> Result<Order, PromotionError>
contract [conforms_to: PromotionModuleDelegate] {
  intent { "Apply a promotional discount within the governed bounded range." }
  effects { ledger.mutate, audit.write }
  invariant {
    ensure order.discount_pct < 10;   ;; local invariant, within delegation bounds
  }
}
```

**The guarantee:** The Promotion Module can adjust its own internal logic, BUT:
- Its sub-invariant (`ensure discount < 10%`) always holds
- Its ceiling (`max_memory_ceiling: 8MB`) is always ≤ parent ceiling (`64MB`)
- Any violation still trips the hardware trap via the WAT gate
- The parent policy's `ensure balance >= 0` is globally enforced regardless of sub-module logic

**Status:** Domain Guard Policies ([conforms_to:]) are live (#56). Parent policy inheritance
and `parent_policy:` annotation are a natural extension.  
**Pending:** Task #72 (hierarchical policy inheritance with subset verification)

---

## The One Legitimate Runtime "Agility" Mechanism

The question raised in the document: *"Are there specific runtime scenarios where the system
absolutely must have the ability to 'think' while running?"*

**Yes — exactly one:** the `emergency {}` policy overlay (DRCM Phase 4).

But this is NOT discretion. It is a **pre-compiled, pre-signed, monotonically restricted
state machine**:

```spore
policy {
  emergency {
    on invariant_failure {
      deny network.outbound          ;; response: TIGHTEN
      require local_only_execution   ;; response: TIGHTEN
    }
  }
}
```

The runtime doesn't "decide" what to do when `invariant_failure` fires — it executes
a pre-approved, cryptographically governed response that was compiled into the manifest.
The V_DPM bit is cleared (monotonic — cannot be reversed). No ad-hoc discretion.

**This is agility within determinism:** the set of permitted responses is fixed at compile time,
but which response activates is determined by the runtime signal. The compiler proved the
response is safe; the runtime just executes it.

---

## Why the Tower Doesn't Break

The Governed Tower is not brittle — it is **deterministically agile**:

```
Intelligence location → Pre-deployment (Floor 3 + Floor 4)
Runtime behaviour    → Deterministic (Floor 2 + Floor 1 + Foundation)

When policy must change:
  Old model: redeploy the runtime with new logic
  New model: regenerate the manifest (minutes) → same runtime, new proof

When exceptions are needed:
  Old model: runtime if/else heuristics
  New model: delegate invariants + emergency overlay (pre-approved responses only)

When speed is needed:
  Old model: loosen the safety checks
  New model: shadow policy "What-If" analysis proves it's safe → deploy confidently
```

---

## Mapping to the Build Roadmap

| Pattern | Current status | Remaining task |
|---|---|---|
| Policy-as-Versioned-Proof | ✅ Binary CBOR `.lmanifest` live (#67) | Real ML-DSA-65 signing (Phase 5) |
| Shadow Policies | ✅ `galerina check --what-if` live (#71) | — |
| Hierarchical Delegation | ⬜ `parent_policy:` not yet built | Task #72 |
| Emergency overlay (runtime agility) | ⬜ `policy { emergency {} }` parsed, not enforced | DRCM Phase 4 (#39) |

---

## Cross-References

| Topic | Document |
|---|---|
| Domain Guard Policies (Pattern 3 foundation) | `galerina-domain-guard-policies.md` |
| CI/CD governance pipeline (Pattern 1 infrastructure) | `galerina-governance-cicd-pipeline.md` |
| .lmanifest binary CBOR (Pattern 1 artifact) | `galerina-cbor-manifest-spec.md` |
| Emergency overlay (runtime agility mechanism) | `galerina-deterministic-runtime-containment.md` |
| invariant {} static proofs (Pattern 2 foundation) | `galerina-floor3-proof-zone-graph.md` |
| Architecture charter | `architecture-charter.md` |
