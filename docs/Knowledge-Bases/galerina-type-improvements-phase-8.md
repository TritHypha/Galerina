# Galerina Type System Improvements — Phase 8

## Status

```text
Phase 8B/8C implementation targets
Adopted: all three
Priority: Very High
```

## TL;DR
- Branded types must be nominal — `let id: CustomerId = rawString` must emit SPORE-TYPE-003
- Enum variant type-checking in match must use subject type, not pattern-name inference
- Money currency tags are phantom types — `Money<GBP>` and `Money<USD>` are distinct compile-time types

---

## 1. Branded Type Enforcement (SPORE-TYPE-003)

`Brand<String, "CustomerId">` creates a nominal type. Without enforcement, the
compiler accepts raw strings as trusted domain identifiers — defeating the purpose.

### Invalid (must emit SPORE-TYPE-003)

```galerina
let id: CustomerId = rawString    // SPORE-TYPE-003: use validate.customerId()
let email: Email = someString     // SPORE-TYPE-003: use validate.email()
```

### Valid

```galerina
let id: protected CustomerId = validate.customerId(rawId)?
let email: protected Email   = validate.email(rawEmail)?
```

### Phase 8B implementation

- Track `Brand<T, "Name">` type declarations as nominal
- In assignment checking: if declared type is branded, reject plain base type
- Emit SPORE-TYPE-003 with suggestedFix pointing to validate gate

---

## 2. Enum Variant Typing in match

Currently exhaustiveness checks infer the enum by pattern-matching variant names.
This is fragile when two enums share variant names.

### Correct checking order

1. Resolve match subject type from binding type scope
2. Confirm subject type is a known enum
3. Load variants for that specific enum
4. Validate each arm variant belongs to that enum
5. Check exhaustiveness against that enum's full variant set

### Phase 8B implementation

- Extend `TypeChecker.inferType()` to look up binding types registered in type scope
- In `checkMatchExhaustiveness()`, use the subject's inferred type to select the enum
- Emit SPORE-MATCH-003 when a pattern variant doesn't belong to the subject enum

---

## 3. Money Currency as Phantom Type

`Money<GBP>` and `Money<USD>` must be distinct compile-time types.

### Type rules

| Expression | Result |
|---|---|
| `Money<GBP> + Money<GBP>` | `Money<GBP>` |
| `Money<GBP> + Money<USD>` | SPORE-TYPE-004 |
| `Money<GBP> * Decimal` | `Money<GBP>` |
| `Money<GBP> / Money<GBP>` | `Decimal` |
| `Money<GBP> / Money<USD>` | SPORE-TYPE-004 |

### Phase 8B implementation

- Extract currency tag from `Money<C>` type annotations
- In `moneyBinary()`, compare currency tags — emit SPORE-TYPE-004 if they differ
- Extend `isAssignmentCompatible()` to compare Money generic arguments

---

## See Also

- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `docs/Knowledge-Bases/generic-types.md`
- `docs/Knowledge-Bases/galerina-tensor-arity-decision.md`
