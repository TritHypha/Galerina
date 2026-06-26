# Galerina — Fortified Typed Logic (Universe Stratification + Termination Proofs)

**Status: DESIGN PROPOSAL (2026-06-03)**
Universe stratification and the `decreases` annotation are new language features not yet
implemented. Taint monotonicity extends the existing `checkValueStates` checker (partially
implemented). This document records the intended design so all three guards can be built
incrementally. No source code is modified by this document.

**Auto-by-default:** The `strict` security profile (SPORE-PROFILE-002/003) already bans unbounded
recursion. The termination proof system described here would formalize "banned" into "proven safe"
— the protection is present either way. `Universe<N>` stratification is enforced by the compiler
with no annotation required for the common case; annotations are only needed at the boundary of
Universe levels (which most flows never cross). See `runtime-profiles.md` for the existing
profile system.

---

## 1. The Threats This Document Addresses

Three classes of attack target the **type system and evaluation model** rather than a specific
runtime vulnerability:

### 1.1 Girard's Paradox — Proving Void via Self-Reference

In a dependent or polymorphic type system without universe stratification, it is possible to
construct a type that contains itself as a member:

```
Type : Type  -- unsound
```

This immediately yields a proof of `Void` (Girard's Paradox), which means the type system can
be used to "prove" any statement — including statements that bypass ProofGraph verification,
forge contract attestations, or assert that a tainted value is clean. A type-level exploit
bypasses every runtime check because the runtime trusts type-checked proofs.

Galerina's ProofGraph is the architectural guarantee that governed execution was correctly
performed. If the type system can be made inconsistent, ProofGraph receipts become
unforgeable signatures over forged claims.

### 1.2 Non-Terminating Recursion — Resource Exhaustion and Halting-Problem Bypass

A flow that recurses without a decreasing bound can:
- Exhaust the WASM linear memory stack (denial of service).
- Consume unbounded compute budget, violating `economics {}` constraints that were declared
  in good faith.
- Construct an infinite proof search that hangs the ProofGraph verification pass, effectively
  defeating governance by making the verifier wait forever.

The `strict` security profile bans unbounded recursion (SPORE-PROFILE-002) but does so by
prohibition rather than by proof: the compiler rejects it because it cannot prove termination,
not because it has proven termination. This is conservative and correct, but it rules out valid
recursive algorithms that are genuinely terminating.

### 1.3 Taint Ambiguity — Security Status Lost Through Transformation

Galerina's taint system assigns `TaintType.Unverified_Raw` to any value that arrived from an
untrusted source (external HTTP, user input, AI inference output). The intent is that tainted
data must pass through a Linear Gateway Transformation before it can be used in a governed
context.

However, if taint status can be silently dropped during a type-level transformation (e.g. a
generic function that converts `Array<Unverified_Raw String>` to `Array<String>` by stripping
the taint annotation), the security guarantee is lost without any audit event. The taint system
becomes security theater.

---

## 2. Guard 1 — Universe Stratification (`Universe<N>`)

### 2.1 The Stratification Rule

Types in Galerina are organized into a **strict ascending hierarchy of universes**. A type at
level `N` can only be defined from elements at level `N-1` or lower. No type at any level may
contain itself.

```
Universe<0>  =  data primitives    (Int, Float, String, Bool, Bytes)
Universe<1>  =  structural shapes  (record types, Array<T>, Option<T>, Result<T,E>)
Universe<2>  =  governance constraints  (contract types, policy types, ProofGraph nodes)
Universe<3>  =  meta-governance    (types that describe governance policies — rarely used)
```

A self-containing type declaration is a **compile-time error**:

```galerina
// ERROR: Universe<1> type may not reference itself
type Tree = { value: Int, children: Array<Tree> }
//                                         ^^^^
// SPORE-UNIV-001: Self-referential type at Universe<1> — use an opaque handle or
//               a Universe<1> tree parameterized over a Universe<0> node type.
```

The correct encoding uses an indirection through a handle type:

```galerina
type TreeNodeId = Int                            // Universe<0>
type TreeNode = { value: Int, id: TreeNodeId }   // Universe<1>
type Tree = { nodes: Array<TreeNode>, root: TreeNodeId }  // Universe<1>
```

### 2.2 Universe Level Inference

For the common case — all types defined from primitives and standard library shapes — the
compiler infers the universe level automatically. No annotation is required. Universe levels
become explicit only when a flow parameter crosses a universe boundary, which happens exclusively
in meta-governance infrastructure (policy engines, proof verifiers) that application developers
do not author.

### 2.3 Why This Defeats Girard's Paradox

Girard's Paradox requires a type that classifies itself (`Type : Type`). Under universe
stratification, `Type` lives at some level `N` and can only be classified by types at level
`N+1`. There is no level at which a type classifies itself. The paradox cannot be constructed;
the type system remains consistent; ProofGraph receipts remain meaningful.

### 2.4 Relationship to Existing Types

The existing `type` keyword and all current Galerina structural types (`record`, `Array<T>`,
`Option<T>`, `Result<T,E>`) live at `Universe<1>`. The `contract {}` block and all policy types
live at `Universe<2>`. This mapping is not user-visible in normal programming — it becomes
relevant only when writing the type-checker itself in Galerina (Stage B self-hosting work).

---

## 3. Guard 2 — Termination Engine (`decreases` Annotation)

### 3.1 The `decreases` Keyword

A flow that recurses must supply a **decreasing metric** — a `decreases` annotation naming
an expression that the compiler proves strictly decreases on every recursive call and is bounded
below (by zero or some declared minimum).

```galerina
pure flow countdown(n: Int) -> Int
contract {
  intent { "Count down from n to zero, returning zero." }
  invariant { ensure n >= 0 }
}
decreases n
{
  if n == 0 { return 0 }
  return countdown(n - 1)
}
```

The `decreases n` annotation tells the compiler: "on each recursive call, `n` decreases by at
least one; `n >= 0` (from the `contract.invariant`) bounds it from below; therefore this
recursion terminates."

The compiler verifies:
1. The metric expression is well-typed.
2. Every recursive call site passes a value strictly less than the metric at the call site.
3. The `contract.invariant { ensure ... }` establishes the lower bound.

If any of these three conditions cannot be verified statically, the compiler emits
`SPORE-TERM-001` (unproven termination) and the flow is rejected under the `strict` profile.

### 3.2 Mutual Recursion

For mutually recursive flows, the `decreases` annotation appears on each participant and the
compiler checks the metric across the full call graph:

```galerina
pure flow isEven(n: Int) -> Bool
decreases n
{ if n == 0 { return true }  return isOdd(n - 1) }

pure flow isOdd(n: Int) -> Bool
decreases n
{ if n == 0 { return false } return isEven(n - 1) }
```

### 3.3 Relationship to `contract.invariant {}`

The `decreases` annotation is syntactic sugar that maps to a `contract.invariant {}` pattern:

```galerina
contract {
  invariant { ensure n >= 0 }   // lower bound
  // decreases n  →  compiler synthesizes: invariant { ensure n < n_at_call_site } on each call
}
```

This means termination proofs are first-class governed contract assertions — they appear in the
ProofGraph, are auditable, and can be referenced by `epilogue {}` proof receipts.

### 3.4 Relationship to `strict` Profile

The `strict` security profile currently bans unbounded recursion via SPORE-PROFILE-002 and
SPORE-PROFILE-003. With the termination engine:

- A recursive flow annotated with a valid `decreases` metric is **permitted under `strict`**.
- A recursive flow with no `decreases` annotation remains **banned under `strict`** (same as
  today — the prohibition is the fallback when proof is absent).

This upgrades the security model from "ban everything we cannot prove" to "permit what we can
prove, ban what we cannot." The `strict` profile becomes more expressive without becoming less
safe.

---

## 4. Guard 3 — Polarized Taint Monotonicity

### 4.1 The Monotonicity Rule

Taint status in Galerina is a **permanent mathematical property** of a value, not a mutable flag.
The formal rule:

> Once a value carries `TaintType.Unverified_Raw`, that taint cannot be removed by any
> type-level operation. It can only be **consumed** by a Linear Gateway Transformation
> (an SPORE-GATE-* flow), which takes the tainted value as input and produces a new,
> verified value as output. The original tainted value is consumed (cannot be used again).

This is the taint monotonicity principle: taint can only increase or be linearly consumed —
it cannot decrease or be silently dropped.

### 4.2 Current Implementation State

The `checkValueStates` function (Stage-A compiler) and the `SPORE-GATE-*` error codes implement
taint checking partially: flows that attempt to pass a `TaintType.Unverified_Raw` value to a
parameter that does not accept tainted input are flagged. See `trust-conversion-model.md` and
`trust-conversion-and-data-safety.md` for the existing model.

The gap is that **generic transformations can currently strip taint implicitly**: a function
parameterized over `T` that accepts `Unverified_Raw String` and returns `String` does not
trigger a gate check, because the taint annotation lives on the value's type in the generic
instantiation context, and the current checker does not propagate it through generic expansion.

### 4.3 The `once` Type Qualifier Extension

The monotonicity rule maps naturally to a `once` type qualifier — a linearity constraint that
ensures a tainted value is used exactly once (consumed by a gate) and cannot be aliased or
passed to additional consumers:

```galerina
// once T: this value must be consumed exactly once — cannot be aliased, cloned, or ignored
pure flow sanitize(input: once Unverified_Raw String) -> String
contract {
  intent { "Linear Gateway Transformation: consume raw input, produce verified output." }
}
{ ... }
```

The `once` qualifier is related to the linear type semantics already present in Galerina's scoped
`let` bindings (see `galerina-cpp-bridge.md` §3.1) and the `secrets {}` vault handle model
described in `galerina-design-secrets-epilogue-blocks.md`. Taint monotonicity via `once` is a
formal extension of those existing patterns into the type system.

### 4.4 Relationship to ProofGraph

Taint consumption events (a `once Unverified_Raw` value passing through an SPORE-GATE-* flow)
are recorded in the ProofGraph as first-class provenance events. The audit trail can reconstruct
the exact chain of transformations from raw input to verified output, making taint linearity
auditable in the same way that contract execution is auditable.

---

## 5. Build Order

The three guards have different implementation costs and different dependencies on each other:

| Phase | Guard | Work | Effort | Dependencies |
|-------|-------|------|--------|--------------|
| 1 | Termination | `decreases` keyword + `contract.invariant {}` block (grammar only) | Low | `secrets {}` grammar pattern |
| 2 | Termination | Static termination checker for structural recursion | Medium | Phase 1 |
| 3 | Taint | `once` qualifier + generic taint propagation in `checkValueStates` | Medium | Existing taint checker |
| 4 | Universe | Universe level tracking in type inference (AST annotation pass) | Medium | Type-checker |
| 5 | Universe | Full `Universe<N>` hierarchy enforcement (deep type-system change) | High | Phase 4 |
| 6 | Termination | General well-founded recursion (arbitrary ordinals, not just nat) | High | Phases 1–2 |

Phase 1 can begin immediately using the existing grammar extension points (`secrets {}` pattern).
Phases 4–5 are the deepest changes; they should be deferred until the Stage B self-hosting
type-checker is stable enough to express the stratification rules in Galerina itself.

---

## 6. Error Codes

| Code | Meaning |
|------|---------|
| `SPORE-UNIV-001` | Self-referential type declaration — Universe stratification violation |
| `SPORE-UNIV-002` | Type at level N references type at level > N-1 |
| `SPORE-TERM-001` | Recursive flow with no `decreases` annotation (under `strict` profile) |
| `SPORE-TERM-002` | `decreases` metric not strictly decreasing at a call site |
| `SPORE-TERM-003` | `decreases` metric lower bound not established by `contract.invariant` |
| `SPORE-TAINT-001` | Taint stripped implicitly through generic instantiation |
| `SPORE-TAINT-002` | `once` value used more than once (linearity violation) |

---

## 7. Related Documents

- `galerina-design-secrets-epilogue-blocks.md` — `once` qualifier semantics connect to vault
  handle linearity; `secrets {}` grammar pattern used for `decreases` keyword implementation
- `galerina-contract-economics.md` — `contract.invariant {}` block fits within the same
  dual-mode governance pattern as `economics {}`
- `galerina-zk-proof-plan.md` — termination proofs as first-class ProofGraph nodes, auditable
  via `epilogue { generate_proof zk_snark_receipt }`
- `trust-conversion-model.md` — existing taint model that taint monotonicity extends
- `trust-conversion-and-data-safety.md` — SPORE-GATE-* gateway transformation patterns
- `runtime-profiles.md` — `strict` profile (SPORE-PROFILE-002/003) that termination proofs
  formalize from "banned" to "proven safe"
- `security-invariants-and-policy-proof.md` — existing invariant model this integrates with
- `galerina-cross-layer-resilience.md` — Universe stratification contributes to the mathematical
  layer of the cross-layer resilience matrix
