# Type Qualifiers

## Definition

Galerina v1 has two prefix governance qualifiers for type references:

| Qualifier | Meaning | Example |
|---|---|---|
| `protected` | Value is valid but sensitivity-restricted. It cannot reach logs, audit, responses, or network sinks without an allowed policy or redaction. | `let email: protected Email = validate.email(rawEmail)?` |
| `redacted` | Value has been masked for safe output, audit, and reporting. | `let auditEmail: redacted Email = redact(email)` |

Galerina also retains postfix value-state annotations such as `String unsafe`.
Those annotations describe trust state on the base type; they are not the same
as governance qualifiers.

## Syntax

```galerina
let email: protected Email = validate.email(rawEmail)?
let auditEmail: redacted Email = redact(email)
let rawBody: String unsafe = request.body
```

`protected` and `redacted` are prefix-only:

```galerina
let email: Email protected = value       // invalid
let auditEmail: Email redacted = value   // invalid
```

## They Are Not Types

`protected` and `redacted` are not standalone type names. They qualify a base
type reference. The type checker must validate the base type after stripping
the prefix qualifier.

Compiler rule:

```text
parseTypeString("protected Email") -> qualifier=protected, base=Email
parseTypeString("redacted Email")  -> qualifier=redacted,  base=Email
parseTypeString("Email protected") -> syntax/type qualifier placement error
```

`SPORE-TYPE-001 UnknownType` must not fire for `protected` or `redacted`
themselves. It may fire for the stripped base type:

```galerina
let x: protected MissingType = value
// SPORE-TYPE-001 for MissingType, not for protected
```

## Compiler Enforcement

The compiler pipeline should enforce this order:

1. Parse a type reference and identify a prefix governance qualifier if present.
2. Reject postfix `Email protected` and `Email redacted` placement.
3. Strip `protected` or `redacted` before name resolution.
4. Resolve and validate the base type.
5. Attach the governance qualifier to the semantic type.
6. Enforce assignment and sink rules using the qualifier.

Assignment rules:

| From | To | Result |
|---|---|---|
| `String unsafe` | `protected Email` | Valid only through `validate.email(raw)?` or equivalent gate |
| `protected Email` | `redacted Email` | Invalid direct assignment; use `redact(email)` |
| `redacted Email` | audit/log/report sink | Allowed when sink accepts redacted values |
| `protected Email` | audit/log/report sink | Rejected unless a policy explicitly permits it |

## Canonical Examples

Level 2 examples 057-087 define the canonical domain patterns:

```galerina
// 057-email-type
unsafe let rawEmail: String = request.body.email
let email: protected Email = validate.email(rawEmail)?
```

```galerina
// 061-redacted-email
let auditEmail: redacted Email = redact(email)
```

```galerina
// 062-invalid-redacted-email and 086-protected-not-redacted
let auditEmail: redacted Email = email
// error: protected value cannot be assigned to redacted binding directly
```

```galerina
// 087-protected-email-audit
let auditEmail: redacted Email = redact(email)
AuditLog.write({ email: auditEmail })
```

## Qualifier Table

| Layer | Form | Position | Purpose |
|---|---|---|---|
| Binding-level | `unsafe let name: T = expr` | before binding keyword | Marks boundary-origin immutable data |
| Binding-level | `unsafe mut name: T = expr` | before binding keyword | Marks boundary-origin mutable data |
| Binding-level | `safe mut name = gate(name)?` | before binding keyword | Upgrades an unsafe binding through a recognised gate |
| Binding-level | `readonly name: T = expr` | binding keyword | Prevents reassignment and mutation through the binding |
| Type-level governance | `protected Type` | prefix | Validated but sensitivity-restricted data |
| Type-level governance | `redacted Type` | prefix | Masked safe-output representation |
| Type-level value-state | `String unsafe` | postfix | Base value is untrusted/unvalidated |
| Type-level value-state | `String safe validated` | postfix | Base value has passed validation |
| Type-level value-state | `String secure` / `Secret protected` | postfix/compound policy state | Sensitive data with restricted operations |

## Diagnostics

| Rule | Diagnostic |
|---|---|
| Unknown stripped base type | `SPORE-TYPE-001` |
| Direct assignment from unvalidated raw value to protected domain type | `SPORE-TYPE-002` or domain-specific validation diagnostic |
| Direct assignment from protected value to redacted binding | `SPORE-TYPE-002` |
| Protected value reaches audit/log/network output without redaction | `SPORE-SAFETY-*`, `SPORE-SECRET-*`, or sink-specific policy diagnostic |
| Postfix `Email protected` or `Email redacted` | `SPORE-SYNTAX-*` qualifier placement diagnostic |

## Rule

```text
protected and redacted qualify the governance state of a value.
They do not replace the base type.
Always resolve the base type after stripping the prefix qualifier.
```

