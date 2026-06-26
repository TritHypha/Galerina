# Galerina Phase 11B — Two-Hop Taint Propagation

## Status

```
Phase 11B.1 — Implementation
Extends: value-state-checker.ts
New diagnostic: SPORE-VALUESTATE-005 (DERIVED_UNSAFE_VALUE_AT_SINK)
```

## TL;DR

- Phase 6 catches `unsafe rawEmail` at a governed sink directly
- Phase 11B catches `unsafe rawEmail` → `let cleaned = rawEmail.trim()` → sink (the "laundered value" pattern)
- Validation gates (`validate.*`, `redact()`) break the taint chain — the value becomes safe/protected

---

## The Problem: Laundered Unsafe Values

Currently (Phase 6), this fires:
```galerina
unsafe let rawId: String = request.params.id
UsersDB.find(rawId)   // SPORE-VALUESTATE-003: unsafe at sink ✓
```

But this does NOT fire (Phase 6 miss):
```galerina
unsafe let rawId: String = request.params.id
let cleaned: String = rawId.trim()    // cleaned is derived from rawId — still tainted
UsersDB.find(cleaned)                 // SHOULD fire but doesn't in Phase 6
```

SQL injection and similar attacks pass through string methods without the unsafe taint being cleared.

---

## The Fix: Derived Taint Tracking

Phase 11B tracks two sets:
```
unsafeBindings  = { rawId, rawEmail, ... }   ← declared with unsafe let
taintedBindings = { cleaned, processed, ... } ← derived from unsafe/tainted bindings
```

A binding is added to `taintedBindings` when its init expression:
- References an unsafe binding directly
- References another tainted binding
- Calls a method on a tainted receiver (`.trim()`, `.toLower()`, `.replace()`, etc.)
- Uses a tainted value in binary expression (`"prefix" + tainted`)

### Taint Chain Breakers

These operations CLEAR the taint:
```galerina
let safe = validate.email(rawEmail)?      // validation gate → protected Email (not tainted)
let redacted = redact(email)              // redaction → redacted type (not tainted)
let literal: String = "constant"          // literal value → never tainted
```

---

## New Diagnostic: SPORE-VALUESTATE-005

```text
Code:     SPORE-VALUESTATE-005
Name:     DERIVED_UNSAFE_VALUE_AT_SINK
Severity: error

A value derived from an unsafe binding reached a governed sink.
Even after transformation (e.g. .trim(), .replace()), a value derived from unsafe
input is still tainted.
```

**Why** (Elm-style):
SQL injection and similar attacks pass through `.trim()`, `.replace()`, and `.toLowerCase()`.

**Suggested fix:**
Use a validation gate (`validate.*`, `sanitize.*`) to transform the unsafe value into a
safe/validated type before using it at a governed sink.

---

## Examples

### Caught by 11B.1 (SPORE-VALUESTATE-005)

```galerina
// Direct SQL injection via laundered value
guarded flow search(readonly request: Request) -> String
effects [database.read] {
  unsafe let rawQuery: String = request.params.query
  let cleaned: String = rawQuery.trim()       // still tainted
  let data = UsersDB.query(cleaned)            // SPORE-VALUESTATE-005
  return "ok"
}
```

```galerina
// Multi-hop taint
unsafe let raw: String = request.body.value
let step1: String = raw.trim()
let step2: String = step1.toLower()
UsersDB.insert(step2)   // SPORE-VALUESTATE-005 — taint propagated 2 hops
```

### NOT caught (correct behaviour — gate breaks chain)

```galerina
unsafe let rawQuery: String = request.params.query
let safeQuery: String = validate.searchQuery(rawQuery)?  // gate breaks taint
let data = UsersDB.query(safeQuery)                      // no error ✓
```

---

## Taint Propagation Rules

| Expression | Taint behaviour |
|---|---|
| `unsafe let x` | x is tainted (unsafe binding) |
| `let y = taintedExpr` | y is tainted |
| `let y = x.trim()` | y is tainted if x is tainted |
| `let y = a + b` | y is tainted if a or b is tainted |
| `let y = validate.*(tainted)?` | y is NOT tainted (gate breaks chain) |
| `let y = redact(tainted)` | y is NOT tainted |
| `let y = "literal"` | y is NOT tainted |
| `let y: protected Email = validated` | y is NOT tainted (validated is not unsafe) |

---

## Relationship to Existing Diagnostics

| Code | Description | Phase |
|---|---|---|
| SPORE-VALUESTATE-003 | Direct unsafe binding at governed sink | Phase 6 ✅ |
| SPORE-VALUESTATE-004 | Tainted string concatenation | Phase 6 ✅ |
| SPORE-VALUESTATE-005 | Derived/laundered unsafe value at sink | Phase 11B.1 |

---

## See Also

- `value-state-annotations.md` — value-state type system
- `value-state-checker.md` — checker implementation spec
- `galerina-phase-11-decisions.md` — Phase 11 implementation decisions
