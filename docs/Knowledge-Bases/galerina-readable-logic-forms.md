# Galerina Language Proposal — Readable Logic Forms

## Status

```
Phase 9C — Implemented
Keywords: and, or, unless, is — active in v1
All operator aliases produce canonical AST (same as traditional operators)
readableForm? field set on nodes for IDE/formatter preservation
Pilot examples: docs/Examples/Level-1-Basics/ (readable-logic folder)
```

## Design Decisions (Recorded)

**Decision 1 — Canonical lowering for `is not greater than`:**
```text
a is not greater than b  →  a <= b
```
Reason: clearest canonical lowering. Do not preserve as `!(a > b)` — unnecessary AST complexity.

**Decision 2 — AST style preservation via `readableForm?`:**
Add optional field to relevant AST nodes:
```typescript
readableForm?: string  // stores original phrase e.g. "is greater than"
```
Applies to: `binaryExpr`, `ifStmt`, `whileStmt`
Reason: compiler semantics use the canonical operator; formatter/docs/IDE preserve readable style.

**Decision 3 — Pilot first, adopt second:**
```text
Create 10 examples.
Test with AI generators and human readers.
Adopt only if comprehension measurably improves.
Do not implement broadly until pilot results are in.
```

## TL;DR
- Optional natural-language aliases for operators: `is greater than` → `>`, `and` → `&&`, `or` → `||`
- Same AST as existing syntax — aliases produce identical tokens, type-check, GIR, and audit proof
- Readability improvement only — no new semantics, no new runtime behaviour

---

## Core Principle

This proposal does **not** remove or replace:

```text
== != > < >= <= && || !
```

Instead:

```galerina
if amount > limit
```

and:

```galerina
if amount is greater than limit
```

produce the **same AST**, the **same GIR**, the **same execution**, and the **same audit proof**.

Readable Logic Forms are an **explanation layer**, not a replacement.

---

## Motivation

Galerina is explicitly AI-first and governance-first. Readability matters for:
- Human developers during onboarding
- AI code generation (natural language is closer to training data)
- Audit reports (governance-level descriptions)
- Security reviews (plain-English policy conditions)

---

## Proposed Operator Aliases

### Equality

| Traditional | Readable |
|---|---|
| `status == Active` | `status is Active` |
| `status != Active` | `status is not Active` |

### Numeric Comparisons

| Traditional | Readable |
|---|---|
| `amount > limit` | `amount is greater than limit` |
| `amount >= limit` | `amount is greater than or equal to limit` |
| `amount < limit` | `amount is less than limit` |
| `amount <= limit` | `amount is less than or equal to limit` |

### Boolean Logic

| Traditional | Readable |
|---|---|
| `!isActive` | `isActive is not true` |
| `isActive && isVerified` | `isActive and isVerified` |
| `isAdmin \|\| isOwner` | `isAdmin or isOwner` |
| `if !condition { ... }` | `unless condition { ... }` |

### Loop Forms

| Traditional | Readable |
|---|---|
| `while count < 20` | `while count is less than 20` |
| `do { } while count <= 20` | `do { } until count is greater than 20` |

### Mixed Style (must remain valid)

```galerina
if amount > 10 and status is Active {
  ...
}
```

Mixing traditional operators with readable forms in the same expression must be valid.

---

## Governance Examples

Readable forms are especially valuable in governance contexts where conditions
must be understandable to auditors and non-developers.

```galerina
// Traditional
if amount >= approvalLimit && status == Approved

// Readable
if amount is greater than or equal to approvalLimit and status is Approved
```

---

## Design Rules

**Rule 1 — One canonical readable form per concept**

Bad:
```text
is not equal to / isn't / does not equal / not equal
```

Good:
```text
is not (single canonical form)
```

**Rule 2 — Immediate lowering to canonical operators**

Readable forms must lower to canonical operators immediately in the parser.
They must not reach the type checker or GIR emitter as a distinct construct.

**Rule 3 — Same AST, same everything**

`is greater than` → `>` in the AST.
All subsequent passes see only `>`.

**Rule 4 — Mixed style allowed**

Traditional and readable operators may be mixed in the same expression.

---

## Proposed Diagnostic Family

Because readable forms are aliases, they need their own diagnostic family for
unknown or ambiguous readable expressions.

Suggested prefix: `SPORE-READABLE-*`

### SPORE-READABLE-001 — Unknown readable operator

```galerina
if amount is massively greater than limit   // SPORE-READABLE-001
```

```text
Unknown readable comparison.
Try: amount is greater than limit
```

### SPORE-READABLE-002 — Ambiguous readable expression

```galerina
if amount is not greater than less than limit   // SPORE-READABLE-002
```

```text
Ambiguous readable expression.
Use a canonical comparison operator.
```

---

## Canonical Example Corpus Requirements

If adopted, add examples across all CEC levels. Each example should include:
- Valid readable form
- Equivalent traditional form
- Expected diagnostic for invalid readable syntax

```text
Level-1-Basics:
  010-readable-equality
  011-readable-inequality

Level-2-Types:
  020-enum-is-active

Level-3-Effects:
  030-readable-guards

Level-4-Security:
  040-protected-value-checks

Level-5-Governance:
  050-approval-thresholds

Level-6-Compute:
  060-readable-compute-selection

Level-7-AI:
  070-readable-ai-routing

Level-8-Targets:
  080-target-is-photonic

Level-9-Enterprise:
  090-policy-is-approved
```

---

## Implementation Notes (for when adopted)

### Keyword namespace

These words must be reserved before implementation begins to prevent them
being used as identifiers in existing code:

| Word | Role | Reserve as |
|---|---|---|
| `is` | Core pivot of all readable comparisons | Future-reserved |
| `and` | Alternative to `&&` | Future-reserved |
| `or` | Alternative to `\|\|` | Future-reserved |
| `unless` | Alternative to `if !` | Future-reserved |
| `until` | Alternative to `do while !` | Future-reserved |

Words **not** reserved: `greater`, `less`, `than`, `equal` — these would be
parsed as contextual identifiers after `is`, not as independent keywords.

### Parser design

The `is` token would be a special infix operator handled outside the Pratt table.
When the parser sees `is` after an expression, it reads the tail:

```text
'is' 'not'? ('Active' | 'true' | 'false' | comparable_tail)

comparable_tail:
  'greater' 'than' expr
  'greater' 'than' 'or' 'equal' 'to' expr
  'less' 'than' expr
  'less' 'than' 'or' 'equal' 'to' expr
```

This is a context-sensitive parse requiring lookahead — handled inside the
existing `parsePostfix()` method, not in the Pratt table.

### Formatter rule

The formatter should preserve the author's chosen style — if they wrote
`is greater than`, the formatter outputs `is greater than`. It does not
normalise readable forms to traditional operators or vice versa.

---

## What Readable Logic Forms Do Not Apply To

- Response constructors (`Response.ok(data)`) — already readable
- Effect declarations (`effects [database.write]`) — already readable
- Type annotations (`let email: protected Email`) — already readable
- Gate calls (`validate.email(rawEmail)`) — already readable
- Audit records (`AuditLog.write({ event: "..." })`) — already readable

Readable Logic Forms target **condition expressions** only.

---

## The Guiding Principle

> Readable Logic Forms explain logic. They do not change logic.

---

## Next Steps (if proposal progresses)

1. Run a pilot with 10 developers — ask which forms feel natural
2. Run a pilot with 3 AI code generators — test whether readable forms
   improve generated code quality
3. Build a small example corpus (5-10 examples) and test parser feasibility
4. Decision gate: adopt, refine, or close

---

## See Also

- `docs/Knowledge-Bases/galerina-glossary.md` — canonical term definitions
- `docs/Knowledge-Bases/operator-precedence.md` — operator table
- `docs/Knowledge-Bases/galerina-grammar.ebnf` — formal grammar (does not yet include readable forms)
- `docs/Knowledge-Bases/galerina-language-lessons.md` — lessons from other languages
