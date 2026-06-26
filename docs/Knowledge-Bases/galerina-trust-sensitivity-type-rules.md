# Galerina — Trust, Sensitivity, and Collection Type Rules

## Status

```
Proposed — High Priority
Type system clarification
Phase 9B implementation target
```

## TL;DR
- Trust (validated?) and sensitivity (restricted access?) are independent axes — they must never be conflated
- `unsafe let` = trust state; `protected` = sensitivity state; domain types (`Email`) = validated meaning
- `Array<protected Email>` = trusted array of sensitive elements; `protected Array<Email>` = sensitive collection of trusted elements

---

## Core Principle

Trust and sensitivity are **different things**. A value may be:

| Trust | Sensitivity | Example |
|---|---|---|
| Untrusted | Sensitive | `unsafe let rawEmails: protected Array<String>` |
| Trusted | Sensitive | `let email: protected Email = validate.email(raw)?` |
| Trusted | Not sensitive | `let count: Int = users.length` |
| Untrusted | Not sensitive | `unsafe let rawCount: String = request.body.count` |

---

## The Two Axes

### Trust axis: `unsafe let` / `safe mut`

Describes: **Has this value been validated?**

```galerina
// Untrusted — boundary origin
unsafe let rawEmail: String = request.body.email

// Trusted after gate
let email: protected Email = validate.email(rawEmail)?
```

### Sensitivity axis: `protected` / `redacted`

Describes: **Should access be restricted?**

```galerina
protected Email          // valid, sensitive
protected PatientRecord  // valid, sensitive
protected Array<Email>   // sensitive collection of valid emails
```

**Key rule:** A value may be `unsafe` AND `protected` simultaneously:
```galerina
// Untrusted AND sensitive — this is valid and meaningful
unsafe let rawEmails: protected Array<String> = request.body.emails
```

---

## Domain Types

Domain types represent validated meaning. `Email`, `PatientId`, `CustomerId`, `NhsNumber` all imply validation.

### Critical rule: domain types cannot be assigned from raw values

```galerina
// WRONG — Email implies validation, unsafe let contradicts this
unsafe let email: Email = request.body.email    // SPORE-TYPE-003

// WRONG — Array<Email> implies validated elements
unsafe let emails: Array<Email> = request.body.emails  // SPORE-TYPE-003

// CORRECT — String is the raw type, validation produces Email
unsafe let rawEmail: String = request.body.email
let email: protected Email = validate.email(rawEmail)?
```

---

## Collection Type Rules

### `Array<Email>`
Standard collection of `Email` values. Each element is a validated Email.

### `Array<protected Email>`
Collection of protected Email values. Each element is sensitive.

```galerina
let emails: Array<protected Email> = validate.emails(rawEmails)?
```

### `protected Array<Email>`
The **collection itself** is sensitive (e.g. patient email list from DB).

```galerina
let patientEmails: protected Array<Email> = PatientDB.loadEmails()?
```

### `protected Array<protected Email>`
Sensitive collection containing sensitive elements.

```galerina
let emails: protected Array<protected Email> = PatientDB.loadEmails()?
```

### Visual model

```
protected Array<protected Email>

┌─────────────────────────────┐
│ Protected Collection        │
│                             │
│  Email (protected)          │
│  Email (protected)          │
│  Email (protected)          │
│                             │
└─────────────────────────────┘
```

---

## Unsafe + Protected Together

This is valid and meaningful:

```galerina
// Untrusted input that is known to contain sensitive data
unsafe let rawEmails: protected Array<String> = request.body.emails
```

The data is:
- **Untrusted** — not yet validated
- **Sensitive** — contains PII even before validation

After validation:
```galerina
// Trusted and sensitive
let emails: Array<protected Email> = validate.emails(rawEmails)?
```

State transition: `unsafe + protected String` → `trusted + protected Email`

---

## No Wildcards

`Array<*>` should not be used. Wildcards weaken type checking, security, and governance.

Instead:
- `Array<Unknown>` — element type unknown at boundary
- `Array<Auto>` — let compiler infer

```galerina
unsafe let values: Array<Unknown> = json.decode(raw)?
```

---

## Compiler Rules

| Expression | Status | Reason |
|---|---|---|
| `unsafe let rawEmails: protected Array<String>` | ✅ Allowed | Untrusted + sensitive is valid |
| `let emails: Array<protected Email>` | ✅ Allowed | Trusted + sensitive elements |
| `protected Array<protected Email>` | ✅ Allowed | Sensitive collection + sensitive elements |
| `unsafe let email: Email = request.body.email` | ❌ SPORE-TYPE-003 | Domain type implies validation |
| `unsafe let emails: Array<Email> = request.body.emails` | ❌ SPORE-TYPE-003 | Array<Email> implies validated elements |
| `unsafe let id: CustomerId = request.body.id` | ❌ SPORE-TYPE-003 | Brand type implies validation |

---

## AI Understanding Model

```text
unsafe let  =  trust state (not yet validated)
protected   =  sensitivity state (access restricted)
Email       =  validated domain type (implies trust)
Array<T>    =  container (carries both independently)
```

---

## See Also

- `docs/Knowledge-Bases/value-state-annotations.md` — unsafe/protected/redacted
- `docs/Knowledge-Bases/formal-type-system-spec.md` — type system
- `docs/Knowledge-Bases/galerina-type-improvements-phase-8.md` — SPORE-TYPE-003
- `docs/Knowledge-Bases/generic-types.md` — collection types
