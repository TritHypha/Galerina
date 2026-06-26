# Galerina Canonical Example Corpus (CEC)

> **✍️ Writing or AI-generating contracts? Follow the [Contract Authoring Guide](../Knowledge-Bases/galerina-contract-authoring-guide.md).**
> `types` / `request` / `response` are **not** globally mandatory — omit on pure/internal flows
> (only API/route flows need `request`/`response`). `effects` is **deny-by-default** (omitted ⇒
> strictly pure). An AI may only **propose** widening `authority` / `effects` / `secrets`, never
> apply it (propose → compiler-verify → policy → human-approve). Intent strings must be
> descriptive prose only (no logic/URLs/variables).

## Status

```
215 .spore examples across 9 levels + proposed readable logic forms
Phase 9 + Phase 10 complete
All examples use: readonly request: Request (not req)
All flows with contracts use named result types: -> FlowNameResult
Diagnostics: SPORE-TYPE-003, SPORE-EVENT-001/002, SPORE-GOV-003/011/012, SPORE-CONTEXT-001, Readable Logic Forms
Signed Attestation (Ed25519), 16-section contract model, naming conventions
```

## Purpose

The CEC teaches Galerina syntax and semantics to humans and AI in a structured,
progressive order. It is the primary learning resource for AI code generation
and developer onboarding.

Grammar → Examples → Compiler.

## Learning Order

AI learns trust boundaries before types. The corpus is ordered accordingly:

```
Level 1 — Basics        (001–020)   ← flow qualifiers, bindings, fn, match
Level 4 — Security      (151–175)   ← unsafe→protected→redacted→audit
Level 3 — Effects       (101–120)   ← pure/guarded/secure, effect rules, SPORE-EFFECT-*
Level 2 — Types         (051–087)   ← domain types, Money, Tensor, Option, Result
Level 5 — Governance    (201–213)   ← intent, policy, proof, compute target
Level 6 — Compute       (301–317)   ← tensor types, compute targets, Money/Decimal
Level 7 — AI            (351–367)   ← AI inference flows, effects, PII, governance
Level 8 — Targets       (401–416)   ← CPU/GPU/NPU/photonic/quantum targets
Level 9 — Enterprise    (451–467)   ← healthcare, financial, compliance, authority
```

## Example Format

Every example folder contains:

```
NNN-example-name/
  example.spore              ← Galerina source with /// header
  expected.diagnostics.txt ← "none" or SPORE-CODE + message (exact implemented codes)
  notes.md                 ← concept + AI rule explanation
```

### Header Format

```galerina
/// example: NNN-example-name
/// level: N
/// concept: description
/// expected_diagnostics: none | SPORE-TYPE-001 | SPORE-VALUESTATE-003 | ...
/// ai_rule: One-sentence rule for AI code generators.
```

## Complete Implemented Diagnostic Reference

### Type checker (Phase 8A/8B/9A-2)

| Code | Meaning | Status |
|---|---|---|
| `SPORE-TYPE-001` | Unknown type — not in scope | ✅ Implemented |
| `SPORE-TYPE-002` | Type mismatch — incompatible assignment | ✅ Implemented |
| `SPORE-TYPE-003` | Nominal type conversion denied — `unsafe let id: CustomerId = raw` rejected | ✅ Phase 9A-2 |
| `SPORE-TYPE-004` | Invalid binary operation — wrong operand types or cross-currency Money | ✅ Implemented |
| `SPORE-TYPE-006` | Wrong argument type for flow call | ✅ Implemented |
| `SPORE-TYPE-007` | Wrong argument count for flow call | ✅ Implemented |
| `SPORE-TYPE-008` | Return type mismatch / null-undefined denied | ✅ Implemented |
| `SPORE-TYPE-009` | Generic arity mismatch (Option expects 1, Result expects 2) | ✅ Implemented |
| `SPORE-TYPE-020` | Binding shadows outer-scope name (warning) | ✅ Implemented |
| `SPORE-TYPE-021` | Non-exhaustive match | ✅ Implemented |
| `SPORE-TYPE-022` | Unreachable pattern (arm after wildcard `_`) | ✅ Implemented |

### Name resolver

| Code | Meaning | Status |
|---|---|---|
| `SPORE-NAME-001` | Undeclared name in expression position | ✅ Implemented |
| `SPORE-NAME-002` | Duplicate name in same scope | ✅ Implemented |

### Value-state checker

| Code | Meaning | Status |
|---|---|---|
| `SPORE-VALUESTATE-001` | `safe mut` requires a recognised gate function | ✅ Implemented |
| `SPORE-VALUESTATE-003` | Unsafe binding at governed sink | ✅ Implemented |
| `SPORE-VALUESTATE-004` | Tainted value — string concat includes unsafe binding | ✅ Implemented |

### Secret / SecureString

| Code | Meaning | Status |
|---|---|---|
| `SPORE-SECRET-001` | SecureString passed to log function | ✅ Implemented |
| `SPORE-SECRET-002` | SecureString compared with == or != | ✅ Implemented |
| `SPORE-SECRET-003` | SecureString passed to serialization (json.encode) | ✅ Implemented |

### Effect checker

| Code | Meaning | Status |
|---|---|---|
| `SPORE-EFFECT-001` | Effect used but not declared | ✅ Implemented |
| `SPORE-EFFECT-002` | Transitive effect not declared (callee has effect, caller doesn't) | ✅ Implemented |
| `SPORE-EFFECT-003` | pure flow cannot call effectful flow / use effectful op | ✅ Implemented |
| `SPORE-EFFECT-004` | Non-canonical effect name (use `network.outbound` not `network`) | ✅ Implemented |

### Governance verifier

| Code | Meaning | Status |
|---|---|---|
| `SPORE-GOV-001` | Intent/behaviour mismatch (intent says "local", declares network) | ✅ Implemented |
| `SPORE-GOV-002` | Governed sink without audit evidence | ✅ Implemented |
| `SPORE-GOV-004` | Denied target selected (deny [remote.execution] + network.outbound) | ✅ Implemented |
| `SPORE-GOV-010` | secure flow without intent declaration | ✅ Implemented |
| `SPORE-GOV-011` | `use SetName` in flow contract references an undeclared contract set | ✅ Phase 9B |
| `SPORE-GOV-012` | Contract set has audit requirements; flow does not declare `audit.write` | ✅ Phase 9B |
| `SPORE-HINT-COMPUTE-001` | ai.inference without compute target preference (info hint) | ✅ Implemented |
| `SPORE-GOV-003` | `response.denies` field appears in response body | ✅ Phase 10C |
| `SPORE-CONTEXT-001` | `context.require X` declared but field never accessed in body (warning) | ✅ Phase 10C |
| `SPORE-GOV-005` | Policy purpose/behaviour mismatch | Phase 11 |

### Event checker (Phase 9B)

| Code | Meaning | Status |
|---|---|---|
| `SPORE-EVENT-001` | `emit X` in a flow body without a top-level `event X` declaration | ✅ Phase 9B |
| `SPORE-EVENT-002` | `event X` declared globally but never emitted anywhere (warning) | ✅ Phase 9B |

### Readable Logic Forms (Phase 9C)

Readable forms are aliases that lower to canonical operators immediately in the parser.
Same AST, same GIR, same execution — readability improvement only.

| Readable form | Canonical op | Status |
|---|---|---|
| `a and b` | `a && b` | ✅ Phase 9C |
| `a or b` | `a \|\| b` | ✅ Phase 9C |
| `unless COND { }` | `if !COND { }` | ✅ Phase 9C |
| `a is b` | `a == b` | ✅ Phase 9C |
| `a is not b` | `a != b` | ✅ Phase 9C |
| `a is greater than b` | `a > b` | ✅ Phase 9C |
| `a is less than b` | `a < b` | ✅ Phase 9C |
| `a is greater than or equal to b` | `a >= b` | ✅ Phase 9C |
| `a is less than or equal to b` | `a <= b` | ✅ Phase 9C |
| `a is not greater than b` | `a <= b` | ✅ Phase 9C |
| `a is not less than b` | `a >= b` | ✅ Phase 9C |
| `a is equal to b` | `a == b` | ✅ Phase 9C |
| `a is not equal to b` | `a != b` | ✅ Phase 9C |

All forms set `readableForm` on the AST node for IDE/formatter preservation.

### Syntax

| Code | Meaning | Status |
|---|---|---|
| `SPORE-SYNTAX-003` | Future-reserved keyword used as identifier | ✅ Implemented |
| `SPORE-SYNTAX-005` | Top-level `fn` declaration (must be inside flow body) | ✅ Implemented |
| `SPORE-SYNTAX-006` | Top-level `let` binding (must be inside a flow) | ✅ Implemented |
| `SPORE-SYNTAX-007` | Top-level `mut` binding (mutable state must be flow-local) | ✅ Implemented |
| `SPORE-SYNTAX-008` | Top-level `unsafe let` (boundary data must be owned by a secure flow) | ✅ Implemented |
| `SPORE-SYNTAX-009` | Top-level `emit` (events may only be emitted inside flows) | ✅ Implemented |
| `SPORE-SEC-014` | fn declares effects or authority (forbidden) | ✅ Implemented |

---

## Canonical Pattern (most important example in the corpus)

```galerina
unsafe let rawEmail: String =
  request.body.email

let email: protected Email =
  validate.email(rawEmail)?

let auditEmail: redacted Email =
  redact(email)

AuditLog.write({
  email: auditEmail
})
```

```
Unsafe → Protected → Redacted → Audit
```

---

## Flow Qualifier Rules

| Qualifier | When to use |
|---|---|
| `pure flow` | No effects, deterministic computation only |
| `guarded flow` | Has declared effects, use `with effects [...]` |
| `secure flow` | External trust boundary (HTTP, API input), use `with effects [...]` |
| `fn` | Local tidy helper inside a flow body — no effects, no authority |
| `route` | Exposes a flow to external callers |

## Effects Syntax

Both forms are accepted by the parser:

```galerina
guarded flow f() -> R
  with effects [database.write]   ← preferred in Level 3+ examples
{ }

guarded flow f() -> R
  effects [database.write]        ← also valid (older form)
{ }
```

## Negative Examples

Each level now includes negative examples (invalid syntax with expected diagnostics).
These are critical for AI learning — they teach what the compiler rejects, not just
what it accepts.

Negative examples are identified by their name:
- Names ending in `-invalid`, `-missing`, `-denied`, `-wrong` contain invalid Galerina
- `expected.diagnostics.txt` contains the exact SPORE-CODE that fires

---

## See Also

- `docs/Knowledge-Bases/galerina-glossary.md` — canonical term definitions
- `docs/Knowledge-Bases/formal-type-system-spec.md` — type rules
- `docs/Knowledge-Bases/value-state-annotations.md` — unsafe/protected/redacted rules
- `docs/Knowledge-Bases/operator-type-rules.md` — operator compatibility (Money cross-currency)
- `docs/Knowledge-Bases/stdlib-gates.yaml` — gate and sink registry
- `docs/Knowledge-Bases/schemas/diagnostics/` — machine-readable diagnostic schemas
- `docs/Knowledge-Bases/galerina-language-lessons.md` — why/risk fields on diagnostics
