# Pattern Matching

## Definition

Galerina uses `match value { ... }` for all multi-branch matching and
value transformation. This replaces `switch`, `case`, and `elseif` from other
languages.

The `_ =>` arm is the catch-all fallback. It is always written inside the
closing `}` of the `match` block.

## Value Matching

Match a value against known variants:

```galerina
let message: String = match payment.status {
  Paid     => "Payment complete"
  Failed   => "Payment failed"
  Pending  => "Waiting for payment"
  Refunded => "Refunded"
  _ => "Unknown payment status"
}
```

## Enum Exhaustion

The compiler reports non-exhaustive matches for known enum types:

```galerina
enum OrderStatus { Placed, Confirmed, Shipped, Delivered, Cancelled }

let label: String = match order.status {
  Placed    => "Order received"
  Confirmed => "Order confirmed"
  Shipped   => "On the way"
  Delivered => "Delivered"
  // Missing: Cancelled
}
// Compiler: LNN-WARN — non-exhaustive enum match, Cancelled not handled explicitly
```

## Range Matching

Numeric ranges are matched top-to-bottom, first match wins:

```galerina
let grade: String = match score {
  >= 90 => "excellent"
  >= 70 => "good"
  >= 50 => "pass"
  _ => "fail"
}
```

## Object Pattern Matching

Match against a combination of fields:

```galerina
let handler = match request {
  { method: "GET",    path: "/users"    } => get_users()
  { method: "POST",   path: "/users"    } => create_user()
  { method: "GET",    path: "/orders"   } => get_orders()
  { method: "DELETE", path: "/orders"   } => cancel_order()
  _ => not_found()
}
```

## Type-Based Matching

Match on a discriminated union variant:

```galerina
let result: String = match api_result {
  Ok(data)  => format_data(data)
  Err(e)    => format_error(e)
}
```

## Option Matching

```galerina
let user_name: String = match found_user {
  Some(u) => u.name
  None    => "Guest"
}
```

## Nested Matching

Avoid nesting `match` inside `match` where possible (max nesting depth 2). Extract
to a named `fn` or `flow` if logic grows:

```galerina
flow classify_order(order: Order) -> String {
  match order.status {
    Confirmed => classify_payment(order.payment)
    Cancelled => "cancelled"
    _ => "unknown"
  }
}

flow classify_payment(payment: Payment) -> String {
  match payment.status {
    Paid   => "paid-confirmed"
    Failed => "payment-failed"
    _ => "payment-unknown"
  }
}
```

## Binding in Patterns

Capture the matched value with a name:

```galerina
match response {
  Ok(order)     => save_and_return(order)
  Err(NotFound) => return Err(OrderError.NotFound)
  Err(e)        => return Err(e)
}
```

## match as Expression

`match` is an expression and can be used directly in assignments:

```galerina
let fee: Decimal = match order.currency {
  GBP => Decimal(0.02)
  USD => Decimal(0.03)
  EUR => Decimal(0.025)
  _ => Decimal(0.03)
}
```

## What match Replaces

| Other language | Galerina |
| --- | --- |
| `switch (x) { case A: ... }` | `match x { A => ... }` |
| `if x == A ... else if x == B` | `match x { A => ... B => ... }` |
| `match x { A => ... }` (Rust) | `match x { A => ... }` |

## Catch-All Rule

The `_ =>` arm is the catch-all. It is required when:

```text
the matched type has variants not listed in the match block
the matching is over a non-enum type (String, Int, etc.)
```

It is optional when:

```text
the match covers all known variants of an enum exhaustively
```

## Governance and Validation Patterns

### Validation Workflow

```galerina
let rawEmail: String unsafe unvalidated = form.email

match validate.email(rawEmail) {
  Ok(email) => {
    let safeEmail: Email safe validated = email
    saveCustomer(safeEmail)
  }
  Err(InvalidEmail) => return Api.badRequest("Invalid email")
}
```

State pipeline: `unsafe unvalidated -> safe validated`

### API Boundary Matching

```galerina
secure flow createCustomer(request: Request) -> ApiResponse {
  let body: Json unsafe unvalidated = boundary.api.body(request)

  match validate.customer(body) {
    Ok(customerInput) => {
      match saveCustomer(customerInput) {
        Ok(customer)         => Api.created(customer)
        Err(DatabaseFailure) => Api.retryLater()
      }
    }
    Err(ValidationError) => Api.badRequest()
  }
}
```

### Decision Matching

```galerina
enum Decision { Allow, Deny, Review }

match fraudDecision(order) {
  Allow  => capturePayment(order)
  Deny   => cancelOrder(order)
  Review => queueManualReview(order)
}
```

`Bool` cannot express the difference between deny, review, unknown, blocked,
and not applicable. Use `Decision` instead.

### Permission Matching

```galerina
enum AuthDecision { Allow, Deny, RequireMFA }

match authorize(user, action) {
  Allow      => executeAction()
  Deny       => Api.forbidden()
  RequireMFA => Api.mfaRequired()
}
```

### Workflow State Machine

```galerina
enum OrderWorkflow {
  Draft
  AwaitingPayment
  Paid
  Packed
  Shipped
  Cancelled
}

match order.workflow {
  Draft           => allowEdits(order)
  AwaitingPayment => sendReminder(order)
  Paid            => queuePacking(order)
  Packed          => notifyCourier(order)
  Shipped         => archive(order)
  Cancelled       => stopWorkflow(order)
}
```

### Validation Error Matching

```galerina
enum ValidationError {
  MissingField
  InvalidEmail
  InvalidPhone
  WeakPassword
}

match validate.registration(input) {
  Ok(data)               => createAccount(data)
  Err(MissingField)      => Api.badRequest("Missing field")
  Err(InvalidEmail)      => Api.badRequest("Invalid email")
  Err(InvalidPhone)      => Api.badRequest("Invalid phone")
  Err(WeakPassword)      => Api.badRequest("Weak password")
}
```

### Runtime Mode Matching

```galerina
enum RuntimeMode { Checked, Compiled, Development }

match runtime.mode() {
  Checked     => enableAuditTracing()
  Compiled    => enableOptimizedExecution()
  Development => enableDebugTools()
}
```

## Future Patterns

### Struct Destructuring

```galerina
// Future — not v1
struct Point {
  x: Int
  y: Int
}

match point {
  Point { x: 0, y: 0 } => "origin"
  Point { x, y }        => "other"
}
```

Fields may be matched explicitly or bound into local variables.

Nested struct destructuring:

```galerina
// Future — not v1
match response {
  Ok(User { role: Admin, name }) => grantAccess(name)
  Ok(User { role: Guest, name }) => limitedAccess(name)
  Err(error)                     => handleError(error)
}
```

### Sequence / List Patterns

```galerina
// Future — not v1
match items {
  []              => "empty"
  [x]             => "single"
  [head, ..tail]  => "multiple"
}
```

Sequence patterns simplify recursive and collection-oriented logic.

### Guards

```galerina
// Future — not v1
match number {
  x if x < 0  => "negative"
  x if x == 0 => "zero"
  _            => "positive"
}
```

Guards add runtime conditions evaluated after structural matching succeeds.

```galerina
// Future — not v1
match order {
  Order { total } if total > 1000 => requireManagerApproval()
  Order { total }                 => autoApprove()
}
```

### Pattern Binding (Variable Destructuring)

```galerina
// Future — not v1
let Point { x, y } = point
```

Patterns may appear in assignment and parameter binding contexts.

### Tuple / Multi-Value

```galerina
// Future — not v1
match paymentStatus, shipmentStatus {
  (Paid, Queued)    => startPacking()
  (Paid, Delivered) => completeOrder()
  (Pending, _)      => holdOrder()
  (Failed, _)       => cancelOrder()
}
```

## Grammar Sketch

```text
MatchExpression
  = "match" Expression MatchBody

MatchBody
  = "{" MatchArm+ "}"

MatchArm
  = Pattern "=>" ExpressionOrBlock

Pattern
  = Identifier
  | VariantPattern
  | "_"

VariantPattern
  = VariantName
  | VariantName "(" Identifier ")"
```

Future expansion:
```text
TuplePattern
StructPattern    — Point { x, y }, Point { x: 0, y: 0 }
SequencePattern  — [], [x], [head, ..tail]
GuardPattern     — pattern if condition
BindingPattern   — let Point { x, y } = value
```

## Compiler Diagnostics

```text
LNN-ERR-TYPE-003: Non-exhaustive match — missing cases: Pending, Refunded
LNN-WARN-DEAD:    Unreachable match arm
LNN-ERR-DUP:      Duplicate match arm
LNN-ERR-VARIANT:  Invalid variant name for enum PaymentStatus
```

## Core Principle

```text
match replaces switch, case, and elseif.
The _ => arm is the explicit catch-all — always inside the match block.
Exhaustive enum matching is compiler-enforced.
Pattern matching supports governance — it makes state transitions,
validation workflows, and security decisions explicit and auditable.
```
