# Galerina Doc Comment Standard

## Status

```
Adopted — Phase 8A
Applies to: flow declarations, type declarations, record declarations
```

## TL;DR
- Use `/// @tag` structured doc comments on flows and types — not prose everywhere
- Inline `//` comments for trust/security transitions only (`// Boundary input: unsafe until validated`)
- The code shape itself (unsafe let, protected, effects, intent) is the primary AI signal

---

## Principle

The most important AI signal is the **code shape**, not comments:

```galerina
unsafe let rawEmail: String = request.body.email      // code shape: unsafe, boundary
let email: protected Email = validate.email(rawEmail)?  // code shape: gate, protected
effects [database.write, audit.write]              // code shape: declared effects
intent "Create patient record"                     // code shape: intent
```

Comments explain *why* at transition points. They do not replace the governance
declarations that are already present in the source.

---

## Structured Doc Comments (/// @tag)

Use `///` doc comments on declarations. Format: `/// @tag value`

### Required on all public flows

```galerina
/// @summary Boolean helper for checking approval state.
/// @kind pure-logic
/// @ai.intent Determine whether a request should be approved based on its status.
/// @ai.inputs status: ApprovalStatus
/// @ai.output Bool
pure flow isApproved(status: ApprovalStatus) -> Bool {
  return status == Approved
}
```

### Full tag reference

| Tag | Required on | Purpose |
|---|---|---|
| `@summary` | All public flows and types | One-line human + AI description |
| `@kind` | Flows | Logic category (`pure-logic`, `data-access`, `governance`, `ai-inference`, `payment`, `security`) |
| `@ai.intent` | secure/guarded flows | What the flow is for — augments `intent "..."` |
| `@ai.inputs` | All flows with params | Parameter names and types in plain English |
| `@ai.output` | All flows | Return type described plainly |
| `@effects` | Flows with effects | List of effects in plain English |
| `@security` | secure flows | Key security properties (validation, redaction, audit) |
| `@example` | Public utility flows | A valid call example |

### Kind values

| Kind | Used for |
|---|---|
| `pure-logic` | Logic, calculation, transformation with no side effects |
| `data-access` | Database reads and writes |
| `governance` | Policy decisions, approval flows |
| `ai-inference` | AI model calls, embedding, classification |
| `payment` | Financial operations |
| `security` | Authentication, authorisation, secret handling |
| `audit` | Audit log writing, compliance evidence |
| `validation` | Input validation, gate functions |

---

## Full Examples

### Pure utility flow

```galerina
/// @summary Calculate UK VAT on a GBP amount.
/// @kind pure-logic
/// @ai.intent Multiply a monetary amount by the VAT rate to produce the tax amount.
/// @ai.inputs price: Money<GBP>
/// @ai.output Money<GBP>
/// @example calculateVat(Money.gbp("100.00")) -> Money.gbp("20.00")
pure flow calculateVat(price: Money<GBP>) -> Money<GBP> {
  return price * Decimal("0.20")
}
```

### Guarded data flow

```galerina
/// @summary Fetch the current exchange rate for a currency pair.
/// @kind data-access
/// @ai.intent Retrieve an exchange rate from the rates service. Result is fallible.
/// @ai.inputs currency: CurrencyCode
/// @ai.output Result<Decimal, NetworkError>
/// @effects network.outbound
guarded flow fetchRate(currency: CurrencyCode) -> FetchRateResult
contract {
  types {
    type FetchRateResult = Result<Decimal, NetworkError>
  }
  effects {
    network.outbound
  }
}
{
  unsafe let rawResponse: String = http.get("/rates/" + currency)?
  let rate: Decimal = json.decode<Decimal>(rawResponse)?
  return Ok(rate)
}
```

### Secure boundary flow

```galerina
/// @summary Create a new patient record with validated and protected PII.
/// @kind governance
/// @ai.intent Accept an HTTP request, validate all PII fields, write to database, and produce an audit record.
/// @ai.inputs request: Request (contains email, nhsNumber as unsafe boundary inputs)
/// @ai.output Result<Response, ApiError>
/// @effects database.write, audit.write
/// @security
///   - rawEmail validated via validate.email gate before use
///   - email is protected Email — cannot be logged raw
///   - email redacted before AuditLog.write
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
  intent {
    "Create patient record with protected PII handling"
  }
  effects {
    database.write
    audit.write
  }
}
{
  ...
}
```

---

## Inline Comments — Trust and Security Transitions Only

Use simple `//` inline comments when a line crosses a trust boundary or
changes value state. These are the most valuable AI signals in the body:

```galerina
// Boundary input: unsafe until validated.
unsafe let rawEmail: String = request.body.email

// Validation gate: produces protected Email.
let email: protected Email = validate.email(rawEmail)?

// Protected value: cannot reach logs without redact().
let saved = PatientsDB.insert({ email: email })?

// Redaction: safe to include in audit record.
AuditLog.write({ event: "PatientCreated", email: redact(email) })
```

### Inline comment rule

| Comment when | Example |
|---|---|
| Value becomes unsafe | `// Boundary input: unsafe until validated.` |
| Gate produces protected type | `// Validation gate: produces protected Email.` |
| Protected value is stored | `// Protected value: stored in database.` |
| Redaction applied | `// Redaction: safe for audit.` |
| Effect is used | `// Network call: requires network.outbound declared above.` |

### Do NOT inline comment everywhere

```galerina
// Bad: explaining obvious operations
let total: Money<GBP> = subtotal + vat  // adds vat to subtotal

// Good: explaining trust transitions only
unsafe let rawTotal: String = request.body.total  // Boundary: unsafe until parsed
let total: Money<GBP> = Money.gbp(rawTotal)?  // Parsed: safe for arithmetic
```

---

## Type and Record Declarations

```galerina
/// @summary Domain-branded email address type.
/// @ai.intent Represents a validated, sensitivity-aware email address.
/// @security protected qualifier required — cannot be assigned from plain String
type Email = Brand<String, EmailAddress>

/// @summary Patient record for the NHS patient data store.
/// @kind governance
/// @security Contains protected PII — all fields require validation gates
record PatientRecord {
  id:       PatientId
  email:    protected Email
  nhsNo:    protected NhsNumber
  createdAt: Timestamp
}
```

---

## Enum Declarations

```galerina
/// @summary Patient approval status for high-value operations.
/// @ai.intent Status values map directly to governance approval tiers.
enum ApprovalStatus {
  Pending
  Approved
  Rejected
  RequiresManualReview
}
```

---

## What Doc Comments Do Not Replace

Doc comments complement the source — they do not replace:
- `intent "..."` declarations (machine-readable governance)
- `effects [...]` clauses (compiler-enforced)
- `unsafe let` / `protected` / `redacted` annotations (value-state enforcement)
- `compute target { ... }` blocks (execution planning)

The governance declarations are the source of truth. Doc comments add
human/AI-readable explanations on top.

---

## Formatter Rule

The formatter preserves doc comment content but normalises tag indentation
to `/// @tag value` format (no leading spaces after `///`).

---

## See Also

- `docs/Knowledge-Bases/flow-vs-fn-security-model.md` — flow qualifier rules
- `docs/Knowledge-Bases/value-state-annotations.md` — unsafe/protected/redacted
- `docs/Knowledge-Bases/galerina-glossary.md` — canonical terms
- `docs/Knowledge-Bases/ast-value-encoding.md` — how doc comments appear in the AST
