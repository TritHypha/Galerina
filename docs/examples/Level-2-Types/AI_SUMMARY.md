## What this level teaches

- All built-in scalar types: `Int`, `Decimal`, `String`, `Bool`, `Byte`, `Char`
- Temporal types: `Duration`, `Timestamp`, `Date`, `Time`
- Semantic domain types: `Email`, `PatientId`, `NhsNumber` as branded types via `Brand<T, Tag>`
- Generic container types: `Array<T>`, `Map<K, V>`, `Option<T>`, `Result<T, E>`
- `Money<C>` with currency parameter — arithmetic rules and cross-currency guard
- `Tensor<T, Shape>` with two required type parameters (element type and static or dynamic shape)
- `protected` and `redacted` qualifiers on types — trust level distinctions
- Auto-type inference with `auto` and why it has limits
- `readonly` view types and when assignment to them is rejected
- `unknown` type and `type mismatch` errors

## Canonical patterns

```spore
// Money: currency-parameterised, exact decimal arithmetic
let price: Money<GBP> = Money.gbp("100.00")
let vat: Money<GBP>   = price * Decimal("0.20")

// Cross-currency is a compile error
// let bad = Money.gbp("10.00") + Money.usd("10.00")  -- SPORE-TYPE-004
```

```spore
// Tensor: two type parameters required, shape can use named dimensions
let embedding: Tensor<Float32, [1, 768]>
let batch:     Tensor<Float32, [Batch, 1024]>

// protected vs redacted
let email:      protected Email = validate.email(rawEmail)?
let auditEmail: redacted  Email = redact(email)
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- `compute target` blocks (Level 6)
- `contract set` (Level 5)
- `ai.inference` effect and AI model calls (Level 7)

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-TYPE-002` | Type mismatch — incompatible types in assignment or expression |
| `SPORE-TYPE-003` | Cannot assign raw `String` to branded type without a validation gate |
| `SPORE-TYPE-004` | Cross-currency `Money` arithmetic is forbidden |
| `SPORE-TYPE-006` | `Tensor` requires exactly two type parameters |
| `SPORE-TYPE-002 / SPORE-TYPE-003` | Cannot assign `protected T` to `redacted T` without calling `redact()` |

## Example IDs at this level

051-int-basic, 052-decimal-basic, 053-string-basic, 054-bool-basic, 055-byte-basic, 056-char-basic, 057-email-type, 058-patient-id-type, 059-nhs-number-type, 060-invalid-email-assignment, 061-redacted-email, 062-invalid-redacted-email, 063-option-some, 064-option-none, 065-option-invalid-arity, 066-result-success, 067-result-error, 068-result-invalid-arity, 069-auto-inference, 070-auto-invalid, 071-money-gbp, 072-money-add-same-currency, 073-money-cross-currency-invalid, 074-money-times-decimal, 075-money-divide-decimal, 076-money-times-money-invalid, 077-money-ratio, 078-money-ratio-cross-currency-invalid, 079-tensor-basic, 080-tensor-dynamic-shape, 081-tensor-invalid-arity, 082-readonly-view, 083-readonly-view-invalid, 084-unknown-type, 085-type-mismatch, 086-protected-not-redacted, 087-protected-email-audit, 088-array-range, 089-duration-type, 090-result-sequence, 091-trust-sensitivity-independent, 092-boolean-logic, 093-time-types
