# Galerina Phase 11A.2 — mut Reassignment Enforcement

## Status

```
Phase:     11A.2 — Implemented
Scope:     mut reassignment enforcement in flow bodies
Diagnostic: SPORE-BINDING-005 (IMMUTABLE_BINDING_REASSIGNED)
Checker:   packages-galerina/galerina-core-compiler/src/type-checker.ts
See also:  galerina-phase-11-decisions.md (Decision 2), value-state-annotations.md,
           galerina-naming-conventions.md (let vs mut guidance),
           controlled-mutation-model.md
```

## TL;DR

- `let` and `readonly` bindings are immutable — reassignment is a compile error
- `mut` bindings are mutable — reassignment is allowed
- `mut` bindings are type-stable — the type cannot change on reassignment (Phase 11A.3)

---

## Rules

```galerina
let count: Int = 0
count = 5              // SPORE-BINDING-005: Cannot reassign immutable let binding

mut total: Int = 0
total = total + 1      // OK — mut allows reassignment

readonly request: Request
request = otherRequest // SPORE-BINDING-005: Cannot reassign readonly binding
```

---

## Diagnostic: SPORE-BINDING-005

```text
Code:     SPORE-BINDING-005
Name:     IMMUTABLE_BINDING_REASSIGNED
Severity: error

Cannot reassign an immutable 'let' or 'readonly' binding.
Use 'mut' if reassignment is intended.
```

**Suggested fix:**
Change the declaration to: `mut bindingName: Type = initialValue`

---

## Relationship to Other BINDING Diagnostics

| Code | Name | Description |
|---|---|---|
| SPORE-BINDING-001 | BindingReassignment | let/readonly reassigned (validateCoreSyntaxSafety) |
| SPORE-BINDING-002 | ReadonlyMutation | readonly reassigned |
| SPORE-BINDING-003 | ReadonlyPropertyMutation | property mutation via readonly ref |
| SPORE-BINDING-004 | MutInPureContext | mut binding in pure flow |
| **SPORE-BINDING-005** | **ImmutableBindingReassigned** | **let/readonly = value in flow body** |

---

## Why mut is Type-Stable

```galerina
mut count: Int = 0
count = "five"         // SPORE-TYPE-002: cannot change Int to String (Phase 11A.3)
```

`mut` allows value changes, not type changes. The binding type is fixed at declaration.

---

## See Also

- `galerina-phase-11-decisions.md` — Decision 2 (mut reassignment)
- `value-state-annotations.md` — unsafe/safe/validated state
- `galerina-naming-conventions.md` — when to use let vs mut
