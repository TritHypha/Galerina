# Galerina Type System

This document describes the proposed type system for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The type system should prevent common mistakes before runtime, especially in JSON/API systems, security-sensitive workflows, maths-heavy code and multi-target compilation.

---

## Type System Summary

Galerina should be:

```text
strictly typed
memory safe
explicit about missing values
explicit about errors
safe for JSON decoding
safe for API contracts
safe for money and dates
safe for concurrency
aware of maths shapes
aware of target compatibility
```

The type system should reject unsafe or ambiguous code early.

---

## Core Rule

Galerina should not allow loose type behaviour.

Invalid:

```Galerina
let total = "10" + 5
```

Valid:

```Galerina
let total: Int = toInt("10") + 5
```

Conversions must be explicit.

---

## Primitive Types

Initial primitive types:

```text
Void
Bool
Int
Float
Decimal
String
SecureString
Char
Bytes
```

Sized numeric spellings:

```text
Int8
Int16
Int32
Int64
UInt8
UInt16
UInt32
UInt64
Float16
Float32
Float64
```

Default numeric policy:

```text
Int     = checked signed 64-bit integer unless a sized integer is written.
Float   = Float64 unless Float16 or Float32 is written.
Decimal = exact base-10 decimal for financial and JSON/API decimal values.
```

Sized numeric types are explicit. They should be used for binary formats, FFI boundaries, protocol fields, GPU/vector layouts and memory-sensitive data structures.

Implicit narrowing is not allowed.

---

## Void

`Void` represents no meaningful return value.

Example:

```Galerina
secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
```

---

## Bool

`Bool` is only for true/false values.

Example:

```Galerina
let enabled: Bool = true
```

Only `Bool` should be aLOwed in `if` conditions.

Valid:

```Galerina
if enabled == true {
  start()
}
```

Invalid:

```Galerina
if customer {
  process(customer)
}
```

Use `Option<T>` and `match` for missing values.

---

## Int

`Int` represents whole numbers and defaults to a checked signed 64-bit integer.

Example:

```Galerina
let count: Int = 10
```

Use sized integers when layout or protocol compatibility matters:

```Galerina
let retryCount: Int32 = 3
let packetSize: UInt16 = 512
```

String-to-int conversion must be explicit:

```Galerina
let count: Int = toInt("10")
```

Overflow should be checked. Wrapping arithmetic must use an explicit wrapping operation or target policy.

---

## Float

`Float` represents floating-point numbers and defaults to `Float64`.

Example:

```Galerina
let score: Float = 0.87
```

Use explicit float sizes when layout, target capability or accelerator planning matters:

```Galerina
let weight: Float32 = 0.25
let activation: Float16 = 0.5
```

Floating-point values should not be used for money.

Use:

```Galerina
Money<Currency>
```

or:

```Galerina
Decimal
```

for money-like calculations.

---

## Decimal

`Decimal` is intended for precise base-10 decimal values.

Example:

```Galerina
let rate: Decimal = 19.99
```

Use `Decimal` or `Money<Currency>` when exact decimal behaviour matters.

Decimal rules:

```text
Decimal arithmetic should be deterministic across supported targets.
Decimal values should not silently convert to Float.
Decimal scale and rounding policy must be explicit at financial/API boundaries.
JSON decimal decoding should preserve decimal text where possible before validation.
```

---

## String

`String` represents normal text.

Example:

```Galerina
let name: String = "Galerina"
```

Strings should not be used for secrets.

Use:

```Galerina
SecureString
```

for secret values.

---

## SecureString

`SecureString` represents secret text. It is a migration alias for `String secure`.

Example:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
// Equivalent long-term preferred form:
let apiKey: String secure = env.secret("API_KEY")
```

Rules:

```text
SecureString cannot be printed by default.
SecureString cannot be logged by default.
SecureString cannot be accidentally converted to String.
SecureString should be redacted in reports.
SecureString should be cleared from memory where possible.
```

Invalid:

```Galerina
print(apiKey)
```

Valid:

```Galerina
log.info("API key loaded", { key: redact(apiKey) })
```

## Postfix Type State Syntax

Galerina uses postfix state syntax — the base type first, governance state second:

```Galerina
let input:  String  unsafe             = request.body("name")
let secret: String  secure             = env.secret("APP_SECRET")
let email:  Email   safe   validated   = validate.email(rawEmail)
let raw:    Json    unsafe unvalidated = boundary.api.body(req)
```

v1 state set:

| State | Meaning |
| --- | --- |
| `safe` | Trusted; may participate in normal logic |
| `unsafe` | Untrusted, must be validated before use |
| `validated` | Has passed a declared validator |
| `unvalidated` | Has not yet been proven acceptable |

Unmarked values are ordinary safe values unless they originate from an unsafe source.

State cannot change by assignment — only through approved transition operations
(validators, sanitizers, declassification methods). See `postfix-type-state-syntax.md`
in the Knowledge Base for the full specification.

---

## Bytes

`Bytes` represents raw binary data.

Example:

```Galerina
let body: Bytes = req.body
```

Bytes should be bounds checked and memory safe.

For Dart and Flutter targets, `Bytes` remains the portable Galerina type. Dart's
`Uint8List` is a target-specific interop type and should appear only at explicit
Dart/Flutter boundaries.

Recommended byte model:

```text
Bytes          = portable immutable Galerina byte data
MutableBytes   = portable mutable Galerina byte buffer
ByteView       = safe view into byte data
Dart.Uint8List = Dart-specific external/platform type
```

Rule:

```text
Use Bytes in normal Galerina code.
Use Dart.Uint8List only in Dart/Flutter interop code.
Convert explicitly unless the compiler proves a zero-copy conversion is safe.
```

---

## Collection Types

Core collection types:

```text
Array<T>
Map<K, V>
Set<T>
```

Examples:

```Galerina
let items: Array<OrderItem> = []
let headers: Map<String, String> = req.headers
let tags: Set<String> = Set()
```

Collections should be bounds checked.

Invalid:

```Galerina
let first = items[999]
```

if the index is out of range.

The runtime should fail safely with source-mapped errors.

---

## Option Type

`Option<T>` represents a value that may be missing.

States:

```text
Some(value)
None
```

Example:

```Galerina
let customer: Option<Customer> = findCustomer(customerId)
```

Handle with `match`:

```Galerina
match customer {
  Some(c) => processCustomer(c)
  None    => return Review("Customer missing")
}
```

Galerina should not use JavaScript-style `undefined`.

Galerina should avoid silent `null`.

---

## Result Type

`Result<T, E>` represents success or failure.

States:

```text
Ok(value)
Err(error)
```

Example:

```Galerina
flow loadOrder(id: OrderId) -> Result<Order, OrderError> {
  let order: Option<Order> = database.findOrder(id)

  match order {
    Some(o) => return Ok(o)
    None    => return Err(OrderError.NotFound)
  }
}
```

Unhandled `Result` values should fail compilation or produce a strong warning.

---

## Decision Type

`Decision` is used for 3-way business and security logic.

Recommended definition:

```Galerina
enum Decision {
  ALOw
  Deny
  Review
}
```

Use cases:

```text
fraud checks
payment checks
access control
risk decisions
AI confidence routing
manual review workflows
policy enforcement
```

Example:

```Galerina
secure flow checkPayment(status: PaymentStatus) -> Decision {
  match status {
    Paid    => ALOw
    Failed  => Deny
    Pending => Review
    Unknown => Review
  }
}
```

Use `Decision`, not `Bool`, when uncertainty is possible.

---

## Tri Type

`Tri` is for lower-level 3-way logic.

Canonical states:

```text
Positive
Neutral
Negative
```

`Tri` is value-level, not policy-level. It represents mathematical, signal, model-state or target-facing ternary state.

Example:

```Galerina
pure flow signalState(score: Float) -> Tri {
  match score {
    score > 0.1  => Positive
    score < -0.1 => Negative
    _ => Neutral
  }
}
```

Guidance:

```text
Bool      = true / false
Decision  = Allow / Deny / Review
Tri       = Positive / Neutral / Negative
Option    = Some / None
Result    = Ok / Err
```

`Decision` should be preferred for business logic.

`Tri` should be used for maths, ternary simulation, signal processing and model-state logic.

---

## Decision and Tri Boundary

`Decision` and `Tri` are both 3-state concepts, but they are not interchangeable.

Use `Decision` when the value controls a human, business, security or policy outcome.

```text
ALOw  = proceed
Deny   = block
Review = defer to manual review, policy review or a safer fallback
```

Use `Tri` when the value describes a measured, computed or modelled state.

```text
Positive = above baseline, active, true-like or high signal
Neutral  = at baseline, unknown, balanced or no clear signal
Negative = below baseline, inactive, false-like or low signal
```

Compiler rules:

```text
Decision must not implicitly convert to Tri.
Tri must not implicitly convert to Decision.
Decision.Review must not be treated as Tri.Neutral without an explicit policy.
Tri.Neutral must not be treated as Decision.Review without an explicit policy.
Comparisons between Decision and Tri are type errors.
Assignments between Decision and Tri are type errors.
```

Allowed conversions must be named and policy-bearing.

Example:

```Galerina
secure flow riskToDecision(signal: Tri) -> Decision {
  match signal {
    Positive => Deny
    Neutral  => Review
    Negative => ALOw
  }
}
```

This keeps business policy out of low-level ternary logic and keeps target-facing ternary values from silently making security decisions.

---

## Enum Types

Enums define fixed states.

Example:

```Galerina
enum PaymentStatus {
  Paid
  Unpaid
  Pending
  Failed
  Refunded
  Unknown
}
```

Enums should be handled exhaustively with `match`. The compiler enforces that
every variant is covered.

Example:

```Galerina
match status {
  Paid     => ALOw
  Unpaid   => Review
  Pending  => Review
  Failed   => Deny
  Refunded => Review
  Unknown  => Review
}
```

---

## Type Definitions

Example:

```Galerina
type Customer {
  id: CustomerId
  name: String
  email: Option<Email>
}
```

Types should be clear and explicit.

---

## Type Aliases

Galerina supports type aliases:

```Galerina
type CustomerId = String
type OrderId    = String
type Email      = String
```

## Branded Types

Branded types give a plain representation a distinct compile-time domain identity:

```Galerina
type CustomerId  = Brand<String, "CustomerId">
type OrderId     = Brand<String, "OrderId">
type SessionToken = Brand<String secure, "SessionToken">
```

`CustomerId` and `OrderId` share the same runtime representation (`String`) but are
compile-time distinct — the compiler rejects mixing them.

Construction from external input requires an explicit validated path:

```Galerina
// Correct
let id: Result<CustomerId, ValidationError> = parseCustomerId(input)

// Compile error — direct assignment from String not allowed
let id: CustomerId = input
```

Brand erasure: at runtime `CustomerId` erases to `String`. At compile time they remain
distinct. Explicit unbranding: `let raw: String = customerId.value()`.

Alias vs brand:
- `type CustomerId = String` — alias, same as String, for readability
- `type CustomerId = Brand<String, "CustomerId">` — compile-time distinct, for safety

---

## Money Type

Money should be typed by currency.

Example:

```Galerina
let amount: Money<GBP> = Money(100.00)
let tax: Money<GBP> = Money(20.00)

let total: Money<GBP> = amount + tax
```

Invalid:

```Galerina
let amount: Money<GBP> = Money(100.00)
let tax: Money<USD> = Money(20.00)

let total = amount + tax
```

Expected compiler error:

```text
Cannot add Money<GBP> and Money<USD>.
Convert currency explicitly before adding.
```

This prevents financial mistakes.

---

## Currency Type

Currencies should be explicit.

Examples:

```text
GBP
USD
EUR
JPY
```

Currency conversion should be explicit because exchange rates are external and time-dependent.

Example:

```Galerina
let usd: Money<USD> = convert(amount, to: USD, rate: exchangeRate)
```

---

## Timestamp and Duration

Example:

```Galerina
let createdAt: Timestamp = now()
let timeout: Duration = 5s
```

Durations may support:

```text
ms
s
m
h
d
```

Examples:

```Galerina
let retryDelay: Duration = 500ms
let apiTimeout: Duration = 5s
let webhookMaxAge: Duration = 5m
```

---

## Json Type

Galerina should include a `Json` type.

Related types:

```text
Json
JsonObject
JsonArray
JsonString
JsonNumber
JsonBool
JsonNull
```

Raw JSON example:

```Galerina
let raw: Json = req.json()
let eventType: String = raw.path("$.type").asString()
```

Typed JSON should be preferred for production.

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

---

## Typed JSON Decoding

Given:

```Galerina
type CreateOrderRequest {
  customerId: CustomerId
  items: Array<OrderItem>
  currency: Currency
}
```

Decode:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

If the JSON does not match the type, Galerina should return a source-mapped validation error.

---

## JSON Null Handling

JSON may contain `null`, but Galerina should not allow silent null behaviour.

If a JSON field may be null, it should decode into:

```Galerina
Option<T>
```

Example:

```Galerina
type CustomerPayload {
  email: Option<Email>
}
```

Invalid if `email` may be missing or null:

```Galerina
type CustomerPayload {
  email: Email
}
```

unless the JSON policy rejects null and missing values.

---

## Arrays and Bounds

Arrays should be memory safe.

Example:

```Galerina
let first: OrderItem = items[0]
```

If the index may be missing, safer syntax may return `Option<T>`:

```Galerina
let first: Option<OrderItem> = items.get(0)
```

Direct indexing may fail safely if out of bounds.

---

## Matrix Type

Galerina should support matrix types for maths-heavy workloads.

Example:

```Galerina
let weights: Matrix<1024, 1024, Float16>
```

Shape:

```text
Matrix<Rows, Columns, Type>
```

---

## Vector Type

Example:

```Galerina
let input: Vector<1024, Float16>
```

Shape:

```text
Vector<Length, Type>
```

---

## Tensor Type

Possible syntax:

```Galerina
let image: Tensor<[1, 224, 224, 3], Float32>
```

Tensor shapes should be checked where possible.

---

## Compile-Time Shape Checking

Invalid:

```Galerina
Matrix<128, 256, Float32> * Matrix<128, 64, Float32>
```

Valid:

```Galerina
Matrix<128, 256, Float32> * Matrix<256, 64, Float32>
```

The compiler should catch incompatible matrix operations before runtime where possible.

---

## Target-Aware Types

Some types may only be valid on certain targets.

Example:

```text
Matrix<1024, 1024, Float16> may be suitable for GPU/photonic planning.
FileHandle may only be suitable for CPU.
SecureString should not be sent to GPU/photonic compute blocks.
```

The type checker and target checker should work together.

---

## Compute-Compatible Types

Compute blocks should usually aLOw:

```text
Int
Float
Decimal where supported
Vector<N, T>
Matrix<R, C, T>
Tensor<Shape, T>
model input/output types
```

Compute blocks should reject:

```text
FileHandle
DatabaseConnection
HttpRequest
SecureString
EnvironmentSecret
mutable global state
```

---

## API Request Types

API requests should be typed.

Example:

```Galerina
type CreateOrderRequest {
  customerId: CustomerId
  items: Array<OrderItem>
  currency: Currency
}
```

Used in API contract:

```Galerina
api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
    handler createOrder
  }
}
```

---

## API Response Types

Example:

```Galerina
type CreateOrderResponse {
  id: OrderId
  decision: Decision
  status: OrderStatus
}
```

Handlers should return the declared response type.

---

## Error Types

Errors should be typed.

Example:

```Galerina
enum OrderError {
  NotFound
  InvalidStatus
  PaymentFailed
  StockUnavailable
}
```

Use with:

```Galerina
Result<Order, OrderError>
```

---

## Validation Errors

Galerina may include structured validation errors.

Example:

```Galerina
enum ValidationError {
  MissingField(field: String)
  InvalidType(field: String)
  InvalidFormat(field: String)
}
```

This is useful for JSON and API errors.

---

## Type Inference

Galerina may support limited type inference.

Example:

```Galerina
let count = 10
```

The compiler can infer:

```text
Int
```

However, public API boundaries should prefer explicit types.

Recommended explicit types for:

```text
flow parameters
flow return values
API request types
API response types
JSON decode targets
compute block inputs
security-sensitive values
```

---

## Auto — Explicit Type Inference Keyword

`Auto` is a compile-time keyword that asks the compiler to infer the concrete
type from the value. It is not `Any`.

```text
Auto = compiler resolves the concrete type at compile time
Any  = value can be any type at runtime (unsafe — not used in Galerina)
```

### Rule

```text
Auto must resolve to a single concrete type at compile time.
```

### Valid uses

```Galerina
let count: Auto = 42          // inferred: Int
let name: Auto  = "Phillip"   // inferred: String
let active: Auto = true       // inferred: Bool
```

### Invalid use — ambiguous branches

```Galerina
let result: Auto = match status {
  "ok"    => "continue"
  "error" => 500
}
// ERROR: branches return String and Int — cannot infer a single type
```

Use explicit types when branches return different types:

```Galerina
let result: String = match status {
  "ok"    => "continue"
  "error" => "fail"
}
```

### Style guidance

Prefer explicit types in flow signatures and public API definitions.
Use `Auto` for obvious local intermediate bindings:

```Galerina
let itemCount: Auto = order.items.length  // obvious: Int
let subtotal: Auto  = order.items.sum(i => i.price)  // obvious: Decimal
```

`Auto` declarations appear in the type manifest with their resolved concrete
type — not as `Auto`.

---

## Function Parameters

Parameters should be typed.

Example:

```Galerina
flow add(a: Int, b: Int) -> Int {
  return a + b
}
```

Untyped parameters should not be aLOwed in strict mode.

---

## Return Types

Return types should be explicit.

Example:

```Galerina
flow getName() -> String {
  return "Galerina"
}
```

Fallible return:

```Galerina
flow getOrder(id: OrderId) -> Result<Order, OrderError> {
  ...
}
```

---

## Generic Types

Galerina should support generics.

Examples:

```Galerina
Option<Customer>
Result<Order, OrderError>
Array<OrderItem>
Map<String, String>
Matrix<128, 256, Float32>
```

---

## Exhaustive match Checking

Given:

```Galerina
enum PaymentStatus {
  Paid
  Pending
  Failed
  Unknown
}
```

This is incomplete:

```Galerina
match status {
  Paid   => ALOw
  Failed => Deny
}
```

Compiler should report missing cases:

```text
Pending
Unknown
```

---

## Pattern Matching Option

Example:

```Galerina
match customer {
  Some(c) => process(c)
  None    => return Review("Customer missing")
}
```

---

## Pattern Matching Result

Example:

```Galerina
match result {
  Ok(order)  => return Ok(order)
  Err(error) => return Err(error)
}
```

---

## No Any by Default

Galerina should avoid a broad `Any` type by default.

If a dynamic escape hatch exists, it should be explicit and restricted.

Possible future type:

```Galerina
Dynamic
```

But it should be discouraged in production systems.

---

## No Untyped JSON by Default

JSON may be dynamic at the boundary, but production logic should decode into strict types.

ALOwed:

```Galerina
let raw: Json = req.json()
```

Preferred:

```Galerina
let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)
```

---

## Type Safety and AI Tools

The type system should help AI assistants.

Compiler reports should include:

```text
expected type
actual type
source file
line
column
suggested fix
safe example
```

Example:

```json
{
  "errorType": "TypeError",
  "file": "src/main.spore",
  "line": 2,
  "column": 15,
  "expected": "Int",
  "actual": "String",
  "problem": "Cannot add String and Int.",
  "suggestedFix": "Use toInt() to convert the String explicitly."
}
```

---

## Type Safety and Source Maps

Type errors should map to the original `.spore` file.

Example:

```text
Type error:
Cannot add String and Int.

Original source:
  src/main.spore:2:20

Suggestion:
  Convert the String explicitly using toInt().
```

---

## Type System Non-Goals

Galerina should not include:

```text
JavaScript-style undefined
silent null
implicit type coercion
truthy/falsy checks
untyped production JSON
unsafe raw pointers in normal code
hidden exceptions as the main error system
```

---

## Open Type System Questions

```text
Should Money<Currency> be built in or standard library?
Should Decision be built in or standard library?
Should JSON null decode automatically to None?
Should direct array indexing return T or Option<T>?
Should Galerina include branded types for IDs?
Should Galerina allow a restricted Dynamic type?
Should matrix/tensor shapes be fully compile-time from version 1?
```

---

## Final Type System Principle

The Galerina type system should make unsafe assumptions visible.

It should help developers avoid:

```text
missing values
unhandled errors
wrong JSON shapes
wrong API responses
money mistakes
unsafe boolean decisions
matrix shape errors
secret leakage
target-incompatible compute blocks
```

The type system should make Galerina safer, clearer and easier to debug before code reaches runtime.
