# Flat Flow Style

## Status

```
Status: Active — style rule, compiler-enforced
Scope:  Flow nesting depth, guard clauses, match preference
Diagnostic: LNN-STYLE-012 (deep nesting warning)
See also: branching-model.md, galerina-syntax-if-match-optional.md, flat-flow-style principle in architecture-good-taste-principles.md
```

## Definition

Galerina enforces flat flow style as the preferred pattern for control flow.
Deep nesting makes execution harder to audit, read and govern.

## Rules

```text
1. Maximum nesting depth: 2
2. Prefer early return (guard clauses)
3. Prefer match for multi-branch decisions
4. Prefer small fn helpers for pure logic
5. Prefer named flows for complex authorised steps
6. Compiler warns on deep nesting
```

Compiler warning:

```text
LNN-STYLE-012:
Flow nesting exceeds recommended depth.
Use early return, match, or extract a helper fn/flow.
```

## Style Guide

```text
Guard clauses first.
Happy path last.
No elseif.
No switch.
Use match for branches.
Use fn for pure helper logic.
Use flow for authorised steps.
```

## Example: Nested (Avoid)

```galerina
flow checkout(order: safe Order) -> Result {
  if order.valid {
    if order.paid {
      if order.stock_available {
        return ship(order)
      }
      else {
        return OutOfStock
      }
    }
    else {
      return PaymentRequired
    }
  }
  else {
    return InvalidOrder
  }
}
```

## Example: Flat (Preferred)

```galerina
flow checkout(order: safe Order) -> Result {
  if not order.valid {
    return InvalidOrder
  }

  if not order.paid {
    return PaymentRequired
  }

  if not order.stock_available {
    return OutOfStock
  }

  return ship(order)
}
```

## Multi-Branch Decisions with match

For multiple outcomes, prefer `match` over chained conditionals:

```galerina
let decision = match order.status {
  "invalid" => InvalidOrder
  "unpaid"  => PaymentRequired
  "empty"   => OutOfStock
  _ => Ready
}

if decision != Ready {
  return decision
}

return ship(order)
```

## Core Principle

```text
Flat flows are readable, auditable and runtime-friendly.
Nested flows hide control paths from the audit trail.
```
