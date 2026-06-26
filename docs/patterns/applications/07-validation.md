# Galerina Application Pattern 07 — Validation and Gates

**When to use:** Every boundary input — email, postcode, age, NHS number, currency amount, phone number

---

## Galerina Validation Gates

Validation gates are the canonical mechanism for transitioning a value from `unsafe` to `protected`. The standard library provides built-in gates for common formats.

```galerina
let raw: unsafe String = request.body("email")
let email: protected Email = validate.email(raw)?
```

The `?` propagates a `ValidationError` if the gate rejects the value. The returned type is `protected Email`, not `protected String` — the type carries the domain meaning.

Additional built-in gates:

```galerina
validate.postcode(raw)?         → protected Postcode
validate.nhsNumber(raw)?        → protected NhsNumber
validate.phone(raw)?            → protected PhoneNumber
validate.currency(raw)?         → protected CurrencyAmount
validate.age(raw, min: 0, max: 150)?  → protected Age
validate.url(raw)?              → protected Url
validate.uuid(raw)?             → protected Uuid
```

---

## Custom Validation Gates

User-defined gates follow naming conventions that the compiler recognises as taint-breaking. Recognised prefixes:

| Prefix | Example | Notes |
|--------|---------|-------|
| `validate*` | `validateOrderRef` | Primary gate prefix |
| `sanitize*` | `sanitizeHtml` | Output safe for rendering |
| `check*` | `checkPostcode` | Returns `Bool`; does not produce protected value unless return type is explicit |
| `verify*` | `verifySignature` | Typically used for cryptographic verification |

A custom gate must declare its output type as `protected T` to participate in taint tracking:

```galerina
fn validateOrderRef(raw: unsafe String) -> Result<protected OrderRef, ValidationError> {
  // must match /^ORD-[0-9]{8}$/
}
```

If a function accepts `unsafe` input and returns a plain (non-protected) type, the compiler treats it as a transformation, not a gate — the taint is not broken.

---

## Proposed `validate` Block (Future)

Phase 17 introduces a declarative `validate` block that compiles to the gate function above:

```galerina
validate Email {
  must match EmailFormat
  must not be empty
  must not exceed 255 chars
}
```

The compiler generates `validate.Email(raw)?` from this declaration and registers the type in `stdlib-gates.yaml`. Validation rules become part of the GIR and are included in the runtime report.

---

## Value-State Transitions

Galerina tracks three value states:

| State | Meaning | Example |
|-------|---------|---------|
| `unsafe` | Untrusted, boundary input | `request.body("email")` |
| `protected` | Passed through a recognised gate | `validate.email(raw)?` |
| `redacted` | Suitable for audit/log output | `redact(email)` |

The transition `unsafe → protected` occurs only at a gate. No other operation promotes a value.

---

## What Breaks the Taint Chain

These operations break the taint chain (promote `unsafe` to `protected`):

- `validate.*` — stdlib gate
- `sanitize.*` — named sanitiser function
- `redact()` — produces `redacted` variant (for audit use)
- Any user function returning `protected T`

These operations do **not** break the taint chain:

```galerina
raw.trim()       // still unsafe
raw.toLower()    // still unsafe
raw.slice(0, 5)  // still unsafe
```

String transformations preserve the taint state of their input. A value that was `unsafe` before `.trim()` is `unsafe` after it.

---

## Compiler Enforcement

| Code | Trigger |
|------|---------|
| `SPORE-VALUESTATE-003` | `unsafe` value passed to a function that requires `protected` |
| `SPORE-VALUESTATE-005` | `unsafe` value written to a `protected`-typed binding |

The compiler emits these errors at the point of misuse, not at the gate. The error message names the nearest upstream gate that would resolve the issue.

---

## Validation at Resource Boundary vs Flow Boundary

**Resource boundary** — the outer edge of the system (HTTP, file, CLI, queue):

```galerina
entry POST "/register" {
  let raw = request.body("email")           // unsafe
  let email = validate.email(raw)?          // protected — gate here
  createUser(email)
}
```

**Flow boundary** — between internal flows where a protected value is re-validated for a narrower domain:

```galerina
guarded flow processPayment(email: protected Email) {
  // email is already protected; no re-validation needed
  // but amount may need a narrower gate:
  let amount = validate.currency(raw)?
}
```

Prefer validating at the resource boundary. Only re-validate at a flow boundary when the narrower domain type matters.

---

## `stdlib-gates.yaml` — Canonical Gate Registry

All known gates are declared in `stdlib-gates.yaml`. The compiler reads this file at build time to resolve gate names and expected return types.

```yaml
gates:
  - name: validate.email
    input: unsafe String
    output: protected Email
    error: ValidationError
  - name: validate.postcode
    input: unsafe String
    output: protected Postcode
    error: ValidationError
```

Third-party gates can be registered in a project-local `gates.yaml` and referenced in `galerina.toml`:

```toml
[gates]
extend = ["gates.yaml"]
```

The compiler merges project gates with stdlib gates and validates that all declared return types exist in the type registry.
