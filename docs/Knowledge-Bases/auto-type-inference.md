# Auto Type Inference

## Definition

`Auto` is a compile-time type inference keyword. It tells the compiler to infer
the concrete type from the assigned value at the point of declaration.

```text
Auto = compiler decides the exact concrete type now, at compile time
```

`Auto` is not `Any`. `Any` means the value can be anything at runtime. `Auto`
means the compiler resolves the exact type immediately.

---

## Core Rule

```text
Auto must resolve to a single concrete type at compile time.
```

If the compiler cannot determine a single unambiguous type from the assignment,
the declaration must be made explicit.

---

## Valid Uses

### Scalar literals

```galerina
let count: Auto = 42
// compiler infers: let count: Int = 42
```

```galerina
let name: Auto = "Phillip"
// compiler infers: let name: String = "Phillip"
```

```galerina
let active: Auto = true
// compiler infers: let active: Bool = true
```

### Unambiguous expression result

```galerina
let total: Auto = order.price * order.quantity
// compiler infers: let total: Decimal = ... (if price and quantity are Decimal)
```

---

## Invalid Uses

### Mixed-type branch result

```galerina
let result: Auto = match status {
  "ok"    => "continue"
  "error" => 500
}
// ERROR: branches return String and Int — cannot infer a single type
```

Use an explicit type instead:

```galerina
let result: String = match status {
  "ok"    => "continue"
  "error" => "fail"
}
```

### Ambiguous inference

```galerina
let x: Auto = someExternalFunction()
// Only valid if someExternalFunction has a declared return type
```

---

## Auto vs Any

| Keyword | Meaning | Type safety |
| --- | --- | --- |
| `Auto` | Compiler infers the concrete type at compile time | Full — resolved to a single type |
| `Any` | Value can be any type at runtime | Unsafe — type is not verified |

`Any` weakens type safety. `Auto` does not — it is purely a developer
convenience that removes the need to repeat an obvious type annotation.

---

## Design Rationale

`Auto` provides developer convenience without weakening Galerina's strict type
system:

- The compiler still knows the exact type
- All type checks still apply
- No dynamic dispatch or runtime type confusion
- Source maps and AI context still have the resolved type

`Auto` is equivalent to writing the explicit type — it just asks the compiler
to fill it in when the value makes the type obvious.

---

## Style Guidance

Prefer explicit types in public flow signatures and type definitions:

```galerina
// Prefer explicit for public API:
flow totalPrice(order: Order) -> Decimal {
  ...
}
```

`Auto` is most appropriate for local intermediate bindings where the type is
immediately obvious from the expression:

```galerina
secure flow processOrder(order: Order) -> Result<Invoice, OrderError> {
  let itemCount: Auto = order.items.length  // obvious: Int
  let subtotal: Auto  = order.items.sum(i => i.price)  // obvious: Decimal
  ...
}
```

---

## Compiler Behaviour

The compiler resolves `Auto` during the type-checking phase:

1. Analyse the right-hand side expression
2. Determine the concrete type
3. If exactly one type: substitute and continue
4. If ambiguous or multiple types: emit a type error requiring explicit annotation

`Auto` declarations appear in the type manifest with their resolved type, not
as `Auto`.
