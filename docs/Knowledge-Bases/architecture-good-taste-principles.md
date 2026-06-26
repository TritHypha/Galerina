# Architecture Good-Taste Principles

## Core Rule

```text
Good taste = design the model so edge cases disappear.
```

This is the governing design philosophy for Galerina's architecture. When a design
forces special-case handling, that is a sign the model is wrong. The goal is a
model where the boring path is also the safe path.

---

## The Five Architecture Rules

### Rule 1: No Special-Case Paths

All boundary inputs are modelled the same way regardless of origin:

```text
Boundary<T> -> T unsafe unvalidated
```

Do not create separate handling for API, webhook, CLI or queue inputs. All
external inputs arrive as `unsafe unvalidated`. All validated outputs become
`safe validated`. The type system enforces the boundary — not conditional logic.

### Rule 2: Keep Authority Flat

Do not nest permission logic inside flows. Use a pre-planned authority graph:

```text
flow -> effects -> runtime authority plan -> allow/deny
```

Authority decisions happen at the plan level, not scattered through business
logic. This makes authority visible, auditable and testable.

### Rule 3: Avoid Deep Nesting

Prefer early exits and flat flows:

```galerina
match validate.email(rawEmail) {
  Err(error) => return Api.badRequest(error)
  Ok(email)  => save(email)
}
```

Guard clauses and `attempt ... else error` patterns keep flows flat and readable.
Deep nesting hides control flow and makes security review harder.

### Rule 4: Small Focused Flows

Each flow should have one responsibility.

Bad — one flow doing too much:

```galerina
secure flow handleCheckout(...)
// validation, pricing, payment, stock, email, audit all in one place
```

Good — small focused flows:

```text
validateCheckout
priceOrder
reserveStock
capturePayment
writeAudit
```

Small flows are easier to type-check, effect-check, security-review and test.

### Rule 5: Simple Data Structures

Use manifests and tables instead of runtime discovery:

```text
route table
type manifest
effect graph
authority plan
decoder plan
```

Avoid deep runtime conditional branching. Pre-computed plans make execution
predictable and governable.

---

## Making Edge Cases Impossible

The best security control is removing the edge case entirely:

| Pattern | What it eliminates |
| --- | --- |
| `Option<T>` | Null dereference bugs |
| `Result<T, E>` | Hidden exception paths |
| Enum exhaustive match | Missing branch bugs |
| `String unsafe unvalidated` | Implicit trust of boundary input |
| `Email safe validated` | Untrusted input in trusted code |

When the type system models trust state, the compiler enforces the rule — not
the developer's memory.

---

## Good-Taste Summary

```text
Design the type/runtime model so the boring path is also the safe path.

boundary input -> unsafe unvalidated
validated input -> safe validated
effects -> declared once
authority -> checked by plan
runtime -> follows simple manifests
```

The architecture is correct when:

- edge cases disappear because the model makes them impossible
- the normal path is the safe path
- authority and effects are visible in one place
- flows stay small, flat and focused
- data structures are plain, predictable and verifiable

---

## Relationship to Build Architecture

The same good-taste principle applies to the build system. Avoid separate build
paths for API, webhook, queue, CLI. Use one model:

```text
boundary -> type contract -> effect contract -> authority plan -> runtime plan
```

See `build-system-and-cli.md` for the applied build architecture.

---

## AI and Tooling Implication

When the model is designed well, AI tools can reason about Galerina code using
the same plain-data manifests as the runtime:

```text
route table    -> AI knows all routes
type manifest  -> AI knows all types
effect graph   -> AI knows all side effects
authority plan -> AI knows what is allowed
```

Good-taste architecture makes Galerina more AI-readable by design.
