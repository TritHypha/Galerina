# Galerina — Formal Type System Specification

## Status

```
Phase 5 prerequisite
Source of truth for the type checker
```

This document defines the Galerina v1 type system used by the parser, AST,
type checker, diagnostic engine, schema generator, and later compiler phases.

---

## Rules at a Glance

- `Auto` is an inference marker — never emit `SPORE-TYPE-001` for it; defer to the inference pass
- `Tensor<T, Shape>` has arity 2 — bare `Tensor` emits `SPORE-TYPE-009`; use `AnyTensor` for erased form
- `Money<C>` arithmetic requires the same currency `C` — cross-currency is `SPORE-TYPE-004`
- `SecureString` cannot use `==`, `!=`, or appear in log calls — see SPORE-SECRET-001/002
- `Option<T>` arity 1 · `Result<T,E>` arity 2 · `Map<K,V>` arity 2 · `Brand<T,Name>` arity 2
- `null` and `undefined` are not in the language — any occurrence emits `SPORE-TYPE-008`
- Only `Bool` may appear as an `if`/`while` condition — `Tri` and all other types are errors

---

## TL;DR
- `Auto` defers to inference — never emit SPORE-TYPE-001 for it
- `Tensor<T, Shape>` has arity 2 — bare `Tensor` emits SPORE-TYPE-009
- `protected` / `redacted` are governance qualifiers, not type names — strip before lookup

---

## 1. Type Categories

Galerina types are divided into:

```
Primitive
Numeric
Text
Boolean
Temporal
Binary
JSON
Collection
Algebraic
Domain
Capability-sensitive
User-defined
```

---

## 2. Built-in Types

### Primitive / scalar

| Type | Description |
|---|---|
| `Bool` | Boolean: `true` or `false` |
| `Char` | A single Unicode scalar value |
| `Void` | Absence of a meaningful return value |

### Numeric

| Type | Description |
|---|---|
| `Int` | Platform integer (default, at least 64-bit) |
| `Int8` | Signed 8-bit integer |
| `Int16` | Signed 16-bit integer |
| `Int32` | Signed 32-bit integer |
| `Int64` | Signed 64-bit integer |
| `UInt8` | Unsigned 8-bit integer |
| `UInt16` | Unsigned 16-bit integer |
| `UInt32` | Unsigned 32-bit integer |
| `UInt64` | Unsigned 64-bit integer |
| `Float` | Platform float (default, at least 64-bit) |
| `Float16` | 16-bit floating-point |
| `Float32` | 32-bit floating-point |
| `Float64` | 64-bit floating-point |
| `Decimal` | Exact decimal arithmetic (financial use) |

### Text

| Type | Description |
|---|---|
| `String` | UTF-8 string |
| `SecureString` | Sensitive string; restricted operations — see Rule 12 |

### Temporal

| Type | Description |
|---|---|
| `Timestamp` | UTC timestamp with sub-second precision |
| `Duration` | A time span |

### Binary

| Type | Description |
|---|---|
| `Byte` | Single unsigned 8-bit raw value (alias for `UInt8` in binary context) |
| `Bytes` | Raw byte sequence |
| `ReadOnlyView<T>` | Non-mutating view of a value — mutation requires `clone()` |

### JSON types

| Type | Description |
|---|---|
| `Json` | Any valid JSON value |
| `JsonNull` | Explicit JSON null |
| `JsonBool` | JSON boolean |
| `JsonNumber` | JSON number |
| `JsonString` | JSON string |
| `JsonArray` | JSON array |
| `JsonObject` | JSON object |

### Collection

| Type | Description |
|---|---|
| `Array<T>` | Ordered sequence |
| `Set<T>` | Unordered unique-element collection |
| `Map<K, V>` | Key-value map |
| `Channel<T>` | Async communication channel (governed) |

### Algebraic

| Type | Description |
|---|---|
| `Option<T>` | Presence (`Some(T)`) or absence (`None`) |
| `Result<T, E>` | Success (`Ok(T)`) or failure (`Err(E)`) |

### Numeric science / compute

| Type | Description |
|---|---|
| `Vector<T, N>` | Fixed-length numeric vector |
| `Matrix<T, R, C>` | R×C numeric matrix |
| `Tensor<T, Shape>` | Multi-dimensional numeric array — use `AnyTensor` for fully erased form |
| `AnyTensor` | Fully type-erased tensor value — element type and shape unknown |

### Domain / financial

| Type | Description |
|---|---|
| `Money<C>` | Amount with currency type parameter |
| `GBP` | British Pound currency tag |
| `USD` | US Dollar currency tag |
| `EUR` | Euro currency tag |
| `JPY` | Japanese Yen currency tag |

### HTTP / API

| Type | Description |
|---|---|
| `Request` | Incoming HTTP request |
| `Response` | Outgoing HTTP response |

### Error types

| Type | Description |
|---|---|
| `Error` | Base error type |
| `ApiError` | HTTP API error |
| `EmailError` | Email validation / delivery error |
| `PaymentError` | Payment processing error |
| `ValidationError` | Input validation error |
| `WebhookError` | Webhook processing error |
| `DecodeError` | Decode failure (String/Char/Byte decode operations) |

### Inference marker

| Type | Description |
|---|---|
| `Auto` | Compile-time inference marker — compiler resolves to a concrete type from the initializer. Not a normal nominal type. Do not emit `SPORE-TYPE-001` for `Auto`. |

### Branded types

| Type | Description |
|---|---|
| `Brand<T, Name>` | Compile-time branded type giving a plain representation a distinct domain identity |

---

## 3. Generic Arity Rules

Each generic type has a fixed arity. The type checker must reject incorrect arity.

```typescript
export const GENERIC_ARITY: Readonly<Record<string, number>> = {
  Option:       1,
  Result:       2,
  Array:        1,
  Set:          1,
  Map:          2,
  Channel:      1,
  Vector:       2,
  Matrix:       3,
  Money:        1,
  Tensor:       2,  // Tensor<ElementType, Shape>
  ReadOnlyView: 1,  // ReadOnlyView<T>
  Brand:        2,  // Brand<T, "Name">
} as const;
```

Valid:

```galerina
let name:   Option<String>
let result: Result<User, ValidationError>
let prices: Array<Money<GBP>>
let grid:   Matrix<Float32, 4, 4>
```

Invalid:

```galerina
let value: Option<String, Error>   // SPORE-TYPE-003: Option expects 1 type argument
let map:   Map<String>             // SPORE-TYPE-003: Map expects 2 type arguments
```

Diagnostic: `SPORE-TYPE-003` (`ARITY_MISMATCH`)

---

## 4. Type Reference Resolution

A type reference is valid when it resolves to one of:

1. A built-in type listed in Section 2
2. A user-defined `type` declaration in scope
3. A user-defined `enum` declaration in scope
4. A type imported via `import`
5. A valid generic instantiation satisfying arity rules

A type reference that does not resolve to any of the above produces:

Diagnostic: `SPORE-TYPE-002` (`UNKNOWN_TYPE`)

---

## 5. Null and Undefined Policy

Galerina does not allow silent nullability.

Rules:

- `T` (a plain type) does not include `null`.
- `T` does not include `undefined`.
- `Option<T>` is the **only** way to express the absence of a value.
- `JsonNull` is valid only inside explicit JSON value positions.
- `null` and `undefined` as literals are not part of the language.

Valid:

```galerina
let email: Option<String>
let raw:   JsonNull
```

Invalid:

```galerina
let email: String = null
let user = undefined
```

Diagnostics: `SPORE-TYPE-008` (`SILENT_NULL_DENIED`), `SPORE-TYPE-008` (`UNDEFINED_DENIED`)

---

## 6. Assignment Compatibility

The typing judgment for assignment:

```
Γ ⊢ expr : S     Γ ⊢ target : T     S <: T
────────────────────────────────────────────
Γ ⊢ target = expr : T
```

Assignment is valid when:

- Source type equals target type.
- Source type is a permitted numeric widening (see Section 7).
- Source type is a permitted literal narrowing (integer literal to sized integer).
- Source type conforms structurally to target record type (all required fields
  present and correctly typed).
- Source type is explicitly wrapped into `Option<T>` or `Result<T, E>`.

Assignment must **not** silently:

- Convert `String` to a numeric type
- Convert `Json` to a typed record
- Assign a nullable value to a non-option type
- Convert `SecureString` to `String`
- Convert `Float` to `Int` (truncating)
- Convert `Decimal` to `Float` (lossy)
- Convert `Money<GBP>` to `Money<USD>`

Diagnostic: `SPORE-TYPE-001` (`TYPE_MISMATCH`)

---

## 7. Numeric Widening Rules

Implicit widening is permitted only along these chains:

```
Int8  → Int16 → Int32 → Int64 → Int
UInt8 → UInt16 → UInt32 → UInt64
Float16 → Float32 → Float64 → Float
```

`Int → Float` is allowed only with an explicit policy annotation (not in Phase 5).

`Decimal` is not interchangeable with `Float`. Decimal operations require
Decimal arithmetic — mixing with Float is an error.

`Money<C>` is not a plain number. It does not accept plain integer or float
literals without an explicit constructor.

Diagnostic for invalid narrowing: `SPORE-TYPE-001` (`TYPE_MISMATCH`)

---

## 8. Boolean Condition Rule

Only `Bool` may appear as a condition in `if`, `while`, or `match` position.

No truthy/falsy coercion. A non-Bool value in condition position is a type error.

Valid:

```galerina
if isReady {
  return true
}
```

Invalid:

```galerina
if userName {       // SPORE-TYPE-001: expected Bool, got String
  return true
}
```

The Phase 4 lexer classifies `true` and `false` as keywords. The type checker
assigns them type `Bool`.

---

## 9. Option and Result Rules

### Option

```
Option<T> cases:
  Some(T)  — value is present
  None     — value is absent
```

### Result

```
Result<T, E> cases:
  Ok(T)    — success
  Err(E)   — failure
```

### Exhaustiveness

Every `match` on `Option<T>` or `Result<T, E>` must handle all cases.

Valid:

```galerina
match maybeUser {
  Some(user) => user.name
  None       => "Anonymous"
}
```

Invalid:

```galerina
match maybeUser {
  Some(user) => user.name
  // missing None arm
}
```

Diagnostic: `SPORE-MATCH-001` (`NON_EXHAUSTIVE_MATCH`)

---

## 10. Enum Exhaustiveness

Every `match` on a user-defined enum must handle all declared variants,
unless an explicit wildcard `_` arm is present.

```galerina
enum OrderStatus {
  Draft
  Confirmed
  Cancelled
}
```

Valid:

```galerina
match status {
  Draft     => "draft"
  Confirmed => "confirmed"
  Cancelled => "cancelled"
}
```

Invalid:

```galerina
match status {
  Draft => "draft"
  // missing Confirmed and Cancelled
}
```

Diagnostic: `SPORE-MATCH-001` (`NON_EXHAUSTIVE_MATCH`)

---

## 11. Record / Structural Types

User-defined `type` declarations create **structural record types**.

```galerina
type User {
  id:    String
  email: Option<String>
}
```

A value conforms to the record when:
- All required fields are present.
- Each field value matches the declared type.

Extra fields that are not declared on the target type are rejected unless
an explicit open-record policy is introduced (Phase 6+).

---

## 12. SecureString Restrictions

`SecureString` must not be implicitly converted to `String`.

Restricted operations:

```
SecureString may not be passed to print(), log.*(), or any logging function.
SecureString may not be compared with ==.
SecureString may not be included in API response bodies.
SecureString may not be stored in a plain String binding.
SecureString must not appear in generated AI context examples or public schemas.
```

Approved operations:

```
Pass to designated secure functions that accept SecureString.
Call .constantTimeEquals() for comparison.
Call redact() to produce a redacted log-safe representation.
```

Diagnostic: `SPORE-SECRET-001`, `SPORE-SECRET-002`, `SPORE-SECRET-003`
(see `docs/Knowledge-Bases/value-state-annotations.md`)

---

## 13. Required Diagnostics

Full reference: `docs/Knowledge-Bases/compiler-diagnostics.md` (summaries only — defers to this document for SPORE-TYPE-* numbering)
Numbering strategy: `docs/Knowledge-Bases/galerina-diagnostic-numbering-strategy.md`

### SPORE-TYPE-* series (22 codes)

| Code | Name | Description |
|---|---|---|
| `SPORE-TYPE-001` | `UnknownType` | Referenced type does not exist in the current scope; emit fuzzy suggestions |
| `SPORE-TYPE-002` | `TypeMismatch` | Cannot assign or convert type X to type Y |
| `SPORE-TYPE-003` | `InvalidNominalConversion` | Cannot implicitly convert nominal alias (e.g. `String` → `Email` requires a validation gate) |
| `SPORE-TYPE-004` | `InvalidBinaryOperation` | Operator `op` cannot be applied to operands of type X and Y |
| `SPORE-TYPE-005` | `InvalidUnaryOperation` | Unary operator `op` requires operand of type X |
| `SPORE-TYPE-006` | `InvalidCallArgument` | Argument N expected type X but received Y |
| `SPORE-TYPE-007` | `InvalidArgumentCount` | Expected N arguments but received M |
| `SPORE-TYPE-008` | `InvalidReturnType` | Flow declared return type X but returned Y |
| `SPORE-TYPE-009` | `InvalidGenericInstantiation` | Generic type `G<T>` expects N type parameters but received M |
| `SPORE-TYPE-010` | `UnsatisfiedGenericConstraint` | Type X does not satisfy constraint Y on type parameter |
| `SPORE-TYPE-011` | `InvalidCollectionElement` | Collection `G<T>` cannot contain element of type X |
| `SPORE-TYPE-012` | `InvalidResultType` | `Ok`/`Err` branch type does not match declared `Result<T, E>` |
| `SPORE-TYPE-013` | `InvalidSecretOperation` | Protected secret value cannot use operator `op`; use `constantTimeEquals()` |
| `SPORE-TYPE-014` | `MissingRequiredEffect` | Calling `f` requires effect `e`; current flow does not declare it |
| `SPORE-TYPE-015` | `GovernedSinkViolation` | Governed sink requires a safe binding; received an `unsafe let` binding that has not been upgraded with `safe mut` |
| `SPORE-TYPE-016` | `TensorShapeMismatch` | Tensor shapes incompatible for operation (e.g. `matmul` shape mismatch) |
| `SPORE-TYPE-017` | `QuantizedPrecisionMismatch` | Cannot mix `Quantized<Int8>` with `Float32` without `dequantize()` |
| `SPORE-TYPE-018` | `InvalidRuntimeTargetType` | Type X cannot exist in compute target Y (e.g. `CpuTensor` inside `gpu` block) |
| `SPORE-TYPE-019` | `UnknownSymbol` | Symbol `x` is not defined in the current scope |
| `SPORE-TYPE-020` | `ShadowedBinding` | Local binding `x` shadows outer-scope variable `x` (warning) |
| `SPORE-TYPE-021` | `NonExhaustiveMatch` | _(retired — superseded by `SPORE-TYPE-023` mandatory wildcard)_ |
| `SPORE-TYPE-022` | `UnreachablePattern` | Pattern is unreachable due to a previous wildcard (`_` or `else`) |
| `SPORE-TYPE-023` | `MissingWildcardArm` | every `match` must end with a mandatory `_ =>` (or `else =>`) catch-all (fail-closed, task #174) |

### SPORE-NAME-* series

| Code | Name | Description |
|---|---|---|
| `SPORE-NAME-001` | `UNDECLARED_NAME` | Name not defined in current scope |
| `SPORE-NAME-002` | `DUPLICATE_NAME` | Name already declared in this scope |
| `SPORE-NAME-003` | `USE_BEFORE_DECLARATION` | Name referenced before its declaration point |

### SPORE-MATCH-* series

| Code | Name | Description |
|---|---|---|
| `SPORE-MATCH-001` | `NON_EXHAUSTIVE_MATCH` | match case coverage — now enforced by the mandatory wildcard (`SPORE-TYPE-023`) |
| `SPORE-MATCH-002` | `UNREACHABLE_PATTERN` | Pattern is unreachable (alias of `SPORE-TYPE-022`) |
| `SPORE-MATCH-003` | `INVALID_PATTERN_TYPE` | Pattern cannot match against this type |

### Compilation pipeline order

```text
source
    ↓
lexer
    ↓
parser
    ↓
AST
    ↓
symbol resolution     ← SPORE-NAME-*
    ↓
type checker          ← SPORE-TYPE-001..022
    ↓
value-state checker   ← SPORE-VALUESTATE-001..005, SPORE-SECRET-001..003
    ↓
effect checker        ← SPORE-EFFECT-001..006
    ↓
governance verifier   ← SPORE-GOV-*
    ↓
IR generation
```

---

## 14. Type Checker Execution Order

The type checker runs as a single pass after the parser, in this order:

```
1.  Collect all declarations (types, enums, flows) in the program
2.  Register built-in types
3.  Register user-defined types from typeDecl nodes
4.  Register user-defined enums from enumDecl nodes
5.  Validate generic arity on all type references
6.  Resolve all type references to their definitions
7.  Infer expression types bottom-up
8.  Check assignments against declared types
9.  Check flow call arguments against parameter types
10. Check return types against declared return types
11. Check match exhaustiveness for Option, Result, and enum types
12. Check value-state annotations (see value-state-annotations.md)
13. Check SecureString usage restrictions
14. Emit all collected diagnostics with source locations
```

Later checker passes (effect checker, boundary checker) receive the
type-annotated AST from step 13.

---

## 15. Type Inference Scope (Phase 5)

Phase 5 implements:

- Type resolution for all built-in types
- Generic arity validation
- Null/undefined rejection
- Bool-condition enforcement
- SecureString restrictions
- Enum and Option/Result exhaustiveness checks
- Basic assignment compatibility

Phase 5 defers:

- Full structural subtyping (record conformance)
- Numeric widening enforcement (warning only in Phase 5)
- Generic constraint checking beyond arity
- Module-level type imports

---

## 16. Relationship to Value-State Annotations

Safety prefixes (`unsafe let`, `safe mut`) are orthogonal to the base type
system. A binding carries a type (`String`) and an optional safety prefix.
The safety prefix is a property of the **binding declaration**, not the type.
The value-state checker runs as a separate pass after type inference.

See: `docs/Knowledge-Bases/value-state-annotations.md`

---

## 17. Definition of Done

The formal type system spec is complete when:

```
all built-in types are listed
generic arity is documented for all generic types
null / undefined policy is explicit
assignment compatibility rules are defined
numeric widening order is documented
Bool condition enforcement is stated
Option and Result matching rules are defined
enum exhaustiveness is defined
SecureString restrictions are defined
type-checker execution order is documented
diagnostic codes are mapped to type rules
```

This document satisfies all of those criteria.

---

## See Also

- `docs/Knowledge-Bases/value-state-annotations.md`
- `docs/Knowledge-Bases/operator-precedence.md`
- `docs/Knowledge-Bases/compiler-diagnostics.md`
- `docs/Knowledge-Bases/generic-types.md`
- `docs/Knowledge-Bases/galerina-core-logic-tri-decision-bool.md`
- `docs/Knowledge-Bases/v1-reserved-keywords.md`
