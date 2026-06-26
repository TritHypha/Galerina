# Galerina Standard Syntax: Bindings and Pipelines

**Status:** Stage 1 — canonical decisions documented; `var`/`const` detection live in compiler; binding/pipeline checker stubs in place  
**Scope:** `let`, `mut`, `readonly`, method-chain pipelines, rejected keywords `var`/`const`  
**Packages:** `@galerina/core`, `@galerina/core-compiler`

---

## 1. Canonical Binding Keywords

Galerina supports exactly three binding forms:

| Keyword | Meaning | Use When |
|---|---|---|
| `let` | Immutable binding; value cannot be reassigned | Default; most bindings |
| `mut` | Mutable binding; reassignment is explicit | Counters, retry loops, local accumulators |
| `readonly` | Immutable binding + read-only view over the value | Config, request metadata, large shared data |

**Not supported:**

| Keyword | Rejected | Reason |
|---|---|---|
| `var` | `SPORE-SYNTAX-001` | Ambiguous across languages; encourages mutable-by-default style |
| `const` | `SPORE-SYNTAX-002` | Overlaps with `let`/`readonly`; different languages disagree on its meaning |

The compiler's `validateCoreSyntaxSafety()` detects `var` and `const` in `.spore` source files and emits errors immediately.

---

## 2. `let` — Default Immutable Binding

```galerina
let amount = 100
let currency = "GBP"

let payment = Payment {
  amount: amount
  currency: currency
}
```

Reassignment is an error:

```galerina
let count = 1
count = count + 1
// ^ SPORE-BINDING-001: Cannot reassign immutable let binding count.
//   Use mut only if reassignment is required.
```

---

## 3. `mut` — Explicit Mutable Binding

```galerina
mut retries = 0

while retries < 3 limit 3 {
  let response = sendRequest()

  if response.ok {
    break
  }

  retries = retries + 1
}
```

`mut` is discouraged in pure flows — use functional accumulators instead:

```galerina
// Less reliable: shared mutable state.
mut total = 0
for order in orders {
  total = total + order.amount
}

// Preferred: fold is pure and safe to optimise.
let total =
  orders
    .fold(0, (sum, order) => sum + order.amount)
```

`mut` in a pure flow context emits `SPORE-BINDING-004`.

---

## 4. `readonly` — Immutable Binding + Read-Only View

```galerina
readonly appConfig = loadEnvironmentConfig()
readonly requestHeaders = request.headers
readonly API_VERSION = "1.0.0"
```

Mutation through a `readonly` binding is rejected:

```galerina
readonly config = loadConfig()
config.apiBaseUrl = "http://unsafe.example.com"
// ^ SPORE-BINDING-002: Cannot reassign readonly binding config.

config.nested.value = 1
// ^ SPORE-BINDING-003: Cannot mutate property nested.value through readonly binding config.
```

---

## 5. Difference Between `let` and `readonly`

```text
let      — immutable binding; the value's internal mutability depends on its type
readonly — immutable binding AND a read-only view; mutation through this reference is always rejected
```

```galerina
let user = User { name: "Phill" }
// user itself cannot be reassigned, but User.name may be mutable depending on type

readonly safeUser = user
// safeUser cannot be reassigned AND safeUser.name cannot be mutated through safeUser
```

---

## 6. Why `var` Is Rejected

```galerina
var count = 0
// ^ SPORE-SYNTAX-001: Galerina does not support var.
//   Use let for immutable bindings or mut for mutable bindings.
```

`var` is rejected at compile time because:
- It implies mutable-by-default, which is the opposite of Galerina's principle
- Its meaning varies significantly across languages (JavaScript `var` vs. Kotlin `var` vs. Swift `var`)
- `mut` is a clearer, safer, more intention-revealing alternative

---

## 7. Why `const` Is Rejected

```galerina
const API_VERSION = "1.0.0"
// ^ SPORE-SYNTAX-002: Galerina does not support const.
//   Use let for immutable bindings or readonly for read-only values.
```

`const` is rejected at compile time because:
- It overlaps semantically with both `let` and `readonly`
- Its meaning varies across languages (JavaScript `const` vs. C `const` vs. Rust `const`)
- `readonly` is the correct Galerina term for compile-time-resolved immutable values

---

## 8. Method-Chain Pipeline Style

Galerina uses **method-chain** pipelines as the canonical style for data transformation:

```galerina
let savedUser =
  input
    .validate()
    .sanitize()
    .toUser()
    .save()
```

The pipe operator (`|>`) is **not** canonical Galerina syntax in v0.1.

Method chaining is:
- Familiar and readable
- Easy to parse
- Compatible with typed `Result`/`Option` flows
- Suitable for IDE tooling and type inference

---

## 9. Result-Aware Pipelines

Stages that can fail should return `Result`. The pipeline propagates failure without hiding it:

```galerina
let result =
  input
    .validate()
    .sanitize()
    .decode<User>()
    .save()
```

Equivalent explicit form:

```galerina
match input.validate() {
  Ok(valid) => {
    match valid.sanitize().decode<User>() {
      Ok(user) => user.save()
      Err(error) => Err(error)
    }
  }
  Err(error) => Err(error)
}
```

Unhandled `Result` in a pipeline emits `SPORE-PIPELINE-003`.

---

## 10. Optional-Aware Pipelines

```galerina
let email =
  maybeUser
    .map(user => user.email)
    .filter(email => email.isVerified())
```

`Some`/`None` must be preserved — optional values must not collapse to `null` or `undefined`.

---

## 11. Effect-Declared Pipelines

Effectful stages must match the enclosing flow's declared effects:

```galerina
guarded flow createOrder(input: CreateOrderRequest)
  intent "create customer order"
  effects [database.write, audit.write]
  audit required
{
  let order =
    input
      .validate()
      .sanitize()
      .toOrder()

  return order
    .save()           // requires database.write
    .audit("order.created")  // requires audit.write
}
```

An undeclared effect in a pipeline stage emits `SPORE-PIPELINE-004`.

---

## 12. Security-Safe Pipelines

Secrets must not flow through generic string conversion:

```galerina
// Bad: toString() may leak secret values.
let report =
  payment
    .toString()
    .save()

// Good: explicit redaction before transformation.
let report =
  payment
    .redactSecrets()
    .toReport()
    .save()
```

---

## 13. Readonly Pipelines

A readonly receiver must not be mutated through a pipeline stage:

```galerina
readonly headers = request.headers

// Bad: pipeline stage mutates readonly receiver.
headers
  .setAuthorization("Bearer xyz")
// ^ SPORE-PIPELINE-005: Pipeline stage attempts to mutate a readonly receiver.
```

---

## 14. Runtime Optimisation from Pure Pipelines

When a pipeline is `pure` and `effect-free`, the runtime may safely rewrite it:

```galerina
pure flow calculateTotals(orders: List<Order>)
  intent "calculate order totals"
  effects []
  compute auto
{
  let totals =
    orders
      .map(order => order.total)
      .sum()
}
```

The runtime may plan:

```json
{
  "rewrite": "map_sum_to_parallel_reduction",
  "reason": "pure transformation over immutable collection",
  "fallback": "sequential pipeline"
}
```

---

## 15. Diagnostic Codes

### Syntax diagnostics (SPORE-SYNTAX-*)

| Code | Name | Trigger |
|---|---|---|
| `SPORE-SYNTAX-001` | `VAR_NOT_SUPPORTED` | `var` used as a binding keyword |
| `SPORE-SYNTAX-002` | `CONST_NOT_SUPPORTED` | `const` used as a binding keyword |

### Binding diagnostics (SPORE-BINDING-*)

| Code | Name | Trigger |
|---|---|---|
| `SPORE-BINDING-001` | `IMMUTABLE_LET_REASSIGNMENT` | Reassignment of a `let` binding |
| `SPORE-BINDING-002` | `READONLY_REASSIGNMENT` | Reassignment of a `readonly` binding |
| `SPORE-BINDING-003` | `READONLY_PROPERTY_MUTATION` | Property mutation through a `readonly` binding |
| `SPORE-BINDING-004` | `MUT_IN_PURE_CONTEXT` | `mut` used in a pure or safe context |

### Pipeline diagnostics (SPORE-PIPELINE-*)

| Code | Name | Trigger |
|---|---|---|
| `SPORE-PIPELINE-001` | `UNKNOWN_PIPELINE_METHOD` | Method does not exist on current type |
| `SPORE-PIPELINE-002` | `PIPELINE_TYPE_MISMATCH` | Stage output type ≠ next stage input type |
| `SPORE-PIPELINE-003` | `UNHANDLED_FALLIBLE_PIPELINE` | `Result`-returning stage with no error handling |
| `SPORE-PIPELINE-004` | `PIPELINE_UNDECLARED_EFFECT` | Stage uses an effect not declared on the flow |
| `SPORE-PIPELINE-005` | `PIPELINE_READONLY_MUTATION` | Stage mutates a `readonly` receiver |

---

## 16. Type Contracts (`@galerina/core`)

```ts
export type BindingKind = "let" | "mut" | "readonly";

export interface BindingDeclaration {
  readonly kind: BindingKind;
  readonly name: string;
  readonly typeAnnotation?: string;
  readonly location?: SourceLocation;
}

export interface MethodChainCall {
  readonly methodName: string;
  readonly typeArguments?: readonly string[];
  readonly location?: SourceLocation;
}

export interface MethodChainExpression {
  readonly kind: "methodChainExpr";
  readonly receiver: string;
  readonly calls: readonly MethodChainCall[];
  readonly location?: SourceLocation;
}
```

New `AstNodeKind` values:
- `readonlyDecl` — `readonly name = value` declaration
- `methodChainExpr` — `receiver.method().method()` pipeline expression

---

## 17. Implementation Status

| Area | Status | Notes |
|---|---|---|
| `BindingKind`, `BindingDeclaration` types | ✅ | `@galerina/core/src/index.ts` |
| `MethodChainExpression`, `MethodChainCall` types | ✅ | `@galerina/core/src/index.ts` |
| `readonlyDecl`, `methodChainExpr` AstNodeKind | ✅ | `@galerina/core/src/index.ts` |
| `SPORE-SYNTAX-001..002` constants | ✅ | `@galerina/core-compiler` |
| `SPORE-BINDING-001..004` constants | ✅ | `@galerina/core-compiler` |
| `SPORE-PIPELINE-001..005` constants | ✅ | `@galerina/core-compiler` |
| `var`/`const` detection in `validateCoreSyntaxSafety()` | ✅ | Real check; comment lines excluded |
| `checkBindingReassignment()` | ✅ | Typed stub; emits correct diagnostics |
| `checkReadonlyMutation()` | ✅ | Typed stub; emits correct diagnostics |
| `checkMethodChain()` | ✅ | Typed stub; empty result pending type scope |
| `boot.spore` `const` → `readonly` | ✅ | Fixed 2026-05-26 |
| `compile-time-vs-runtime-authority.md` `const` → `readonly` | ✅ | Fixed 2026-05-26 |
| Tests: var/const detection | ✅ | 6 new tests; 12/12 passing |
| Binding reassignment parser (Stage 2) | ⏳ | Blocked on AST binding scope |
| Method-chain type checker (Stage 2) | ⏳ | Blocked on type scope implementation |
| Pure-context `mut` check (Stage 2) | ⏳ | Blocked on flow safety level inference |
| Pipeline effects integration (Stage 3) | ⏳ | Blocked on effect checker wiring |
