# Galerina — Operator Type Rules

## Status

```
Phase 7B prerequisite
Source of truth for SPORE-TYPE-004 (InvalidBinaryOperation) and SPORE-TYPE-005 (InvalidUnaryOperation)
Machine-readable version: docs/Knowledge-Bases/operator-rules.schema.yaml
```

---

## Rules at a Glance

- Operators are **built-in only** in v1 — no user-defined operator overloading
- `String + String` is allowed; `String + Int` is `SPORE-TYPE-004` — use `format()` instead
- `Money<GBP> + Money<GBP>` allowed; `Money<GBP> + Money<USD>` is `SPORE-TYPE-004`
- `Tri` cannot be used as a branch condition, with `&&`/`||`, or with `!` — use `match` with all three arms
- `SecureString == x` is `SPORE-SECRET-002` — use `constantTimeEquals()` instead
- User-defined records do not support `==` by default — requires `derives Eq` (Phase 7+)
- `!` only valid on `Bool`; unary `-` only valid on numeric types

---

## Policy: Operators Are Built-In Only (v1)

Galerina v1 does **not** support user-defined operator overloading.

Operators are a fixed, compiler-defined set. No user type may define or override
the meaning of `+`, `==`, `<`, `&&`, or any other operator.

> This is an explicit design decision, not an omission.

Reason: Operator overloading introduces hidden control flow, obscures type-safety
boundaries, and makes governance and audit traces harder to read.

If a future version of Galerina adopts user-defined operators, the following must
happen first:
- A formal extension proposal in the KB
- An update to this document
- An update to `operator-rules.schema.yaml`
- Explicit governance rules for operator declarations

Until that proposal exists, any use of an operator on unsupported types emits
`SPORE-TYPE-004`.

---

## Core Operator Compatibility Table

### Arithmetic Operators (`+`, `-`, `*`, `/`, `%`)

| Operator | Left operand | Right operand | Result | Notes |
|---|---|---|---|---|
| `+` | numeric | same numeric | same numeric | No implicit widening — see widening rules |
| `-` | numeric | same numeric | same numeric | Same |
| `*` | numeric | same numeric | same numeric | Same |
| `/` | numeric | same numeric | same numeric | Integer division truncates toward zero |
| `%` | integer | integer | integer | Float modulo not permitted — use `Float.rem()` |
| `+` | `String` | `String` | `String` | String concatenation only — no implicit conversion |
| `+` | `Money<C>` | `Money<C>` | `Money<C>` | Same currency only — cross-currency is `SPORE-TYPE-004` |
| `-` | `Money<C>` | `Money<C>` | `Money<C>` | Same currency only |

**Numeric types:** `Int`, `Int8`, `Int16`, `Int32`, `Int64`, `UInt8`, `UInt16`, `UInt32`, `UInt64`, `Float`, `Float16`, `Float32`, `Float64`, `Decimal`

**Integer types (for `%`):** `Int`, `Int8`, `Int16`, `Int32`, `Int64`, `UInt8`, `UInt16`, `UInt32`, `UInt64`

### Equality Operators (`==`, `!=`)

| Operator | Left operand | Right operand | Result | Notes |
|---|---|---|---|---|
| `==` | same primitive type | same primitive type | `Bool` | Both operands must be the same type |
| `!=` | same primitive type | same primitive type | `Bool` | Same |
| `==` | `Timestamp` | `Timestamp` | `Bool` | Temporal equality |
| `!=` | `Timestamp` | `Timestamp` | `Bool` | Temporal equality |
| `==` | `SecureString` | any | — | **Denied** — use `constantTimeEquals()` |
| `!=` | `SecureString` | any | — | **Denied** — use `constantTimeEquals()` |
| `==` | `Tri` | `Tri` | `Bool` | Enum-like comparison of Tri values only |
| `!=` | `Tri` | `Tri` | `Bool` | Enum-like comparison of Tri values only |
| `==` | user-defined record | user-defined record | — | **Denied by default** — requires `derives Eq` |

**Primitive types (for equality):** `Bool`, `Int`, `Int8`..`Int64`, `UInt8`..`UInt64`, `Float`, `Float16`..`Float64`, `Decimal`, `String`, `Char`, `Byte`, `Bytes`, `Timestamp`

### Ordering Operators (`<`, `<=`, `>`, `>=`)

| Operator | Left operand | Right operand | Result | Notes |
|---|---|---|---|---|
| `<` | numeric | same numeric | `Bool` | Compatible numeric types only |
| `<=` | numeric | same numeric | `Bool` | Same |
| `>` | numeric | same numeric | `Bool` | Same |
| `>=` | numeric | same numeric | `Bool` | Same |
| `<` | `Timestamp` | `Timestamp` | `Bool` | Temporal ordering |
| `<=` | `Timestamp` | `Timestamp` | `Bool` | Temporal ordering |
| `>` | `Timestamp` | `Timestamp` | `Bool` | Temporal ordering |
| `>=` | `Timestamp` | `Timestamp` | `Bool` | Temporal ordering |
| `<` | `String` | `String` | — | **Denied** — use `String.compareTo()` |
| `<` | `Tri` | any | — | **Denied** — Tri is not ordered |

### Logical Operators (`&&`, `||`, `!`)

| Operator | Left operand | Right operand | Result | Notes |
|---|---|---|---|---|
| `&&` | `Bool` | `Bool` | `Bool` | Short-circuit: right side only evaluated if left is `true` |
| `\|\|` | `Bool` | `Bool` | `Bool` | Short-circuit: right side only evaluated if left is `false` |
| `!` | `Bool` | — | `Bool` | Unary prefix |
| `&&` | `Tri` | any | — | **Denied** — see Tri rules below |
| `\|\|` | `Tri` | any | — | **Denied** — see Tri rules below |
| `!` | `Tri` | — | — | **Denied** — use match or `Tri.not()` if defined |

---

## `Tri` Operator Rules

`Tri` is Galerina's three-valued truth type (`True`, `False`, `Unknown`).
It is **not** `Bool` and must not be treated as truthy or falsy.

> **Note on naming:** `Tri` is Galerina's three-valued logic type.
> It is not a trie (prefix-tree data structure). The names are unrelated.
> Trie runtime characteristics may appear in future standard-library data
> structures (autocomplete, string indexes, AI lookup) but have no bearing
> on `Tri` semantics.

### Allowed uses of `Tri`

```galerina
// Only form: explicit match over all three values
match decision {
  True    => allow()
  False   => deny()
  Unknown => review()
}
```

```galerina
// Equality comparison between Tri values is allowed
let same: Bool = decisionA == decisionB
```

### Denied uses of `Tri`

```galerina
// Denied: Tri as a branch condition
if decision { return allow() }       // SPORE-TYPE-004 or SPORE-SAFETY-001

// Denied: logical operators on Tri
let result = decisionA && decisionB  // SPORE-TYPE-004
let result = decisionA || decisionB  // SPORE-TYPE-004

// Denied: unary negation of Tri
let flipped = !decision              // SPORE-TYPE-004
```

### Reason

`Tri` contains genuine uncertainty (`Unknown`). Treating it as truthy or falsy
hides a governance risk — a `True` decision and an `Unknown` decision would
both pass a truthy check, which is incorrect and potentially dangerous.

Every branch on a `Tri` value must be explicit about what happens when the value
is `Unknown`.

### Future `Tri` operators (not in v1)

If Galerina later adopts Kleene-style three-valued logic (K3 / Strong Kleene Logic),
it must be defined explicitly in this document before enabling `Tri && Tri` or
`Tri || Tri`.

**Strong Kleene Logic (K3)** is a three-valued logic where `Unknown` propagates
unless the result is already determined by one operand alone:

| `AND` | True | Unknown | False |
|---|---|---|---|
| **True** | True | Unknown | False |
| **Unknown** | Unknown | Unknown | False |
| **False** | False | False | False |

| `OR` | True | Unknown | False |
|---|---|---|---|
| **True** | True | True | True |
| **Unknown** | True | Unknown | Unknown |
| **False** | True | Unknown | False |

K3 is widely used in SQL (three-valued WHERE clauses) and static analysis.
If adopted, the K3 tables above would define `Tri && Tri` and `Tri || Tri`.

**This is not in scope for Phase 7B.** The Phase 7B operator rules treat `Tri`
as match-only. K3 can be added later via a formal KB proposal.

Reference: [Three-valued logic — Wikipedia](https://en.wikipedia.org/wiki/Three-valued_logic)

---

## String Concatenation Policy

String concatenation with `+` is allowed only between two `String` values:

```galerina
let name: String = "Logic" + "N"   // OK
```

Implicit string conversion is denied:

```galerina
let value = "count: " + 42         // SPORE-TYPE-004
```

Use explicit formatting for mixed types:

```galerina
let value = format("count: {}", count)  // correct
```

---

## Money Arithmetic Policy

Same-currency arithmetic is allowed:

```galerina
Money<GBP> + Money<GBP>   // OK — result: Money<GBP>
Money<USD> - Money<USD>   // OK — result: Money<USD>
```

Cross-currency arithmetic is denied:

```galerina
Money<GBP> + Money<USD>   // SPORE-TYPE-004
```

Currency conversion is an effectful domain operation, not a silent arithmetic one:

```galerina
let usd: Money<USD> = fx.convert(gbp, USD)?  // correct explicit form
```

---

## User-Defined Record Equality Policy

Records do not have structural equality by default:

```galerina
userA == userB   // SPORE-TYPE-004 — User does not derive Eq
```

Records must explicitly derive equality to use `==`:

```galerina
type User derives Eq {
  id:    UserId
  email: Email
}

userA == userB   // OK
```

Reason: records may contain secrets, floats, handles, functions, timestamps,
unsafe fields, or values where equality is domain-specific. Silent structural
equality is unsafe by default.

Note: `derives Eq` is a Phase 7+ feature. Phase 7B defers record equality.

---

## Diagnostic: `SPORE-TYPE-004 InvalidBinaryOperation`

Emitted when a binary operator is applied to unsupported operand types.

Example:

```galerina
let x = 1 + "hello"
```

```
SPORE-TYPE-004: InvalidBinaryOperation

Operator '+' is not valid for operands:
  left:  Int
  right: String

Suggested fix: use String.format() or explicit conversion
```

---

## Diagnostic: `SPORE-TYPE-005 InvalidUnaryOperation`

Emitted when a unary operator is applied to an unsupported operand type.

Example:

```galerina
let flipped = !someIntValue
```

```
SPORE-TYPE-005: InvalidUnaryOperation

Unary operator '!' requires Bool operand.
  received: Int

Suggested fix: use a comparison: someIntValue == 0
```

---

## Legacy Compatibility Policy

Before Phase 7B enables `SPORE-TYPE-004`, existing examples should be audited
for operator usage and classified:

| Classification | Meaning |
|---|---|
| `preserve` | Valid under the operator table — no change |
| `reject-intentionally` | Previously accepted only because checking was incomplete |
| `defer` | Do not check yet — type model for these operands not finalized |

Phase 7B must not silently break existing accepted examples unless the break
is documented as intentional here.

---

## Phase 7B Minimum Scope

For Phase 7B, implement only the deterministic subset of this table:

```
numeric arithmetic (same-type)
Bool logical operators
String + String
primitive equality (same-type)
numeric ordering (same-type)
Timestamp ordering
Money same-currency arithmetic
SecureString == denial (already in value-state checker)
Tri as branch-condition denial
```

Defer to later phases:
- User-defined operator support (policy: not in v1)
- K3 Tri logic operators
- Tensor operators (requires tensor shape model)
- Record equality derivation (`derives Eq`)
- Numeric implicit widening in operator context
- Broadcasting rules
- `Decimal` + `Float` mixing rules

---

## See Also

- `docs/Knowledge-Bases/operator-rules.schema.yaml` — machine-readable version of this table
- `docs/Knowledge-Bases/operator-precedence.md` — precedence and associativity
- `docs/Knowledge-Bases/formal-type-system-spec.md` — numeric widening rules (Section 7)
- `docs/Knowledge-Bases/galerina-core-logic-tri-decision-bool.md` — Tri type design
- `docs/Knowledge-Bases/galerina-core-logic-tristate-developer-guide.md` — Tri usage guide
- `docs/Knowledge-Bases/value-state-annotations.md` — SecureString equality rules
