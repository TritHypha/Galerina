# Galerina — Value-State Checker

## Status

```
Phase 5 prerequisite
Runs after the type checker, before the effect checker
```

This document defines the value-state checker — the compiler pass that
enforces the semantic rules on value-state annotations. It is a **separate
pass** from the type checker and runs after type inference is complete.

---

## 1. Role in the Pipeline

```text
source
    ↓
lexer
    ↓
parser
    ↓
AST
    ↓
symbol resolution
    ↓
type checker        ← verifies type correctness
    ↓
value-state checker ← THIS PASS — enforces state transition rules
    ↓
effect checker
    ↓
governance verifier
    ↓
IR generation
```

The value-state checker receives the type-annotated AST from the type checker.
It does not change types — it only reads and validates value-state annotations.

---

## 2. What Value States Are

Safety prefixes appear **before the binding keyword**:

```galerina
unsafe let rawEmail: String = form.email           // boundary-origin: blocked from sinks
safe   mut rawEmail         = validate.email(rawEmail)?  // upgraded after gate
```

The prefix (`unsafe` / `safe`) is a property of the **binding**, not the type.
A `String` is always a `String` — the prefix says whether the current value
came from a trusted source.

Full grammar and vocabulary: `docs/Knowledge-Bases/value-state-annotations.md`

---

## 3. Safety Prefix Vocabulary

### Safety prefix (before the binding keyword)

| Prefix | Applies to | Meaning |
|---|---|---|
| `unsafe let` | New immutable binding | Value is boundary-origin; blocked from governed sinks |
| `unsafe mut` | New mutable binding | Mutable boundary-origin value (e.g. buffer being filled) |
| `safe mut` | Existing `unsafe` binding | Upgrades the binding to safe after a validation/decode gate |
| `safe let` | New binding | Explicitly safe (rarely needed; `let` without prefix is safe by default) |
| (none) + `let` | New binding | Internally constructed; safe by default |
| (none) + `mut` | New mutable binding | Internally constructed; safe by default |
| `readonly` | New binding | Immutable after initialisation; safe by default |

### What `safe mut` does

`safe mut name = gate(name)?` is the **upgrade statement**. It:
1. Calls the gate function on the current (unsafe) value
2. On success — rebinds `name` as safe; downstream code may pass it to governed sinks
3. On failure — propagates the error via `?`; the unsafe value never escapes

```galerina
unsafe let rawEmail: String = form.email
safe   mut rawEmail         = validate.email(rawEmail)?
// rawEmail is now safe — may be passed to database.write
```

---

## 4. The Five Core Rules

### Rule 1 — `unsafe` bindings cannot reach governed sinks directly

```galerina
unsafe let rawInput: String = request.body
Database.insert(rawInput)   // SPORE-VALUESTATE-003 — unsafe binding at governed sink
```

An `unsafe let` or `unsafe mut` binding cannot be passed directly to:
- `database.*` effects
- `audit.write` effects
- `network.outbound` (external calls)
- Any call declared as a governed sink

**Fix**: use `safe mut` with a gate first.

### Rule 2 — `safe mut` requires a recognised gate function

```galerina
// Invalid:
safe mut rawEmail = rawEmail         // no gate — SPORE-VALUESTATE-001
```

The right side of `safe mut` must be a call to a recognised gate function (see
Section 5). The compiler verifies the gate was called and the `?` propagation
is present (gate failure must propagate, not be swallowed).

Diagnostic: `SPORE-VALUESTATE-001` (`UnsafeToSafeTransitionDenied`)

### Rule 3 — Taint propagates through expressions

```galerina
unsafe let rawInput: String = request.body
let sql = "SELECT " + rawInput   // sql is now tainted — SPORE-VALUESTATE-004
Database.query(sql)              // SPORE-VALUESTATE-003
```

When any operand in a binary expression is an `unsafe` binding, the result is
tainted. This propagates through string concatenation, member access, and
function arguments.

Diagnostic: `SPORE-VALUESTATE-004` (`TaintedValuePropagation`)

### Rule 4 — `SecureString` bindings block restricted operations

```galerina
let apiKey: SecureString = SecretsStore.get("key")

// All of the following are illegal:
apiKey == expected       // SPORE-SECRET-002
log.write(apiKey)        // SPORE-SECRET-001
serialize(apiKey)        // SPORE-SECRET-003
let plain: String = apiKey  // SPORE-SECRET-003
```

Approved operations:
- `constantTimeEquals(apiKey, expected)` — constant-time comparison
- `redact(apiKey)` — produces a safe log placeholder
- Pass to a flow that explicitly accepts `SecureString`

Diagnostics: `SPORE-SECRET-001..003`

### Rule 5 — `let` and `readonly` bindings cannot be reassigned

```galerina
let count: Int = 0
count = 1   // SPORE-BINDING-001 — let binding is immutable

readonly config: AppConfig = loadConfig()
config = newConfig   // SPORE-BINDING-002 — readonly binding cannot be mutated
```

Note: `safe mut` is the one permitted "reassignment" of a `let` binding —
specifically to upgrade an `unsafe let` to safe. It is a controlled exception
to the immutability rule, not a general rebinding.

---

## 5. Gate Functions

A gate function is the right-hand side of a `safe mut` upgrade. It takes an
`unsafe` binding, validates or decodes it, and returns a safe value. The `?`
operator is required — gate failures must propagate, not be swallowed.

```galerina
unsafe let raw: String = form.email
safe   mut raw = validate.email(raw)?   // gate call + ? required
```

| Gate | Typical use |
|---|---|
| `validate.email(raw)` | Validate email format; returns `Email` |
| `validate.uuid(raw)` | Validate UUID format; returns `Uuid` |
| `validate.url(raw)` | Validate URL format; returns `Url` |
| `json.decode<T>(raw)` | Decode JSON bytes; returns `T` |
| `toml.decode<T>(raw)` | Decode TOML string; returns `T` |
| `sanitize.text(raw)` | Sanitise for display; returns `String` |
| `parse.int(raw)` | Parse integer string; returns `Int` |
| `constantTimeEquals(a, b)` | Compare two `SecureString` values; returns `Bool` |

Custom gate functions use the `@gate` annotation:

```galerina
@gate
pure flow parseOrderId(raw: String) -> ParseOrderIdResult
contract {
  types {
    type ParseOrderIdResult = Result<OrderId, ValidationError>
  }
}
{
  ...
}
```

Usage:

```galerina
unsafe let rawId: String = request.params.id
safe   mut rawId = parseOrderId(rawId)?
```

---

## 6. Full Flow Example

```galerina
secure flow createCustomer(request: CreateCustomerRequest)
  -> CreateCustomerResult
contract {
  types {
    type CreateCustomerResult = Result<ApiResponse<Customer>, ApiError>
  }
  effects {
    database.write
    audit.write
  }
}
{

  // Boundary data — declared unsafe at entry point
  unsafe let rawEmail: String = request.email

  // Gate function: upgrades rawEmail to safe in-place
  // Fails with Err(ValidationError) if email format is invalid
  safe mut rawEmail = validate.email(rawEmail)?

  // rawEmail is now safe — may reach the governed database.write sink
  let customer: Customer = CustomersDB.insert({ email: rawEmail })?

  AuditLog.write({ event: "CustomerCreated" })

  return Ok(ApiResponse.created(customer))
}
```

Value-state checker reasoning:

```text
✓ rawEmail declared with unsafe let — correctly marked as boundary data
✓ validate.email() is a recognised gate — safe mut transition approved
✓ rawEmail is now safe — may reach database.write
✓ no unsafe bindings reach governed sinks
✓ no SecureString operations violated
```

---

## 7. Diagnostics (SPORE-VALUESTATE-* and SPORE-SECRET-* series)

### SPORE-VALUESTATE-* series

| Code | Name | Description |
|---|---|---|
| `SPORE-VALUESTATE-001` | `UnsafeToSafeTransitionDenied` | Value cannot become `safe validated` without a recognised gate function |
| `SPORE-VALUESTATE-002` | `UnvalidatedValueUsed` | `unvalidated` value used where `validated` is required |
| `SPORE-VALUESTATE-003` | `UnsafeValueReachedGovernedSink` | `unsafe` or `unvalidated` value passed to a governed sink |
| `SPORE-VALUESTATE-004` | `TaintedValuePropagation` | Expression result is tainted by an `unsafe` operand |
| `SPORE-VALUESTATE-005` | `InvalidValueStateTransition` | Value-state transition is not permitted by the state machine |

### SPORE-SECRET-* series

| Code | Name | Description |
|---|---|---|
| `SPORE-SECRET-001` | `SecretValueLogged` | `secret protected` value passed to a logging function |
| `SPORE-SECRET-002` | `SecretComparisonDenied` | `==` operator used on a `secret protected` value; use `constantTimeEquals()` |
| `SPORE-SECRET-003` | `SecretSerializationDenied` | `secret protected` value serialised or converted to plain `String` |

---

## 8. State Machine for Value States

Valid transitions (one-way unless noted):

```
unsafe unvalidated
    ↓ (via gate function)
safe validated

unsafe unvalidated + expression operand
    ↓
unsafe tainted

unsafe / tainted
    ✗ cannot reach governed sink directly
```

There is no implicit transition back from `unsafe` to `safe`. Once a value
is `tainted`, it must be re-validated from scratch.

---

## 9. Interaction with Other Checkers

| Checker | Relationship |
|---|---|
| Type checker | Runs first; value-state checker reads the type-annotated AST |
| Effect checker | Governed sinks (which the value-state checker guards) have corresponding effects (`database.write`) |
| Governance verifier | The governance verifier uses value-state evidence to build the audit proof |
| Operator precedence | Taint propagation follows the same binary expression tree the precedence table produces |

---

## 10. Audit Proof Integration

The value-state checker emits evidence for the audit proof:

```yaml
valueStateAudit:
  transitions:
    - from:
        type:   String
        states: [unsafe, unvalidated]
      via:    validate.email
      to:
        type:   Email
        states: [safe, validated]

  governedSinkAccess:
    - sink:    database.write
      value:   email
      states:  [safe, validated]
      result:  PERMITTED

  violations: none
```

---

## 11. v1 Implementation Scope

Phase 5 implements:
- Parsing and storing value-state annotations on `bindingDecl` AST nodes
- `SPORE-VALUESTATE-003`: detecting `unsafe unvalidated` values that reach
  governed sinks (requires knowing which calls are governed sinks — use the
  effect checker's `database.write` / `audit.write` markers)
- `SPORE-SECRET-001..003`: protecting `secret protected` values

Phase 5 defers:
- Full taint tracking through arbitrary expression trees
- Custom `@gate` annotations
- Reactive state interaction

---

## See Also

- `docs/Knowledge-Bases/value-state-annotations.md` — EBNF grammar, full vocabulary
- `docs/Knowledge-Bases/formal-type-system-spec.md` — type system foundation
- `docs/Knowledge-Bases/operator-precedence.md` — taint propagation through expressions
- `docs/Knowledge-Bases/compiler-diagnostics.md` — full diagnostic code registry
