# match Catch-All Arm (_ =>)

## Purpose

The `match` catch-all arm handles every value that was not matched by earlier
arms.

In Galerina syntax, the catch-all is the `_ =>` arm written inside the closing
`}` of the `match` block:

```galerina
match value {
  KnownCase => { ... }
  _ => { ... }  // anything else goes here
}
```

## Example

```galerina
match payload.event {
  "payment.succeeded" => {
    Payments.markOrderPaid(payload.orderId, payload.amount)
  }

  "payment.failed" => {
    Payments.markOrderFailed(payload.orderId)
  }

  _ => {
    Log.safe("Ignored unknown payment webhook event")

    return Ok({
      received: true,
      duplicate: false,
      ignored: true
    })
  }
}
```

If `payload.event` is neither `"payment.succeeded"` nor `"payment.failed"`,
Galerina runs the `_ =>` arm.

## Meaning

| Syntax | Meaning |
| --- | --- |
| `"payment.succeeded" => { ... }` | Run when the value equals `"payment.succeeded"` |
| `"payment.failed" => { ... }` | Run when the value equals `"payment.failed"` |
| `_ => { ... }` | Run for anything else |

## Security Rule

The `_ =>` arm must not silently hide unknown security-sensitive cases.

For webhooks, external events, payment states, auth states, permissions,
`Tri`, `Decision`, `Result<T, E>` and other security-sensitive matches, the
`_ =>` arm should do one of these:

- return a typed error
- return an explicit ignored response
- log a safe redacted event
- trigger manual review
- fail closed

## Accepted Patterns

Explicitly ignore unknown webhook events:

```galerina
match event.type {
  "payment.succeeded" => handlePaymentSucceeded(event)
  "payment.failed"    => handlePaymentFailed(event)
  _ => {
    Log.safe("Ignored unknown payment webhook event")

    return Ok({
      received: true,
      ignored: true
    })
  }
}
```

Reject unknown webhook events:

```galerina
match event.type {
  "payment.succeeded" => handlePaymentSucceeded(event)
  "payment.failed"    => handlePaymentFailed(event)
  _ => return Err(UnknownWebhookEvent)
}
```

Fail closed for permissions:

```galerina
match permission {
  Permission.Read  => grantRead()
  Permission.Write => grantWrite()
  _ => return Err(SecurityError.denied("Unknown permission decision"))
}
```

## Rejected Pattern

This is unsafe because the unknown case is silently swallowed:

```galerina
match event.type {
  "payment.succeeded" => handlePaymentSucceeded(event)
  _ => { }  // empty — silently ignores unknown events
}
```

This is also unsafe in a security-sensitive flow because it proceeds as if
the unknown case were acceptable:

```galerina
match decision {
  Allow => proceed()
  _ => return Ok(Allowed)  // dangerous: unknown decisions silently allowed
}
```

## Exhaustive match Relationship

For closed enums, `Option<T>`, `Result<T, E>`, `Tri` and `Decision`, Galerina
should prefer exhaustive explicit branches with no `_ =>` needed.

Use `_ =>` when the input is open-ended or externally controlled, such as:

- webhook event names
- external provider status strings
- API version values
- unknown future enum values from another service

Even then, `_ =>` must be explicit and reportable.

## Reports

Galerina should report catch-all arms in:

```text
match-coverage-report.json
webhook-report.json
security-report.json
ai-context-report.json
```

The report should identify:

- which match used a `_ =>` catch-all arm
- whether the matched value is externally controlled
- whether the arm returns an error, ignored response or safe log
- whether the arm is security-sensitive
- whether the arm is allowed by policy

## AI Guidance

AI tools should not remove `_ =>` arms from open-ended external matches. AI
tools should also not add a `_ =>` arm that hides missing cases in a
closed security-sensitive match.

The safe recommendation is:

```text
Use explicit branches for known closed states.
Use _ => only as an explicit fallback for unknown open-ended values.
Make the fallback observable, typed and safe.
```
