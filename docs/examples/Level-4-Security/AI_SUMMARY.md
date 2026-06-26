## What this level teaches

- `unsafe let` as the mandatory marker for values arriving from an external trust boundary
- Validation gates: `validate.email(raw)?`, `validate.patientId(raw)?`, `validate.nhsNumber(raw)?`
- `protected` values: validated and trusted within the system, cannot leak to external sinks without `redact()`
- `redact(value)`: converts `protected T` to `redacted T` for safe use in audit logs and external outputs
- `AuditLog.write(...)` patterns — canonical usage and common mistakes
- Why tainted (unsafe) values cannot flow into governed database or network sinks
- Secret handling: `SecureString`, why `==` is forbidden on secrets, `constantTimeEquals(...)` for safe comparison
- Preventing secret serialization (`SPORE-SECRET-003`)
- SQL injection via string concatenation (`SPORE-VALUESTATE-004`)
- Validation chains for multiple protected values

## Canonical patterns

```spore
// Trust-boundary pattern: unsafe -> validate -> protected -> redact -> audit
secure flow createUser(request: Request) -> CreateUserResult
contract {
  types { type CreateUserResult = Result<UserId, UserError> }
  intent { "Create a user from an HTTP request, treating all request body fields as unsafe." }
  effects {
    database.write
    audit.write
  }
}
{
  unsafe let rawEmail: String    = request.body.email
  let email: protected Email     = validate.email(rawEmail)?
  let userId                     = UsersDB.insert({ email: email })?
  AuditLog.write({ email: redact(email) })
  return Ok(userId)
}
```

```spore
// Correct secret comparison — never use == on SecureString
let match: Bool = constantTimeEquals(storedKey, suppliedKey)
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- `contract set` (Level 5)
- `compute target` blocks (Level 6)
- `authority` blocks (Level 9)
- Passing `protected` values directly to `AuditLog.write` without `redact()` — triggers `SPORE-VALUESTATE-001`
- Comparing `SecureString` with `==` — triggers `SPORE-SECRET-002`
- String concatenation that includes `unsafe` bindings as query input — triggers `SPORE-VALUESTATE-004`

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-VALUESTATE-001` | Protected value passed directly to an audit or log sink without `redact()` |
| `SPORE-VALUESTATE-003` | Unsafe binding flows into a governed sink (database, network) without validation |
| `SPORE-VALUESTATE-004` | Tainted value propagation — unsafe binding used in string concatenation |
| `SPORE-VALUESTATE-005` | Unsafe binding assigned to a non-unsafe binding without validation |
| `SPORE-SECRET-001` | Secret value flows to a non-secret sink |
| `SPORE-SECRET-002` | Direct equality comparison on a secret — use `constantTimeEquals()` |
| `SPORE-SECRET-003` | Secret value serialized or written to a log/response |

## Example IDs at this level

151-http-request-boundary, 152-file-boundary, 153-environment-boundary, 154-validate-email, 155-validate-patient-id, 156-validate-nhs-number, 157-invalid-email-assignment, 158-redact-email, 159-redact-patient-id, 160-protected-not-redacted, 161-safe-audit-log, 162-invalid-audit-log, 163-unsafe-audit-log, 164-safe-database-write, 165-unsafe-database-write, 166-safe-network-send, 167-unsafe-network-send, 168-redacted-network-send, 169-secret-comparison, 170-constant-time-comparison, 171-protected-console-log, 172-secret-console-log, 173-validation-chain, 174-multiple-protected-values, 175-security-summary-example, 176-sql-injection-concat, 177-secret-serialization
