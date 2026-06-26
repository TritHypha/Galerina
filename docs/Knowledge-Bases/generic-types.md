# Generic Types

## Definition

Galerina supports parameterised types (generics) for collections, optional values,
error handling, and compute shapes. Generic type parameters are written in angle
brackets: `Type<Parameter>`.

## Core Generic Types

| Type | Arity | Purpose |
| --- | --- | --- |
| `Option<T>` | 1 | Optional value — replaces null |
| `Result<T, E>` | 2 | Success or failure |
| `Array<T>` | 1 | Ordered, bounded collection |
| `Map<K, V>` | 2 | Key-value dictionary |
| `Set<T>` | 1 | Unordered distinct collection |
| `Channel<T>` | 1 | Typed communication channel |
| `Money<Currency>` | 1 | Monetary value with currency |

## Generic Arity

The compiler validates arity. Wrong argument count is a compile error:

| Invalid usage | Error |
| --- | --- |
| `Option<String, ApiError>` | Option takes 1 argument |
| `Result<Order>` | Result takes 2 arguments |
| `Map<String>` | Map takes 2 arguments |
| `Vector<Float32>` | Vector takes 2 arguments |
| `Array` (no parameter) | Generic type parameter required |

## Option<T>

Represents a value that may be absent. Replaces null and undefined.

```galerina
let customer: Option<Customer> = database.find_customer(id)
```

Handling:

```galerina
match customer {
  Some(c) => process(c)
  None    => return Err(CustomerError.NotFound)
}
```

Rules:

```text
None is not null — it is an explicit absence state.
You cannot use an Option<T> where a T is expected without unwrapping.
The compiler enforces exhaustive handling.
```

## Result<T, E>

Represents success or typed failure. Replaces exceptions.

```galerina
flow load_order(id: OrderId) -> Result<Order, OrderError>
  uses database.orders.read
{
  let raw: unsafe Any = database.orders.find(id)
  let order: safe Order = validate.order(raw)
  return Ok(order)
}
```

Handling:

```galerina
let result: Result<Order, OrderError> = load_order(id)

match result {
  Ok(order) => process(order)
  Err(e)    => return Err(e)
}
```

With `attempt`:

```galerina
let order = attempt load_order(id)
else error {
  return Err(error)
}
```

Unhandled `Result` values produce a compiler warning.

## Array<T>

Ordered, bounded collection. Bounds-checked — out-of-bounds access fails safely.

```galerina
let items: Array<OrderItem> = []
let first: Option<OrderItem> = items.first()
let count: Int = items.count()
```

Trust propagates to the array:

```galerina
let tags: unsafe Array<String> = ...   // whole array is untrusted
let safe_tags: safe Array<String> = validate.string_list(tags)
```

## Map<K, V>

Key-value collection.

```galerina
let headers: Map<String, String> = request.headers
let user_id: Option<String> = headers.get("X-User-Id")
```

## Set<T>

Unordered collection of distinct values.

```galerina
let roles: Set<String> = actor.roles
```

## Channel<T>

Typed communication channel for message passing between flows and workers.

```galerina
let events: Channel<OrderEvent> = Channel.create()
```

## Money<Currency>

Monetary value parameterised by currency. Prevents mixing currencies.

```galerina
let price: Money<GBP> = Money.of(1999, GBP)
let tax:   Money<GBP> = Money.of(399, GBP)
```

See `numeric-and-compute-types.md` for the full Money specification.

## Compute-Oriented Generics

Numeric dimension generics for AI and compute packages:

| Type | Arity | Purpose |
| --- | --- | --- |
| `Vector<T, N>` | type + integer | Fixed-length vector |
| `Matrix<T, R, C>` | type + 2 integers | R×C matrix |
| `Tensor<T, Shape>` | type + shape (arity 2) | Multi-dimensional tensor |
| `AnyTensor` | (none) | Fully erased tensor — element type and shape unknown |

```galerina
let embedding:  Vector<Float32, 768>        = model.embed(text)
let weights:    Matrix<Float32, 4, 4>       = Matrix.identity()
let logits:     Tensor<Float32, [Batch, 10]> = model.forward(input)
let erased:     AnyTensor                   = dynamicLoad()
```

`Tensor` is a generic type with arity 2. Bare `Tensor` without type parameters is not valid syntax.

| Valid | Invalid | Error |
|---|---|---|
| `Tensor<Float32, [1, 128]>` | `Tensor` | `SPORE-TYPE-009` — expected 2 type arguments |
| `Tensor<Float16, DynamicShape>` | `Tensor<Float32>` | `SPORE-TYPE-009` — expected 2 type arguments |
| `AnyTensor` | `Tensor<Float32, [1, 128], Gpu>` | `SPORE-TYPE-009` — expected 2 type arguments |

Use `AnyTensor` when both element type and shape are unknown at compile time.
Use `Tensor<T, DynamicShape>` when the element type is known but shape is dynamic.
Backend/device/layout details (GPU, photonic, NPU) belong in `compute target` governance blocks, not in the tensor type.

Numeric generic arguments are only valid for types that explicitly accept
dimensions. Using numeric arguments on standard types is a compile error:

```galerina
Option<3>         // invalid
Result<String, 2> // invalid
Vector<Float32>   // invalid — missing dimension
```

## Generic Functions and Flows

Type parameters in flows:

```galerina
fn wrap_option<T>(value: T) -> Option<T> {
  Some(value)
}
```

## Nested Generics

Nested generics are supported. The parser splits arguments only at top-level
commas:

```galerina
let report:  Result<Array<OrderItem>, OrderError> = load_order_items(id)
let users:   Map<UserId, Option<User>>            = load_all_users()
let batches: Array<Result<OrderId, ValidationError>> = []
```

`Result<Array<Customer>, ApiError>` has two top-level arguments:
- `Array<Customer>`
- `ApiError`

Not three.

## Branded Types

Branded types use `Brand<T, "Name">` — a special generic that gives a plain
representation a distinct domain identity at compile time:

```galerina
type CustomerId = Brand<String, "CustomerId">
type OrderId    = Brand<String, "OrderId">
type PaymentId  = Brand<String, "PaymentId">
type PositiveInt = Brand<Int, "PositiveInt">
```

`CustomerId` and `OrderId` share the same runtime representation (`String`) but
are type-distinct — the compiler rejects mixing them.

### Brand Construction

```galerina
let id: Result<CustomerId, ValidationError> = parseCustomerId(input)
```

External strings must be validated before becoming branded domain types. Direct
assignment from a plain string is a compile error.

### Brand Erasure

At runtime, branded types erase to their base representation (`CustomerId → String`).
At compile time they remain distinct.

Explicit unbranding:
```galerina
let raw: String = customerId.value()
```

### Brand vs Alias

| Form | Meaning | Use for |
| --- | --- | --- |
| `type CustomerId = String` | Alias — same type as String | Readability |
| `type CustomerId = Brand<String, "CustomerId">` | Distinct compile-time type | Safety |

```text
Use aliases for readability. Use brands for safety.
```

### Brands and State

Brands compose with postfix state qualifiers:

```galerina
type SessionToken    = Brand<String secure, "SessionToken">
type PublicCustomerId = Brand<String, "PublicCustomerId">
type RawHtml          = Brand<String unsafe, "RawHtml">
```

### Brands in the Type Manifest

The generated `app.type-manifest.json` includes branded type entries:

```json
{
  "brands": [
    { "name": "CustomerId", "base": "String", "brand": "CustomerId" }
  ]
}
```

### Brands and JSON

Branded values encode like their base type by default:

```json
{ "type": "string", "x-galerina-brand": "CustomerId" }
```

## Future: User-Defined Generic Types

User-defined parameterised types such as `type Page<T> { items: Array<T> }` are
a planned future feature. v1 supports only built-in generic types.

## Parser Rules

```text
recognise TypeName<...>
support nested generic arguments
split arguments only at top-level commas
validate known generic arity
allow numeric dimensions only for approved types
normalise spacing in formatter output
```

Formatter output:
```galerina
Result<Array<Customer>, ApiError>    // correct
Result< Array< Customer > , ApiError > // not allowed by formatter
```

## Grammar Sketch

```text
TypeRef
  = QualifiedType
  | GenericType
  | NumericDimension

GenericType
  = TypeName "<" TypeArgList ">"

TypeArgList
  = TypeArg ("," TypeArg)*

TypeArg
  = TypeRef
  | NumericDimension
  | StringLiteralBrand

BrandType
  = "Brand" "<" TypeRef "," StringLiteralBrand ">"
```

## Compiler Enforcement

```text
Generic type parameters must be specified — Array without <T> is not allowed.
Assignments between incompatible generic types are type errors.
Result values must be handled — unhandled Result produces LNN-WARN-*.
Generic arity must match the declared parameter count.
Numeric dimensions are only valid for approved compute types.
```

## Core Principle

```text
Generics express structured absence, success/failure, collections and
domain-safe identifiers without sacrificing type safety or requiring null.
```
