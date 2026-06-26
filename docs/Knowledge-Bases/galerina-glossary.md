# Galerina — Glossary and Definition Index

## Status

```
Living document — updated as new terms are formalised
Machine-readable version: docs/Knowledge-Bases/galerina-glossary.schema.yaml
```

## Purpose

If you are looking for a term and are not sure what it is called in Galerina,
start here. Each entry lists the canonical name, all known aliases, a short
definition, and a link to the authoritative document.

**For AI tools:** load `galerina-glossary.schema.yaml` — it is the structured
version of this file, designed for alias resolution without prose parsing.

---

## Rules at a Glance

- If you know a concept by an alias (e.g. `tristate`, `gate upgrade`, `sink`), find the canonical name here first
- The canonical name is the one used in compiler diagnostics, KB docs, and source code
- `Tri` ≠ `Bool` ≠ `Decision` — three distinct types, not interchangeable
- `fn` ≠ `flow` ≠ `route` — three distinct execution constructs

---

## Execution Model

### `fn` — Local helper function

**Aliases:** function, helper function, local function

A `fn` is a local helper routine scoped inside a `flow` body. It does pure
computation and returns a value. It **cannot** declare effects, capabilities,
authority, or contracts — those belong in `flow`. It is always synchronous.

A `fn` may only appear inside a `flow` body. Top-level `fn` is a compiler
error (`SPORE-SYNTAX-005`). A `fn` that declares effects emits `SPORE-SEC-014`.

If a `fn` uses an operation that observes an effect (e.g. a network call), that
effect is attributed to the containing `flow` — the `fn` itself still cannot
declare it.

```galerina
// Correct — pure local helper, no effects declared
fn add(a: Int, b: Int) -> Int {
  return a + b
}

// Correct — inside a flow body, effect attributed to the containing flow
pure flow calculateTotal(price: Money<GBP>) : Money<GBP> {
  fn calculateVat(value: Money<GBP>) : Money<GBP> {
    return value * Decimal("0.20")
  }
  return price + calculateVat(price)
}

// WRONG — fn cannot declare effects (SPORE-SEC-014):
// fn fetchUser(id: UserId) -> Result<UserProfile, NetworkError>
//   with effects [network.outbound]   // <-- SPORE-SYNTAX-LEGACY-001 hard error too
// { ... }
// Use a flow instead:
pure flow fetchUser(id: UserId) : Result<UserProfile, NetworkError> {
  contract { effects { network.outbound } }
  return http.get("/users/" + id)
}
```

**See also:** `flow-vs-fn-security-model.md`

---

### `flow` — Governed execution logic

**Aliases:** governed flow, governed function, workflow, operation, handler

A `flow` is where ordinary code becomes part of a governed execution plan. It is
the unit the runtime plans, audits, boundary-checks, and places. It declares
permissions, effects, and policies. It sits between routes (external entry points)
and fn helpers (computation).

```galerina
// Modern style: ':' return type, inline contract
flow createOrder(request: CreateOrderRequest) : Result<OrderResponse, ApiError> {
  contract { effects { database.write, audit.write } }
  let total = calculateTotal(request.order)   // calls a fn
  let order = db.orders.insert({ ... })?
  return Ok(OrderResponse { id: order.id, total: total })
}
```

**The execution model:**
```
route -> flow -> fn
```

Effects propagate upward. If a `flow` calls a `fn` that observes a `network`
effect internally, the containing `flow` must declare that effect — otherwise
the compiler rejects it. Note: the `fn` does not and cannot declare the effect
itself; it is attributed to the containing `flow`.

**See also:** `flow-vs-fn-security-model.md`

---

### `secure flow` — Security-sensitive flow

**Aliases:** secureFlowDecl (AST), secured flow, guarded flow

A `flow` that handles security-sensitive operations. Enforces stricter value-state
rules: `unsafe` bindings must be gate-upgraded before reaching governed sinks.

```galerina
secure flow createCustomer(request: Request) -> Result<Response, ApiError>
  effects [database.write, audit.write]
{
  unsafe let rawBody: Bytes = request.rawBody
  safe mut rawBody = json.decode<CreateCustomerInput>(rawBody)?
  ...
}
```

---

### `pure flow` — Side-effect-free flow

**Aliases:** pureFlowDecl (AST), deterministic flow

A `flow` that declares no side effects. The compiler enforces that no effectful
operations occur inside it.

---

### `route` — External entry point

**Aliases:** endpoint, HTTP route, API route, entry point

A `route` exposes a flow to external callers (HTTP, webhook, etc.). It does not
contain logic — it delegates to a flow.

```galerina
route POST "/orders" {
  request CreateOrderRequest
  response OrderResponse
  flow createOrder
}
```

---

### `when` guard arm — Conditional match arm with a boolean guard

**Aliases:** when arm, guard arm, when expression arm, match guard

A `match` arm that begins with `when expr =>` instead of a pattern. The guard
expression is a boolean expression that may reference the match subject or any
in-scope binding. Introduced in Phase 41 (grammar v1.1).

```galerina
match score {
  when score >= 90 => return "critical"
  when score >= 70 => return "high"
  _               => return "low"
}
```

Use `when` guard arms instead of `else if` chains — `else if` is a hard error
(`SPORE-SYNTAX-010`).

**See also:** `galerina-grammar.ebnf` §when_guard_arm, `galerina-syntax-if-match-optional.md`

---

### `match` — Multi-arm pattern/guard dispatch

**Aliases:** match expression, match statement, pattern match, switch

Galerina's multi-branch control construct. All `match` expressions are exhaustive.
Supported arm forms (Phase 41+):

| Arm form | Example |
|---|---|
| `when` guard arm | `when score >= 90 => return "critical"` |
| Integer literal arm | `200 => return "ok"` |
| String literal arm | `"admin" => return adminView()` |
| Enum / qualified enum | `Some(x) =>` / `Status.Active =>` |
| `Ok(x)` / `Err(e)` | Result arm |
| Wildcard | `_ => ...` |

Use `match` in place of `else if` chains (which are a hard error: `SPORE-SYNTAX-010`).

**See also:** `galerina-grammar.ebnf` §match_expr, `galerina-syntax-if-match-optional.md`

---

### `inline contract` — Contract block as first item inside flow body

**Aliases:** inline contract style, contract inside body

Phase 41 syntax: the `contract {}` block may appear as the **first item** inside
the flow body `{}`, rather than between the signature and the body. Both
placements are valid; the inline style is the modern preferred form.

```galerina
// Modern (inline) style — preferred
pure flow foo(x: Int) : String {
  contract {
    intent { "Return greeting." }
    effects { }
  }
  return "hello " + x
}

// Traditional (external) style — also valid
pure flow foo(x: Int) : String
contract {
  intent { "Return greeting." }
}
{
  return "hello " + x
}
```

**See also:** `galerina-grammar.ebnf` §contract_block, Phase 41 syntax additions

---

### `with effects [...]` — REMOVED (hard error)

**Aliases:** with effects clause, effects list, effect annotation

`with effects [...]` was a pre-v1 syntax for declaring effects on a flow.
It is now a **hard error** (`SPORE-SYNTAX-LEGACY-001`). The v1 parser rejects
this form immediately.

```galerina
// WRONG — SPORE-SYNTAX-LEGACY-001 hard error:
// flow foo(x: Int) -> String
//   with effects [database.read]
// { ... }

// CORRECT — use contract { effects {} }:
flow foo(x: Int) : String {
  contract { effects { database.read } }
  ...
}
```

**See also:** `galerina-grammar.ebnf` §effects_clause (REMOVED note), `SPORE-SYNTAX-LEGACY-001`

---

### `effect` — Declared runtime authority

**Aliases:** side effect, capability, authority, permission effect, runtime authority

A declared runtime authority that a `flow` (or `guarded flow` / `secure flow`)
requires. Effects are explicit and propagate upward through the call graph.
Only `flow` variants declare effects — `fn` cannot declare effects (`SPORE-SEC-014`).
No declared effects on a flow = pure/local for that flow.

```galerina
// v1 canonical form — inside contract block
contract { effects { database.write, audit.write, network.outbound } }
```

**See also:** `effect-checker-and-boundary-checker.md`

---

## Type System

### `Tri` — Three-valued truth type

**Aliases:** tristate, tri-decision, TriState, three-valued logic, tri logic

> **Not to be confused with:** trie (prefix-tree data structure — completely unrelated)

Galerina's three-valued truth type: `True`, `False`, `Unknown`. Not `Bool`.

- Cannot be used directly as a branch condition
- `&&`, `||`, `!` are denied on `Tri` in v1
- Must always be matched over all three values

```galerina
// Correct
match decision {
  True    => allow()
  False   => deny()
  Unknown => review()
}

// Wrong — SPORE-SAFETY-001
if decision { ... }
```

**See also:** `galerina-core-logic-tri-decision-bool.md`, `operator-type-rules.md`

---

### `Bool` — Standard boolean

**Aliases:** boolean, Boolean, bool

Two-valued type: `true` or `false`. The **only** type allowed as a branch condition
in `if`/`while`. Distinct from `Tri`.

---

### `Auto` — Compile-time inference marker

**Aliases:** auto, type inference, inferred type, auto type

Not a type — a compile-time keyword telling the compiler to resolve the concrete
type from the initializer. Does **not** emit `SPORE-TYPE-001`. Deferred to the
inference pass.

```galerina
let count: Auto = 42         // inferred: Int
let name:  Auto = "Galerina"   // inferred: String
```

> **Not to be confused with:** `Any` (unsafe dynamic type — not in Galerina v1)

**See also:** `auto-type-inference.md`

---

### `Brand<T, Name>` — Compile-time branded type

**Aliases:** branded type, nominal type, domain type, opaque type, newtype, strong typedef

Wraps a base type with a distinct compile-time identity. Prevents mixing
structurally identical but semantically different values. Erases to the base
type at runtime.

```galerina
type CustomerId = Brand<String, "CustomerId">
type OrderId    = Brand<String, "OrderId">
// CustomerId and OrderId are distinct types despite both being String at runtime
```

> **Not to be confused with:** type alias (`type X = String` — same type, just renamed)

**See also:** `generic-types.md`

---

### `SecureString` — Sensitive string type

**Aliases:** secret string, sensitive string, protected string, secret value, ProtectedSecret

A string type for sensitive values (API keys, tokens, passwords). Restricted:
- Cannot be compared with `==` or `!=` — use `constantTimeEquals()`
- Cannot be passed to log functions — use `redact()`
- Cannot be stored in a plain `String` binding
- Redacted automatically in all diagnostic and audit output

```galerina
let apiKey: SecureString = env.secret("API_KEY")
log.info(redact(apiKey))                          // OK
let valid = constantTimeEquals(apiKey, provided)  // OK
log.info(apiKey)                                  // SPORE-SECRET-001
if apiKey == provided { ... }                     // SPORE-SECRET-002
```

---

### `Option<T>` — Optional value

**Aliases:** optional, Maybe, nullable, optional value, Some/None

The only way to express the absence of a value in Galerina. `null` and `undefined`
do not exist. Arity 1. Every `match` on `Option<T>` must handle both `Some` and `None`.

---

### `Result<T, E>` — Success or typed failure

**Aliases:** Ok/Err, Result type, fallible result, Either

Replaces exceptions. Arity 2. Every `match` on `Result<T, E>` must handle both
`Ok` and `Err`.

---

### `Tensor<T, Shape>` — Multi-dimensional numeric array

**Aliases:** tensor, Tensor, bare Tensor, typed tensor, neural tensor

Generic type with **arity 2**: element type and shape. Bare `Tensor` without
parameters is invalid (`SPORE-TYPE-009`).

```galerina
Tensor<Float32, [Batch, 768]>  // valid
Tensor<Int8, DynamicShape>     // valid — shape is dynamic but element type known
Tensor                         // SPORE-TYPE-009 — arity mismatch
AnyTensor                      // use this for fully erased form
```

**See also:** `galerina-tensor-arity-decision.md`

---

### `AnyTensor` — Erased tensor

**Aliases:** erased tensor, opaque tensor, dynamic tensor, untyped tensor

Zero-arity. Use when both element type and shape are unknown at compile time.
Prefer `Tensor<T, Shape>` wherever possible.

---

### `Money<C>` — Monetary value with currency

**Aliases:** monetary type, currency type, financial amount

Parameterised by currency tag (`GBP`, `USD`, `EUR`, `JPY`). Arithmetic only
between same-currency values — cross-currency is `SPORE-TYPE-004`.

---

### `Byte` — Raw unsigned 8-bit value

**Aliases:** byte, raw byte, UInt8 byte, octet

For binary data, not text. Range 0–255. Distinct from `Char`.

---

### `Char` — Unicode character unit

**Aliases:** character, char, Unicode char, character unit

A single Unicode scalar value. Text, not a number. Cannot be assigned to `Byte`
without explicit encoding.

---

## Value-State

### `unsafe let` — Unsafe binding declaration

**Aliases:** unsafe binding, boundary-origin value, unvalidated value, tainted value, untrusted binding

Marks a binding as boundary-origin or untrusted. Cannot flow to governed sinks
without a `safe mut` gate upgrade.

```galerina
unsafe let rawEmail: String = form.email
```

---

### `safe mut` — Gate upgrade

**Aliases:** gate upgrade, safe upgrade, trust upgrade, validation upgrade, state upgrade, trust transition

Upgrades an unsafe binding to safe state via a recognised gate function. The
RHS must be from the approved gate registry.

```galerina
safe mut rawEmail = validate.email(rawEmail)?
safe mut rawBody  = json.decode<Input>(rawBody)?
```

**See also:** `stdlib-gates.yaml`, `value-state-annotations.md`

---

### `governed sink` — Write target requiring safe values

**Aliases:** sink, write sink, trusted sink, secured sink, database sink, governed write target

A call target that must not receive unsafe binding arguments. Includes:
`*DB.insert/update/delete/write`, `AuditLog.write`, `shell.exec`, `FileSystem.write`

**Registry:** `stdlib-gates.yaml §sinks`

---

### `gate function` — Approved unsafe→safe transition

**Aliases:** gate, validator, sanitizer, validation gate, trust gate, approved gate

A function recognised by the compiler as a valid unsafe→safe transition.
Approved: `validate.*`, `sanitize.*`, `json.decode`, `toml.decode`, `parse.*`,
`redact`, `constantTimeEquals`

**Registry:** `stdlib-gates.yaml §gates`

---

### `redact` — Log-safe masking

**Aliases:** redaction, masking, secret masking, log-safe value

Produces a log-safe placeholder from a sensitive or unsafe value. Does not
declassify the original. Required before passing `SecureString` to log functions.

---

### `constantTimeEquals` — Timing-safe equality check

**Aliases:** constant time comparison, timing-safe equals, secure equals, secret equals

Required instead of `==` for `SecureString` comparisons. Direct `==` on
`SecureString` emits `SPORE-SECRET-002`.

---

## Diagnostics Quick Reference

| Canonical code | Aliases | Meaning |
|---|---|---|
| `SPORE-TYPE-001` | UnknownType, type not found, undefined type | Referenced type not in scope |
| `SPORE-TYPE-004` | InvalidBinaryOperation, invalid operator, bad operand types | Operator not valid for these types |
| `SPORE-TYPE-009` | InvalidGenericInstantiation, arity mismatch, wrong type arguments | Wrong number of generic parameters |
| `SPORE-VALUESTATE-001` | UnsafeToSafeTransitionDenied, missing gate | safe mut without a gate |
| `SPORE-VALUESTATE-003` | UnsafeValueReachedGovernedSink, unsafe at sink | unsafe binding at governed sink |
| `SPORE-SECRET-001` | SecretValueLogged, secret in log | SecureString passed to log function |
| `SPORE-SECRET-002` | SecretComparisonDenied, secret equality | SecureString compared with == |
| `SPORE-MATCH-001` | NonExhaustiveMatch, missing match arm | match missing one or more variants |
| `SPORE-NAME-001` | UNDECLARED_NAME, name not found, undefined name | Identifier not declared in scope |

Full diagnostic definitions: `formal-type-system-spec.md` (SPORE-TYPE-*),
`value-state-annotations.md` (SPORE-VALUESTATE-*, SPORE-SECRET-*)

---

## AST Quick Reference

| Canonical kind | Aliases | Notes |
|---|---|---|
| `letDecl` | let declaration, let binding, let statement | .value = "[prefix ][name][: Type]" |
| `mutDecl` | mut declaration, mutable binding, safe mut declaration | .value = same as letDecl |
| `flowDecl` | flow declaration | .value = flow name only |
| `secureFlowDecl` | secure flow, guarded flow | .value = flow name only |
| `pureFlowDecl` | pure flow, deterministic flow | .value = flow name only |
| `errorPropagation` | ? operator, try operator, propagation node | children[0] = inner expression |
| `computeTargetBlock` | compute target, compute block, target block | .value = "cpu"\|"gpu"\|"npu"\|"best" |
| `effectRef` | effect name, effect identifier | .value = "database.write" etc. |

Full encoding spec: `ast-value-encoding.md`

---

## See Also

- `galerina-glossary.schema.yaml` — machine-readable alias map (load this for AI tooling)
- `ast-value-encoding.md` — what `.value` means for every AstNodeKind
- `formal-type-system-spec.md` — authoritative type system spec
- `value-state-annotations.md` — value-state rules
- `stdlib-gates.yaml` — gate and sink registry
- `operator-type-rules.md` — operator compatibility rules
- `compiler-diagnostics.md` — diagnostic index

---

## Architecture Concepts

### `IGO` — Intent-Guided Optimisation

**Aliases:** Intent-Guided Optimisation, GIRT (internal), adaptive runtime, workload learning

The Galerina runtime architecture where intent declarations guide execution
optimisation without granting additional authority.

> **Intent is a signal for optimisation, not a grant of authority.**

The runtime observes workload patterns and builds learned preferences
(e.g. prefer GPU for AI inference). These preferences:
- Expire after a set date (`stale_after`)
- Are bounded by governance (`denied_targets` always enforced)
- Are audited once confidence is high (`audit_at_confidence`)
- Never modify GIR semantics

**IGO** = public-facing name for docs and communication.
**GIRT** (Governed Intent-Guided Runtime) = internal module name.

**See also:** `galerina-intent-guided-optimisation.md`, `galerina-adaptive-runtime-profiles.md`

---

### `governed execution` — Governed Execution

**Aliases:** governed execution plan, governance, execution governance, governed runtime

Galerina's core model: code executes as part of a declared, auditable,
permission-controlled plan. Flows are the unit of governed execution.
The model: `intent → governed execution plan → coordinated compute`.

**See also:** `core-application-model.md`
