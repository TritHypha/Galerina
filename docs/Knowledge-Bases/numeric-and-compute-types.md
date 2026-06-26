# Numeric and Compute Types

## Definition

Galerina provides precise numeric types for financial work, and shaped numeric
types (Matrix, Vector, Tensor) for compute-heavy workloads. All types are
explicit — no implicit narrowing or coercion.

## Numeric Primitives

| Type | Default Size | Purpose |
| --- | --- | --- |
| `Int` | Checked signed 64-bit | Whole numbers |
| `Float` | Float64 | Approximate floating-point |
| `Decimal` | Exact base-10 | Money, API values, precise decimals |

### Int

```galerina
let count: Int = 10
let retry: Int32 = 3
let packet: UInt16 = 512
```

Sized variants: `Int8`, `Int16`, `Int32`, `Int64`, `UInt8`, `UInt16`, `UInt32`, `UInt64`

Use sized integers for: binary formats, FFI boundaries, protocol fields, GPU/vector
layouts, memory-sensitive structures.

Overflow is checked. Wrapping arithmetic requires explicit wrapping operations.

String-to-int conversion must be explicit:

```galerina
let n: Int = toInt("42")
```

### Float

```galerina
let score: Float = 0.87
let weight: Float32 = 0.25
let activation: Float16 = 0.5
```

Float variants: `Float16`, `Float32`, `Float64`

Use explicit float sizes when: layout matters, target capability matters,
accelerator planning requires specific precision.

Do not use Float for money. Use `Decimal` or `Money<Currency>`.

### Decimal

Exact base-10 decimal for financial and API values:

```galerina
let rate: Decimal = 19.99
let tax: Decimal = 3.40
```

Rules:

```text
Decimal arithmetic must be deterministic across supported targets.
Decimal must not silently convert to Float.
Decimal scale and rounding policy must be explicit at financial/API boundaries.
JSON decimal values must preserve decimal text before validation.
```

## Money<Currency>

Currency-typed monetary values. Cross-currency operations are compile-time errors.

```galerina
let price: Money<GBP> = Money(100.00)
let tax: Money<GBP> = Money(20.00)
let total: Money<GBP> = price + tax
```

Invalid:

```galerina
let a: Money<GBP> = Money(100.00)
let b: Money<USD> = Money(80.00)
let bad = a + b   // Compiler error: cannot add Money<GBP> and Money<USD>
```

Currency conversion must be explicit:

```galerina
let usd: Money<USD> = convert(amount, to: USD, rate: exchange_rate)
```

Currency codes: `GBP`, `USD`, `EUR`, `JPY`, and other ISO 4217 codes.

## Timestamp and Duration

```galerina
let created_at: Timestamp = runtime.now()
let timeout: Duration = 5s
let retry_delay: Duration = 500ms
let webhook_max_age: Duration = 5m
```

Duration suffixes: `ms`, `s`, `m`, `h`, `d`

## Compute-Shaped Types

For ML and scientific workloads. Shape parameters are compile-time constants.

### Matrix<Rows, Columns, Type>

```galerina
let weights: Matrix<1024, 1024, Float16>
let transform: Matrix<128, 256, Float32>
```

Shape mismatch is a compile-time error:

```galerina
// Invalid — inner dimensions don't match
Matrix<128, 256, Float32> * Matrix<128, 64, Float32>

// Valid
Matrix<128, 256, Float32> * Matrix<256, 64, Float32>
```

### Vector<Length, Type>

```galerina
let embedding: Vector<1024, Float16>
let input: Vector<512, Float32>
```

### Tensor<Shape, Type>

```galerina
let image: Tensor<[1, 224, 224, 3], Float32>
let batch: Tensor<[32, 224, 224, 3], Float32>
```

Tensor shapes are checked where possible at compile time.

## Target Compatibility Rules

Some types are only valid on certain compute targets:

```text
Matrix<R,C,Float16>     — suitable for GPU/NPU/photonic planning
FileHandle              — CPU only
SecureString            — must not be sent to GPU/photonic compute blocks
DatabaseConnection      — CPU only, not valid inside compute blocks
```

Inside compute blocks, only these types are allowed:

```text
Int, Float, Decimal (where supported), Vector<N,T>, Matrix<R,C,T>, Tensor<Shape,T>
model input/output types
```

## SecureString

Secret text that cannot be printed, logged, or converted to String accidentally:

```galerina
let api_key: SecureString = GlobalVault.secrets.read("api-token")
```

Rules:

```text
SecureString cannot be printed by default.
SecureString cannot be logged by default.
SecureString cannot be implicitly converted to String.
SecureString is redacted in all reports.
SecureString is zeroed from memory at flow end (priority cleanup).
```

## Core Principle

```text
Use Decimal or Money<Currency> for financial values — never Float.
Use sized types when protocol or hardware layout matters.
Use compute-shaped types (Matrix/Vector/Tensor) for accelerator workloads.
The compiler enforces shape correctness at compile time where possible.
```
