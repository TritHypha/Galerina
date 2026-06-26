# Galerina Tri Logic

Ownership note: `galerina-core` may document syntax and compiler checking for `Tri`
and `Galerina`, but detailed logic semantics, conversion rules, truth tables and
logic reports belong in `packages-galerina/galerina-core-logic/`.

Current v0.2 package contract: use `packages-galerina/galerina-core-logic/README.md`
and `docs/Knowledge-Bases/galerina-core-logic-tri-decision-bool.md` as canonical
for runtime-facing docs. That shape uses `TriState` with `kind`, `Decision` with
`allow | deny | review | unknown`, evidence arrays, and fail-closed conversion
to runtime Bool. Older examples in this file are language-explanatory and should
not override the package contract.

## Summary

Most programming languages use two-state Boolean logic:

```text
true
false
```

Galerina should support normal Boolean logic, but it should also support three-state logic:

```text
true
false
unknown
```

This can be represented with:

```Galerina
Bool
Tri
Galerina
```

Recommended meaning:

```text
Bool      = normal two-state logic
Tri       = standard three-state logic
Galerina  = future N-state / omni logic
```

---

## Core Principle

```text
Bool is for two-state decisions.
Tri is for three-state decisions.
Galerina is for future multi-state logic.
```

---

# 1. Why Tri Logic Exists

Boolean logic is useful when every answer is clearly:

```text
true
false
```

But many real systems need a third state.

Examples:

```text
yes
no
unknown
```

```text
allow
deny
review
```

```text
valid
invalid
not_checked
```

```text
available
unavailable
not_known
```

With only `Bool`, developers often use unsafe workarounds such as:

```text
null
undefined
-1
"maybe"
"unknown"
```

Galerina should avoid that by making the third state explicit.

---

# 2. Bool

`Bool` is normal two-state logic.

```Galerina
let isActive: Bool = true
let isDeleted: Bool = false
```

Possible values:

```text
true
false
```

Use `Bool` when the answer must be exactly yes or no.

Good use cases:

```text
button is enabled
user is logged in
record is deleted
feature flag is on
```

---

# 3. Tri

`Tri` is three-state logic.

```Galerina
let isVerified: Tri = unknown
```

Possible values:

```text
false
unknown
true
```

This means:

```text
false    = definitely false
unknown  = not enough information
true     = definitely true
```

---

## Example

```Galerina
pure flow hasVerifiedEmail(user: User) -> Tri {
  if user.emailVerified == true {
    return true
  }

  if user.emailVerified == false {
    return false
  }

  return unknown
}
```

This is clearer than returning `null`.

---

# 4. Tri Is Not Null

`unknown` is not the same as `null`.

```text
null      = no value
unknown   = known value meaning not yet known / undecided / indeterminate
```

Example:

```Galerina
let result: Tri = unknown
```

This means the result exists, but the answer is not currently known.

---

# 5. Tri for Security Decisions

Tri logic is useful for security because not every decision should be forced into true or false.

Example:

```text
Allow
Deny
Review
```

Galerina could define this as a custom logic type:

```Galerina
logic AccessDecision {
  Deny
  Review
  Allow
}
```

This avoids unsafe behaviour such as:

```text
unknown accidentally becomes allow
```

Recommended security rule:

```text
Unknown or Review should never silently become Allow.
```

---

# 6. Tri for Validation

Example:

```Galerina
logic ValidationState {
  Invalid
  NotChecked
  Valid
}
```

This is clearer than:

```Galerina
let isValid: Bool = false
```

because `false` could mean either:

```text
invalid
not checked yet
```

Tri logic separates these cases.

---

# 7. Tri Ordering

Galerina may define a default order:

```text
false < unknown < true
```

This allows some operations to be defined consistently.

Example:

```text
false    = 0
unknown  = 1
true     = 2
```

However, custom logic types may define their own order.

Example:

```Galerina
logic RiskLevel {
  Low
  Medium
  High
  Critical
}
```

---

# 8. Tri NOT

For normal Boolean logic:

```text
not true  = false
not false = true
```

For Tri logic:

```text
not true     = false
not false    = true
not unknown  = unknown
```

Example:

```Galerina
let a: Tri = unknown
let b: Tri = tri.not(a)
```

Result:

```text
unknown
```

---

# 9. Tri OR

Using the order:

```text
false < unknown < true
```

`or` returns the strongest true-like value.

Truth table:

| A | B | A OR B |
|---|---|---|
| false | false | false |
| false | unknown | unknown |
| false | true | true |
| unknown | false | unknown |
| unknown | unknown | unknown |
| unknown | true | true |
| true | false | true |
| true | unknown | true |
| true | true | true |

Example:

```Galerina
let result: Tri = tri.or(false, unknown)
```

Result:

```text
unknown
```

---

# 10. Tri AND

Using the order:

```text
false < unknown < true
```

`and` returns the weakest false-like value.

Truth table:

| A | B | A AND B |
|---|---|---|
| false | false | false |
| false | unknown | false |
| false | true | false |
| unknown | false | false |
| unknown | unknown | unknown |
| unknown | true | unknown |
| true | false | false |
| true | unknown | unknown |
| true | true | true |

Example:

```Galerina
let result: Tri = tri.and(true, unknown)
```

Result:

```text
unknown
```

---

# 11. Tri NOR

NOR is a logic operation, not a type.

For Boolean logic:

```text
NOR(a, b) = NOT(a OR b)
```

For Tri logic:

```Galerina
pure flow triNor(a: Tri, b: Tri) -> Tri {
  return tri.not(tri.or(a, b))
}
```

Truth table:

| A | B | A OR B | NOR |
|---|---|---|---|
| false | false | false | true |
| false | unknown | unknown | unknown |
| false | true | true | false |
| unknown | false | unknown | unknown |
| unknown | unknown | unknown | unknown |
| unknown | true | true | false |
| true | false | true | false |
| true | unknown | true | false |
| true | true | true | false |

Important:

```text
NOR is a gate/function/operator.
Tri is the value type.
```

So Galerina should prefer:

```Galerina
tri.nor(a, b)
```

not:

```Galerina
TriN
```

---

# 12. Recommended Naming

Use:

```Galerina
Bool
Tri
Galerina
```

Avoid using unclear names such as:

```Galerina
BooleanN
TriN
```

Reason:

```text
BooleanN could mean N booleans, a bit array, or N-state Boolean logic.
TriN could mean ternary NOR, N ternary values, or N-state ternary logic.
```

Clearer model:

```Galerina
Bool      // 2-state
Tri       // 3-state
Galerina  // N-state
```

---

# 13. Galerina

`Galerina` is the future omni-logic model.

It allows Galerina to support more than three states later.

Example:

```Galerina
Logic<5>
```

Could represent five states.

But for developer-friendly code, named logic types are better:

```Galerina
logic RiskLevel {
  VeryLow
  Low
  Review
  High
  Critical
}
```

This is easier to understand than:

```Galerina
Logic<5>
```

---

# 14. Bool as Logic<2>

Galerina can internally treat:

```Galerina
Bool
```

as:

```Galerina
Logic<2>
```

Meaning:

```text
Bool = Logic<2>
Tri  = Logic<3>
```

This gives Galerina a clean path from normal logic to future omni logic.

---

# 15. Custom Logic Types

Galerina should allow named custom logic types.

Example:

```Galerina
logic Decision {
  Deny
  Review
  Allow
}
```

Example use:

```Galerina
pure flow decideAccess(user: User) -> Decision {
  if user.isBlocked {
    return Deny
  }

  if user.isVerified == false {
    return Review
  }

  return Allow
}
```

This is clearer than returning `Bool`.

---

# 16. Pattern Matching with Tri Logic

Tri values should be handled exhaustively.

Example:

```Galerina
let verified: Tri = hasVerifiedEmail(user)

match verified {
  true    => allowEmailFeatures()
  false   => denyEmailFeatures()
  unknown => requestVerification()
}
```

Galerina should warn if a branch is missing.

Bad:

```Galerina
match verified {
  true  => allowEmailFeatures()
  false => denyEmailFeatures()
}
```

Compiler warning:

```text
match is not exhaustive.
Missing branch:
  unknown
```

---

# 17. Safe Defaults

Galerina should avoid unsafe conversion from `Tri` to `Bool`.

Bad:

```Galerina
let allowed: Bool = hasPermission(user)
```

if `hasPermission()` returns `Tri`.

Galerina should require explicit handling:

```Galerina
let decision: Tri = hasPermission(user)

match decision {
  true    => allow()
  false   => deny()
  unknown => holdForReview()
}
```

Rule:

```text
Tri must not silently collapse into Bool.
```

---

# 18. Converting Tri to Bool

Sometimes conversion is needed.

Galerina should require explicit conversion policy.

Examples:

```Galerina
let allowed: Bool = tri.toBool(decision, unknown_as: false)
```

or:

```Galerina
let allowed: Bool = tri.requireKnown(decision)?
```

Recommended options:

```text
unknown_as false
unknown_as true
unknown_as error
unknown_as review
```

Security default:

```text
unknown_as false
```

or:

```text
unknown_as error
```

---

# 19. Tri in APIs

Tri can be useful in API responses.

Example:

```Galerina
type VerificationStatus {
  email: Tri
  phone: Tri
}
```

Response:

```json
{
  "email": "true",
  "phone": "unknown"
}
```

This is clearer than:

```json
{
  "email": true,
  "phone": null
}
```

---

# 20. Tri in Databases

Tri values can be stored explicitly.

Example:

```text
true
false
unknown
```

or as an enum:

```text
TRUE
FALSE
UNKNOWN
```

Galerina should not store `unknown` as SQL `NULL` unless explicitly configured.

Reason:

```text
NULL means missing value.
unknown means known third state.
```

---

# 21. Tri in Compute

Tri logic should mostly be handled by CPU/exact logic.

It may be used with future photonic or multi-state hardware, but Galerina should not require special hardware for Tri.

Important rule:

```text
Tri is a language-level logic type.
It is not automatically photonic.
```

Photonic or multi-state hardware may optimise suitable logic later, but Tri should work everywhere.

---

# 22. Tri and Photonic / Omni Logic

Galerina originally considers future compute targets such as:

```text
binary CPU
GPU
AI accelerator
photonic accelerator
multi-state / wavelength logic
```

Tri logic fits the long-term direction because it does not assume every decision is binary.

However:

```text
Tri does not require photonic hardware.
Tri should compile safely to normal CPU code.
Photonic support may optimise future multi-state logic where suitable.
```

---

# 23. Recommended Syntax

Basic:

```Galerina
let state: Tri = unknown
```

Function:

```Galerina
pure flow isVerified(user: User) -> Tri {
  if user.verifiedAt.exists() {
    return true
  }

  if user.verificationFailed {
    return false
  }

  return unknown
}
```

Custom logic:

```Galerina
logic Decision {
  Deny
  Review
  Allow
}
```

Map:

```Galerina
match decision {
  Deny   => deny()
  Review => holdForReview()
  Allow  => allow()
}
```

NOR:

```Galerina
let result: Tri = tri.nor(a, b)
```

Future N-state:

```Galerina
logic RiskLevel {
  VeryLow
  Low
  Review
  High
  Critical
}
```

---

# 24. Security Rules

Galerina should enforce:

```text
Tri cannot silently convert to Bool.
Unknown cannot silently become Allow.
match over Tri should be exhaustive.
Security decisions should explicitly handle unknown/review states.
Tri should not be stored as null unless configured.
```

---

# 25. Reports

Galerina should include Tri usage in reports where useful.

Example:

```json
{
  "logicReport": {
    "triValues": [
      {
        "flow": "hasPermission",
        "source": "src/security/access.spore:8",
        "returnType": "Tri",
        "requiresExhaustiveMatch": true
      }
    ],
    "unsafeConversions": []
  }
}
```

---

# 26. AI Guide Integration

Generated AI guide section:

```markdown
## Tri Logic

Galerina uses `Tri` for three-state logic:

- `true`
- `false`
- `unknown`

Do not convert `Tri` to `Bool` without an explicit policy.

Security rule:
`unknown` must not become `Allow` by default.

Use exhaustive `match` blocks for `Tri` values.
```

---

# 27. Non-Goals

Tri logic should not:

```text
replace Bool everywhere
make simple true/false code harder
silently collapse unknown into false
silently collapse unknown into true
require photonic hardware
be confused with a NOR gate
be named TriN
```

---

# 28. Open Questions

```text
Should Tri values be lowercase: true, false, unknown?
Should Tri use custom names: False, Unknown, True?
Should Bool internally be Logic<2>?
Should Tri internally be Logic<3>?
Should custom logic types require an order?
Should unknown_as false be the security default?
Should Tri be serialised as string values in JSON?
Should Tri be allowed in database schemas as enum values?
```

---

# Recommended Early Version

## Version 0.1

```text
Bool
Tri
true / false / unknown
tri.not()
tri.and()
tri.or()
tri.nor()
exhaustive match checks
no silent Tri-to-Bool conversion
```

## Version 0.2

```text
custom logic types
Galerina
logic reports
database serialisation rules
JSON serialisation rules
```

## Version 0.3

```text
security decision integration
policy checks for unknown/review states
AI guide logic summaries
future multi-state/omni logic planning
```

---

# Final Principle

Galerina should support normal Boolean logic and explicit three-state logic.

Final rule:

```text
Use Bool for true/false.
Use Tri for true/false/unknown.
Use custom logic types for business/security states.
Use Galerina for future omni logic.
Treat NOR as an operation, not a type.
Never let unknown silently become allow.
```
````
