# Type and Enum Declarations

## Definition

Galerina uses `type` to define structured data shapes and `enum` to define fixed
named states. Both produce named, strongly-typed values that the compiler
enforces throughout the codebase.

---

## type Declaration

### Closed Object Contract

```galerina
type Customer {
  id:    CustomerId
  name:  String
  email: Option<Email>
}
```

A `type Name { ... }` declaration defines a **closed object shape** by default.
Unknown fields are rejected at governed boundaries (equivalent to JSON Schema's
`additionalProperties: false`).

Fields are immutable by default. All types are strictly typed — no silent null,
no implicit coercion.

### Naming Rules

```text
Type names:  PascalCase
Field names: camelCase
```

Good:
```galerina
type CustomerProfile {
  customerId:  CustomerId
  displayName: String
}
```

Avoid:
```galerina
type customer_profile {
  CustomerID: string    // wrong case for both name and field
}
```

Stable naming makes generated schemas, API docs, diagnostics, source maps, and
AI context easier to consume.

### Required and Optional Fields

All fields are required unless wrapped in `Option<T>`.

```galerina
type Customer {
  id:    CustomerId
  email: Email
  phone: Option<String>    // explicitly optional
}
```

`Option<T>` is the only normal way to express a missing-capable field.
There is no `?` marker, no default values, no silent null.

### Nested Types

```galerina
type Address {
  line1:    String
  city:     String
  postcode: String
  country:  String
}

type Customer {
  id:      CustomerId
  name:    String
  address: Address
  email:   Option<Email>
}
```

### Type Aliases

```galerina
type CustomerId  = String
type OrderId     = String
type RetryCount  = Int
```

Type aliases are separate from object type blocks. They let code be
self-documenting without inventing a full object shape.

Prefer:
```galerina
type CustomerId = String

type Customer {
  id:   CustomerId
  name: String
}
```

Over:
```galerina
type Customer {
  id:   String      // weaker domain signal
  name: String
}
```

### Branded Types

Branded types prevent accidentally passing an `OrderId` where a `CustomerId`
is expected:

```galerina
type CustomerId = Brand<String, "CustomerId">
type OrderId    = Brand<String, "OrderId">
type PaymentId  = Brand<String, "PaymentId">
type PositiveInt = Brand<Int, "PositiveInt">
```

`CustomerId` and `OrderId` share the same runtime representation but are
compile-time distinct. The compiler rejects mixing them.

**Brand vs alias:**

| Form | Meaning | Use for |
| --- | --- | --- |
| `type CustomerId = String` | Alias — same as String | Readability |
| `type CustomerId = Brand<String, "CustomerId">` | Compile-time distinct | Safety |

```text
Use aliases for readability. Use brands for safety.
```

Brand construction from external input:

```galerina
// Correct — validated before branding
let id: Result<CustomerId, ValidationError> = parseCustomerId(input)

// Avoid — direct assignment from plain String
let id: CustomerId = input    // compile error
```

Brand erasure: at runtime, `CustomerId` erases to `String`. At compile time
they remain distinct.

Brands compose with state qualifiers:

```galerina
type SessionToken = Brand<String secure, "SessionToken">
type RawHtml      = Brand<String unsafe, "RawHtml">
```

### Security-Sensitive Fields

Use `SecureString` (or the postfix state qualifier `String secure`) for
fields that must not be logged or exposed:

```galerina
type LoginRequest {
  email:    Email
  password: SecureString
}
```

With state qualifier (preferred long-term):

```galerina
type WebhookConfig {
  endpoint:      String
  signingSecret: String secure
}
```

`SecureString` is treated as a migration alias for `secure String`.

### AI-Readable Comments

```galerina
/// @purpose Public request body for creating an order.
/// @risk User-controlled input reaches pricing and payment checks.
type CreateOrderRequest {
  customerId: CustomerId
  items:      Array<OrderLine>
  couponCode: Option<String>
}
```

### Grammar Sketch

```text
TypeDeclaration
  = "type" TypeName TypeBody
  | "type" TypeName "=" TypeRef

TypeBody
  = "{" FieldDeclaration* "}"

FieldDeclaration
  = FieldName ":" TypeRef

TypeRef
  = TypeName
  | TypeName "<" TypeRefList ">"
  | IntegerDimension

TypeRefList
  = TypeRef ("," TypeRef)*
```

### What is NOT in v1 Core

```galerina
type User extends Person { ... }    // no inheritance
type User { ...Address }            // no spreads
type User { name?: String }         // no optional marker
type User { name: String = "Anon" } // no default values
type User { private password: ... } // no private fields
type User { get displayName() -> ... }  // no methods
type User { validate email is Email }   // no inline validators
```

These may become package-owned features or validation policies later.

---

## enum Declaration

Enums define a **closed set of named states**:

```galerina
enum PaymentStatus {
  Paid
  Unpaid
  Pending
  Failed
  Refunded
}
```

### Naming Rules

```text
Enum names:  PascalCase
Enum cases:  PascalCase
```

Good:
```galerina
enum PaymentStatus {
  Paid
  Pending
  Failed
}
```

Avoid:
```galerina
enum payment_status {
  paid
  pending_payment
  FAILED
}
```

### Accepted Syntax Forms

The parser accepts:

```galerina
// Newline-separated (canonical)
enum Status {
  Paid
  Failed
}

// Comma-separated
enum Status {
  Paid,
  Failed,
}

// Single-line compact
enum Status { Paid, Failed }
```

The formatter always outputs the **newline-separated canonical form**:
```galerina
enum Status {
  Paid
  Failed
}
```

### Closed-Set Semantics

An enum may only be one of its declared cases. Unknown states from external
sources produce decode errors rather than silently passing through.

```galerina
enum PaymentStatus { Paid, Pending, Failed }
```

External JSON with `"status": "Refunded"` (if Refunded is not declared) should
fail closed with a typed error unless a boundary policy allows a fallback.

### Exhaustive Matching

The `match` expression must cover all enum variants:

```galerina
let decision: Decision = match status {
  Paid     => Allow
  Failed   => Deny
  Pending  => Review
  Refunded => Review
  Unknown  => Review
  Unpaid   => Deny
}
```

Missing a variant produces:

```text
LNN-ERR-TYPE-003: Non-exhaustive match — missing case: Unknown
```

### Case Qualification

Allow unqualified enum cases when the expected type is known:

```galerina
let status: PaymentStatus = Paid
```

Require qualified cases when ambiguous (two enums share the same case name):

```galerina
let payStatus: PaymentStatus = PaymentStatus.Failed
let jobStatus: JobStatus     = JobStatus.Failed
```

### JSON and API Encoding

Enum cases encode as strings by default:

```json
{ "type": "string", "enum": ["Paid", "Pending", "Failed"] }
```

Custom wire values (`Paid = "paid"`) are a future feature handled by API/JSON
policy, not core enum syntax.

### Decision Enums

Use dedicated decision enums for business and security outcomes instead of
`Bool`:

```galerina
enum Decision {
  Allow
  Deny
  Review
}

secure flow paymentDecision(status: PaymentStatus) -> Decision {
  match status {
    Paid    => Allow
    Failed  => Deny
    Pending => Review
    _ => Review
  }
}
```

`Bool` loses the difference between deny, review, unknown, blocked and not
applicable.

### Grammar Sketch

```text
EnumDeclaration
  = "enum" EnumName EnumBody

EnumBody
  = "{" EnumCaseList? "}"

EnumCaseList
  = EnumCase (EnumSeparator EnumCase)* EnumSeparator?

EnumSeparator
  = Newline | ","

EnumCase
  = CaseName
```

Future grammar extension:
```text
EnumCase
  = CaseName
  | CaseName "(" TypeRefList ")"   // payload variants
  | CaseName "=" StringLiteral      // explicit wire values
```

### Future: Payload Variants

```galerina
// Future — not v1
enum PaymentResult {
  Paid(PaymentId)
  Failed(PaymentError)
  RequiresReview(ReviewReason)
}
```

Payload variants are a documented future direction. v1 enums are simple named
cases only.

---

## Standard Discriminated Types

Galerina provides built-in discriminated types:

```galerina
Option<T>    // Some(value) or None
Result<T, E> // Ok(value) or Err(error)
Decision     // Allow | Deny | Review
Tri          // Positive | Neutral | Negative
```

See `generic-types.md` for Option and Result, and `mathematics-and-tri-logic.md`
for Decision and Tri.

---

## Type Safety Rules

```text
No implicit type coercion.
No silent null — use Option<T>.
No undefined — not a concept in Galerina.
Conversions must be explicit.
enum matching must be exhaustive.
Type aliases are not branded types — they do not block mixing.
Branded types must be constructed through validated/explicit paths.
Object schemas are closed by default.
```

## Compiler Errors

```text
LNN-ERR-TYPE-001: Type mismatch — expected X, got Y
LNN-ERR-TYPE-002: Field X is not a member of type Y
LNN-ERR-TYPE-003: Non-exhaustive map — missing enum case
LNN-ERR-NULL-001: Null is not a valid value — use Option<T>
LNN-ERR-NULL-002: None used where a value is required
```

---

## Example: Complete Small Model

```galerina
type CustomerId = String
type OrderId    = String

enum PaymentStatus {
  Paid
  Pending
  Failed
}

type OrderLine {
  sku:       String
  quantity:  Int
  unitPrice: Money<GBP>
}

/// @purpose Request body accepted by the public order creation endpoint.
/// @risk User-controlled input affects stock, pricing and payment flow.
type CreateOrderRequest {
  customerId: CustomerId
  items:      Array<OrderLine>
  couponCode: Option<String>
}

type CreateOrderResponse {
  orderId: OrderId
  status:  PaymentStatus
}

secure flow createOrder(input: CreateOrderRequest)
  -> CreateOrderFlowResult
contract {
  types {
    type CreateOrderFlowResult = Result<CreateOrderResponse, ApiError>
  }
  effects {
    database.write
  }
}
{
  ...
}
```

---

## Core Principle

```text
Types describe data shape.
Enums describe fixed states.
Both are strict, explicit, and compiler-enforced.
```
