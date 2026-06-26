# Galerina Unified Syntax, Governance, and Target Bridge Plan

## Status

```text
Document type: Consolidated architecture + migration plan
Scope: KB consistency, TS-readable syntax proposal, Phase 13 bridge, photonic/ternary, PQ+hardware trust
Implementation baseline: Stage A runtime remains active and unchanged by this document
```

## Rules at a Glance

- Keep Galerina governance-first semantics unchanged; simplify only surface syntax where approved.
- Use one canonical syntax profile label per document: `v1-current`, `legacy`, or `proposal/vNext`.
- Standardize effects declaration policy in one place and de-duplicate contradictory guidance.
- `else if` is disallowed; use nested `if` only when necessary and prefer `match` for multi-branch logic.
- All contract components are optional; omitted sections mean no declarations for that concern.
- Return syntax support is dual-mode: `v1-current` supports `->`; `proposal/vNext` prefers `:`.
- Bridge selection (CPU/GPU/NPU/WASM/Photonic) must preserve governance/effect/audit invariants.
- Hardware trust (ML-DSA/CHERI/MTE/TEE) is an eligibility policy, not a best-effort runtime hint.

---

## 1) Consolidated Inputs

This document merges:

1. KB syntax/logic consistency findings.
2. TS-readable syntax simplification proposal details.
3. Phase 13 passive execution plans and target bridges direction.
4. Photonic/ternary bridge direction.
5. Post-quantum and hardware security profile direction (ML-DSA, CHERI, MTE, TEE).

---

## 2) High-Priority KB Inconsistencies (Confirmed)

### 2.1 `with effects` policy conflicts

Conflicting statements exist across KB docs:

- Some docs treat `with effects [...]` as canonical.
- Some treat `contract { effects {} }` as canonical and `with effects` as legacy.
- Some say both are equivalent and fully valid.
- CLI guidance indicates deprecation diagnostics for `with effects`.

**Resolution needed:** choose one canonical form and define the other as compatibility mode with explicit deprecation timeline.

---

### 2.2 Flow qualifier drift (`safe/unsafe/guard flow`)

Some docs present `safe flow`, `unsafe flow`, and `guard flow` as live syntax while others explicitly mark them invalid.

**Resolution needed:** lock active qualifiers to:

- `flow`
- `pure flow`
- `guarded flow`
- `secure flow`

Mark all `safe flow`, `unsafe flow`, `guard flow` examples as `legacy` only.

---

### 2.3 `else if` conflict

- Current formal grammar allows chained `else if`.
- Proposal guidance prefers disallowing `else if` in favor of nested `if` or `match`.

**Resolution needed:** declare whether `else if` is:

- allowed in `v1-current` and discouraged by style, or
- disallowed in `proposal/vNext` with a dedicated syntax diagnostic.

---

### 2.4 Route spec status drift

Some route docs still say parser/runtime support is pending even though route parsing/runtime artifacts now exist.

**Resolution needed:** refresh compiler status blocks and phase labels.

---

### 2.5 Grammar internal mismatch

`contract_audit` can be defined but omitted from `contract_clause` alternatives in formal grammar variants.

**Resolution needed:** ensure all declared clause productions are reachable from `contract_clause`.

---

### 2.6 Contract order drift

Canonical contract section ordering diverges between docs and grammar comments.  
`economics {}` was also missing in some references and has now been added in `galerina-contract-full-model.md`.

**Resolution needed:** publish one canonical ordered section list and reuse it everywhere.

---

## 3) Canonical Contract Section Order (Unified)

Use this as the single source for formatter/codegen documentation:

```galerina
contract {
  types {}
  intent {}
  request {}
  response {}
  context {}
  model {}
  effects {}
  economics {}
  timeouts {}
  retries {}
  limits {}
  privacy {}
  errors {}
  rules {}
  observability {}
  events {}
  audit {}
}
```

Notes:

- All sections remain optional.
- Formatter enforces order; parser accepts any order.
- `economics {}` is first-class and must not be omitted from canonical references.

---

## 4) TS-Readable Syntax Proposal (Consolidated)

This section captures the requested TypeScript-readable migration changes while preserving Galerina semantics.

### 4.1 Return type syntax

Current common form:

```galerina
flow verifyPassword(request: Request) -> VerifyPasswordResult
```

Proposal:

```galerina
flow verifyPassword(request: Request): VerifyPasswordResult
```

Migration policy:

- `v1-current`: `->` supported.
- `proposal/vNext`: `:` preferred canonical form.
- Emit legacy/deprecation diagnostic where configured.

---

### 4.2 Inline contract in flow body

Current split form:

```galerina
guarded flow verifyPassword(request: Request) -> VerifyPasswordResult
contract { effects { crypto.password.verify audit.write } }
{ ... }
```

Proposal (self-contained):

```galerina
guarded flow verifyPassword(request: Request): VerifyPasswordResult {
  contract {
    effects {
      crypto.password.verify
      audit.write
    }
  }
  ...
}
```

Parser strategy:

- Support both in transition.
- Formatter emits canonical selected profile.

---

### 4.3 Effects declaration

Canonical proposal: keep effects in contract:

```galerina
contract { effects { ... } }
```

Legacy compatibility:

```galerina
with effects [...]
```

Compatibility rule:

- Accept legacy syntax temporarily.
- Normalize to contract form in formatter/code actions.

---

### 4.4 Result aliases

Prefer top-level public aliases:

```galerina
type VerifyPasswordResult = Result<AuthSession, AuthError>
```

Use contract-local aliases for private/local flow details only.

---

### 4.5 Conditions and `else if`

Allowed style:

```galerina
if (verified) {
  return Ok(session)
} else {
  return Err(AuthError.InvalidPassword)
}
```

`else if` is disallowed.

Use:

- nested `if` only when necessary, or
- preferably `match` for multi-branch logic.

---

### 4.6 Mutation model retained

Remain explicit:

```galerina
let name: String = "Phillip"
mut attempts: Int = 0
```

No class/prototype/hidden-effect changes.

---

### 4.7 Out-of-scope constraints (must remain unchanged)

- No classes/inheritance/prototype mutation.
- No `any`.
- No hidden effects.
- No dynamic imports.
- No import/package syntax overhaul in this proposal.

---

## 5) Phase 13 Passive Plans and Target Bridges (Unified)

Pipeline:

```text
AST (checked) -> GIR -> PassiveExecutionPlan -> TargetBridgePlan -> Backend lowering
```

Bridge invariants:

1. No permission widening.
2. Effects/audit/privacy semantics unchanged across targets.
3. Deterministic mode yields deterministic target choice.
4. Unsupported ops fall back to governed path, not unchecked path.

Target set:

- CPU
- WASM
- GPU
- NPU
- Photonic

---

## 6) Photonic/Ternary Direction (Unified)

### 6.1 Tri semantics

`Tri` values:

- `True`
- `False`
- `Unknown`

No implicit `Tri` -> `Bool` coercion.

### 6.2 Core operations

- `Tri.and`
- `Tri.or`
- `Tri.not`
- exhaustive `match`

### 6.3 Photonic bridge constraints

- Photonic path is compute-only.
- Governance, authority, and audit remain on governed electronic control path.
- Lower only eligible kernels with deterministic parity checks and calibration evidence.

---

## 7) Post-Quantum and Hardware Trust Integration

### 7.1 Required policy concept

Introduce a `HardwareTrustProfile` for high-trust flows:

- Attestation algorithm policy (compat/hybrid/pq_strict with ML-DSA support).
- Memory safety requirements (`requireMTE`, `requireCHERI`).
- Enclave requirements (`requireTEE`, accepted TEE classes).

### 7.2 Enforcement

- Bridge selection must satisfy trust profile before target assignment.
- Fallback cannot silently downgrade trust guarantees.
- Proof chain includes attestation + hardware enforcement evidence.

---

## 8) TypeScript / Compiler Change Set (Consolidated)

This is the merged change set implied by the syntax and consistency plan.

### 8.1 Parser

1. Support/normalize return type syntax variants (`->` and `:` by profile).
2. Support inline `contract` blocks inside flow bodies (and split legacy form during transition).
3. Canonicalize contract clause parsing with full section coverage (including `economics` and `audit`).
4. Gate `else if` behavior by profile:
   - allowed + lint warning, or
   - syntax error in strict profile.
5. Preserve route parsing/runtime-compatible clause extraction and update status docs.

### 8.2 Type checker

1. Enforce no implicit `Tri` -> `Bool`.
2. Validate `Tri` op operands and exhaustive match requirements.
3. Keep qualifier handling (`protected`/`redacted`) as governance prefix semantics.

### 8.3 Effect checker

1. Maintain canonical effect names and alias diagnostics.
2. Ensure `fn`-inherited effects count toward parent flow declarations.
3. Keep inter-flow effect propagation deterministic.

### 8.4 Governance verifier

1. Add hardware trust profile checks:
   - required attestation algorithm presence,
   - CHERI/MTE/TEE requirement enforcement.
2. Emit governance diagnostics for trust downgrade attempts.

### 8.5 GIR / plan / bridge emitter

1. Include economics metadata in plan eligibility and routing.
2. Include `Tri`/photonic eligibility markers and proof hooks.
3. Include hardware trust requirements and resolved evidence references.

### 8.6 Runtime (Stage A remains active)

No core redesign required here by this document.  
Only enforce already-verified policy fields when available from compiled artifacts.

---

## 9) Migration Matrix

| Current | Target | Status |
|---|---|---|
| `->` return type | `:` return type | `proposal/vNext` |
| external contract block | inline `contract` in flow body | `proposal/vNext` |
| `with effects [...]` | `contract { effects {} }` | transition/legacy compatibility |
| contract-local public result aliases | top-level public `type` alias | recommended |
| `else if` | nested `if` or `match` | disallowed (`match` preferred) |
| mixed contract ordering | canonical unified ordering (includes `economics`) | must normalize |

---

## 10) KB Cleanup Execution Plan

1. Label every syntax doc with one profile tag:
   - `v1-current`
   - `legacy`
   - `proposal/vNext`
2. Fix formal grammar contradictions first.
3. Bulk-lint KB examples for invalid qualifiers and mixed return styles.
4. Refresh stale status blocks (route/parser/runtime).
5. Publish a single syntax policy doc for generators/AI tools.

---

## 11) Immediate Patch Targets (Top 6)

1. `galerina-grammar.ebnf`
   - ensure all contract clause productions are reachable (`audit`, `economics`, etc.).
   - resolve `else if` policy and effects canonical text.
2. `galerina-contract-full-model.md`
   - keep `economics` and canonical order aligned with grammar.
3. `galerina-cli-current.md`
   - align deprecation policy text with grammar/formatter policy.
4. `galerina-lexer-optimizations.md`
   - align canonical effects syntax statement with chosen policy.
5. `route-spec.md`
   - update compiler status to reflect implemented parser/runtime artifacts.
6. `galerina-core-intent-safety-effects.md`
   - mark `safe flow`/`unsafe flow` examples as legacy only (or remove).

---

## 12) AI/Tooling Benefits

This consolidation reduces:

- syntax fragmentation,
- contradictory guidance,
- invalid code generation in examples,
- parser/checker ambiguity in contributions.

It improves:

- deterministic source-to-GIR mapping,
- migration planning visibility,
- automated lint/formatter policy enforcement.

---

## See Also

- `docs/Knowledge-Bases/galerina-contract-full-model.md`
- `docs/Knowledge-Bases/galerina-grammar.ebnf`
- `docs/Knowledge-Bases/galerina-cli-current.md`
- `docs/Knowledge-Bases/galerina-lexer-optimizations.md`
- `docs/Knowledge-Bases/route-spec.md`
- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `docs/Knowledge-Bases/compiler-diagnostics.md`
