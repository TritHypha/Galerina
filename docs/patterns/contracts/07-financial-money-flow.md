Title: Galerina Contract Pattern — Financial Money Flow

### When to use

Use this pattern when a flow handles monetary values, enforces single-currency arithmetic, and requires BigInt precision throughout. It is required for any payment, transfer, ledger-entry, or pricing flow where floating-point rounding would be unacceptable. Apply it whenever `Money<GBP>` (or any other currency type) appears in the contract and cross-currency operations must be explicitly rejected.

### Correct example

```galerina
flow ProcessPayment(readonly request: Request) -> ProcessPaymentResult {

  contract {

    types {
      PaymentLine = { description: String, amount: Money<GBP> }
      ProcessPaymentResult = {
        paymentId: String,
        total: Money<GBP>,
        currency: String,
        status: String,
        processedAt: Timestamp
      }
    }

    intent = "Accept a GBP payment request, sum the line amounts using BigInt precision, reject any non-GBP values, and persist the transaction."

    request {
      requires request.body is JsonObject
      requires request.body["lines"] is PaymentLine[]
      requires request.body["lines"].length > 0
      requires request.body["currency"] == "GBP"
    }

    response {
      guarantees result.paymentId is String
      guarantees result.total is Money<GBP>
      guarantees result.currency == "GBP"
      guarantees result.status in ["processed", "declined"]
      denies result.total < Money<GBP>(0)
    }

    context {
      requires context.actor is AuthenticatedUser
      requires context.actor.grants contains "payments:write"
    }

    model {
      reads ["payment_methods", "accounts"]
      writes ["payments", "ledger_entries"]
    }

    financial {
      currency: GBP
      precision: bigint
      cross_currency: deny
      rounding: none
      negative_amounts: deny
    }

    effects {
      audit {
        on: always
        level: full
        includes: [result.paymentId, result.total, result.currency, result.status, context.actor.id]
      }

      reports {
        runtime: true
        name: "payment-transaction-report"
        fields: [result.paymentId, result.total, result.currency, context.actor.id, result.processedAt]
        on: write_success
      }
    }

    security {
      classification: restricted
      requires tls: true
    }

    rate_limit {
      per_actor: 20
      window: "1m"
      on_exceed: reject
    }

    on_error {
      emit: AuditEvent(
        type: "payment.failed",
        actor: context.actor,
        reason: error.message
      )
      return: { paymentId: "", total: Money<GBP>(0), currency: "GBP", status: "declined", processedAt: now() }
    }

  }

  let total = sum_money(request.body["lines"].map(l => l.amount))

  if total <= Money<GBP>(0) {
    return { paymentId: "", total: Money<GBP>(0), currency: "GBP", status: "declined", processedAt: now() }
  }

  let payment = db.payments.insert({
    lines: request.body["lines"],
    total: total,
    currency: "GBP",
    actorId: context.actor.id,
    processedAt: now()
  })

  db.ledger_entries.insert({
    paymentId: payment.id,
    amount: total,
    type: "debit",
    timestamp: payment.processedAt
  })

  return {
    paymentId: payment.id,
    total: total,
    currency: "GBP",
    status: "processed",
    processedAt: payment.processedAt
  }

}
```

### What each contract section does

- `types` — declares `PaymentLine` (with `Money<GBP>`) and `ProcessPaymentResult`; currency is typed at the field level so cross-currency assignments fail at compile time
- `intent` — explicitly names BigInt precision and cross-currency rejection as obligations
- `request` — requires `lines` is an array of `PaymentLine`, it is non-empty, and the currency field is literally `"GBP"`
- `response` — guarantees total is `Money<GBP>`, currency is always `"GBP"`, status is one of two values, and negative totals are denied
- `context` — requires authenticated user with `payments:write` grant
- `model` — reads payment methods and accounts; writes to both `payments` and `ledger_entries`
- `financial` — the core monetary contract: enforces GBP-only, BigInt precision, denies cross-currency, disables rounding (all amounts must be exact), and denies negative amounts
- `effects.audit` — full audit of the transaction including the total amount
- `effects.reports` — generates a runtime payment report on successful write for reconciliation
- `security` — restricted classification with TLS required
- `rate_limit` — 20 payment attempts per actor per minute to prevent fraud automation

### Common mistakes

**Mistake 1 — Using a Float or Decimal type for monetary amounts**
```galerina
types {
  PaymentLine = { description: String, amount: Float }
}
```
`Float` and `Decimal` are forbidden for monetary values in a flow with `financial.precision: bigint`. The type must be `Money<GBP>` (or the relevant currency). Float arithmetic can produce rounding errors that cause ledger imbalances.

**Mistake 2 — Omitting `financial.cross_currency: deny` when mixing currency variables**
```galerina
financial {
  currency: GBP
  precision: bigint
}
```
Without `cross_currency: deny`, the runtime may silently accept a `Money<USD>` value assigned to a `Money<GBP>` field. The explicit denial turns a silent mismatch into a hard compile-time error.

**Mistake 3 — Using standard integer addition instead of `sum_money` for monetary totals**
```galerina
let total = request.body["lines"].reduce((acc, l) => acc + l.amount.value, 0)
```
Extracting `.value` from a `Money<GBP>` and adding raw integers discards the currency tag. The result is an untyped integer, not a `Money<GBP>`, and will fail the `response.guarantees result.total is Money<GBP>` check. Always use the `sum_money` built-in.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| `Float` used for a `Money<GBP>` field | `E901 — monetary field must use Money<CURRENCY> type, not Float or Decimal` |
| `Money<USD>` assigned to `Money<GBP>` field | `E902 — cross-currency assignment: cannot assign Money<USD> to Money<GBP>` |
| `cross_currency: deny` absent in `financial` block | `W910 — financial block missing cross_currency declaration; defaulting to allow` |
| `.value` extracted from `Money<GBP>` and used in arithmetic | `E903 — raw .value arithmetic on Money type loses currency tag; use sum_money or money arithmetic operators` |
| Negative `Money<GBP>` returned when `financial.negative_amounts: deny` | `E904 — negative amount returned in violation of financial.negative_amounts: deny` |

### One-click fix

If `E902 — cross-currency assignment: cannot assign Money<USD> to Money<GBP>` is raised, ensure all monetary fields are typed as `Money<GBP>` and add the guard to `request`:

```galerina
request {
  requires request.body["currency"] == "GBP"
}
```

And in the `financial` block:

```galerina
financial {
  currency: GBP
  precision: bigint
  cross_currency: deny
  rounding: none
  negative_amounts: deny
}
```
