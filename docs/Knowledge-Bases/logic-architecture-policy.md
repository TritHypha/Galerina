# Logic Architecture Policy

## Definition

The **Logic Architecture Policy** defines what belongs in each layer of Galerina and prevents the language from becoming messy as syntax, runtime, and security rules grow.

```text
Syntax expresses intent.
Logic defines rules.
Policy controls authority.
Runtime enforces decisions.
Audit proves what happened.
```

## Layer Responsibilities

| Layer | Responsibility |
|---|---|
| `syntax` | Human/AI readable expression of intent. No hidden behaviour. |
| `logic` | Business and security rules. What is allowed. Not how it runs. |
| `permission` | Authority declarations. Deny-by-default. Explicit allow only. |
| `runtime` | Execution mechanics. Connection, budget, audit path, scheduling. |
| `policy` | Governance rules active for the whole application. |
| `boot/main` | Project startup choices within runtime policy bounds. |

## Policy Rules

### 1. Syntax Must Stay Simple

Readable by humans, AI, and auditors.

Avoid: hidden behaviour, shorthand that hides authority, overloaded words, magic globals, inheritance-style behaviour.

Prefer: explicit names, controlled language, stable terminology, clear operational meaning.

### 2. Logic Must Be Separate From Runtime Mechanics

Business/security logic describes what is allowed. Runtime mechanics decide how it runs.

Example:

```text
permission says: allow db.read

runtime decides: which connection, budget, audit, scheduler path
```

### 3. Permission Is Deny-By-Default

Only explicit `allow` grants authority. Everything else is denied.

### 4. Built-In Rules Belong in boot/main or Runtime Standard

Common rules should not be repeated everywhere:

```text
private view means owner-only
secret cannot be exposed
audit auto-adds actor
context is automatic unless authority-sensitive
```

### 5. Local Flow Logic Should Stay Small

A flow contains business intent, not repeated security plumbing.

```galerina
return Ok(Profile.response { ... })
```

The runtime still checks: response type, view rules, owner rules, permission rules, audit rules.

### 6. Shared State Must Use Vaults

```galerina
SessionVault.write(
  key: session_uuid,
  value: { ... }
)
```

No unsafe global variables.

### 7. Runtime Policy Must Be Auditable

Every important decision must be explainable:

```text
why execution was allowed
what permission was used
what actor triggered it
what data was exposed
what capability was used
what audit event was written
```

### 8. Architecture Must Be Additive

Avoid renaming or removing concepts. Prefer extending:

```text
new view levels
new contexts
new compute targets
new permission types
```

### 9. AI Must Not Guess Architecture

Every concept must be documented and indexed:

```text
actor, view, permission, vault, flow, context, runtime, event
```

## Short Policy

```text
Do not repeat common safety rules.
Do not hide authority.
Do not let runtime behaviour be guessed.
```

---

## Good-Taste Architecture Rules

Good design makes edge cases disappear rather than handling them specially.

```text
Good taste = design the model so edge cases disappear.
```

For Galerina:
```text
boundary input -> unsafe unvalidated
validated input -> safe validated
effects -> declared once
authority -> checked by plan
runtime -> follows simple manifests
```

### Rule 1: No Special-Case Paths

Avoid separate handling for API, webhook, CLI, and queue input. Model them all as:

```galerina
Boundary<T> -> T unsafe unvalidated
```

One model covers all boundary types.

### Rule 2: Keep Authority Flat

Avoid nested permission logic inside flows. Use a prepared authority plan:

```text
flow -> effects -> runtime authority plan -> allow/deny
```

### Rule 3: Avoid Deep Nesting

Prefer early exits and pattern matching:

```galerina
match validate.email(rawEmail) {
  Err(error) => return Api.badRequest(error)
  Ok(email)  => save(email)
}
```

### Rule 4: Small Focused Flows

Instead of one large flow that does everything:

```galerina
// Avoid: one flow doing validation, pricing, payment, stock, email, audit
secure flow handleCheckout(...) { ... }
```

Prefer small composed flows:

```text
validateCheckout
priceOrder
reserveStock
capturePayment
writeAudit
```

### Rule 5: Simple Data Structures

Use manifests and tables rather than runtime discovery:

```text
route table
type manifest
effect graph
authority plan
decoder plan
```

Prefer a plan that is computed once and followed, over conditional branches that
re-discover state at runtime.

### Rule 6: Make Edge Cases Impossible

The type system should remove entire categories of errors:

```text
Option<T>                       — removes null reference errors
Result<T, E>                    — removes hidden exceptions
Enum exhaustive match           — removes missing-branch errors
String unsafe unvalidated       — removes untrusted-input ambiguity
Email safe validated            — removes mixing validated/unvalidated values
Brand<String, "CustomerId">     — removes ID mixing errors
```

```text
Design the type/runtime model so the boring path is also the safe path.
```

This is the "good taste" version of Galerina architecture.
