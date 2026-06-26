# Galerina Vectorised Dataset Syntax

This document describes the proposed **Vectorised Dataset Syntax** model for
**Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and
accelerator-aware programming language concept.

The goal is to make vectorised data analysis easy to write, easy to read, easy
for AI assistants to understand, and suitable for CPU vector, GPU, photonic or
future accelerator planning.

Status: Draft. This syntax is not parsed by the v0.1 prototype yet.

---

## Summary

Galerina should make vectorisation visible without making the code noisy.

Instead of requiring every vector-capable flow to be declared as a vector flow,
Galerina can infer vector intent from a `vectorize` block.

Recommended rule:

```text
Use `vectorize` inside the flow to mark dataset columns for vector optimisation.
Use `pure vector flow` only when the whole flow should be considered vector-preferred.
Use `pure vector required flow` only when vectorisation must succeed.
```

This keeps normal code clean while still giving the compiler enough information
to optimise.

---

## Core Principle

```text
Vector intent should be explicit where data becomes vectorised, not forced onto every function signature.
```

This means a normal pure flow can contain vectorised sections:

```Galerina
pure flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  ...
}
```

The `vectorize` block tells Galerina:

```text
these fields should be treated as vector-friendly columns
```

---

## Why This Is Cleaner

The earlier syntax was more verbose:

```Galerina
let spend: Vector<Decimal> = vector.from(rows, row => row.spend)
let orders: Vector<Int> = vector.from(rows, row => row.orders)
let refunds: Vector<Int> = vector.from(rows, row => row.refunds)
```

The cleaner syntax is:

```Galerina
let columns = vectorize rows {
  spend = .spend
  orders = .orders
  refunds = .refunds
}
```

This is easier to read because it describes the intent:

```text
turn these dataset fields into vector columns
```

rather than repeating low-level extraction logic.

---

## Basic Example

Input type:

```Galerina
export type CustomerDumpRow {
  id: String
  age: Int
  spend: Decimal
  orders: Int
  refunds: Int
}
```

Result type:

```Galerina
export type CustomerAnalysisResult {
  rowCount: Int
  totalSpend: Decimal
  averageSpend: Decimal
  highValueCustomerCount: Int
  refundRiskCount: Int
}
```

Analysis flow:

```Galerina
/// @purpose Runs customer dump analysis using vectorised dataset columns.
/// @target prefer gpu, fallback cpu_vector, fallback cpu
/// @ai-note The vectorize block marks the dataset columns for vector optimisation.
pure flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let rowCount = rows.length()

  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  let totalSpend = vector.sum(columns.spend)
  let averageSpend = totalSpend / rowCount

  let highValueCustomerCount = vector.countTrue(columns.spend > 500.00)

  let refundRate = columns.refunds / columns.orders
  let refundRiskCount = vector.countTrue(refundRate > 0.10)

  return CustomerAnalysisResult {
    rowCount: rowCount
    totalSpend: totalSpend
    averageSpend: averageSpend
    highValueCustomerCount: highValueCustomerCount
    refundRiskCount: refundRiskCount
  }
}
```

---

## Type Inference

Because `rows` is typed as:

```Galerina
Array<CustomerDumpRow>
```

and `CustomerDumpRow` defines:

```Galerina
spend: Decimal
orders: Int
refunds: Int
```

Galerina can infer:

```text
columns.spend   -> Vector<Decimal>
columns.orders  -> Vector<Int>
columns.refunds -> Vector<Int>
```

The developer does not need to write:

```Galerina
spend: Decimal = .spend
orders: Int = .orders
refunds: Int = .refunds
```

unless they want to override or enforce a specific type.

---

## Optional Explicit Types

Explicit types should still be aLOwed when useful.

```Galerina
let columns = vectorize rows {
  spend: Decimal = .spend
  orders: Int = .orders
  refunds: Int = .refunds
}
```

Use explicit types when:

```text
the source field type needs narrowing
the source field type needs conversion
the developer wants clearer documentation
the compiler cannot infer safely
```

---

## Type Conversion Example

A JSON dump may contain numeric values as strings.

Source type:

```Galerina
export type CustomerDumpRow {
  id: String
  spend: String
  orders: String
  refunds: String
}
```

Vectorised conversion:

```Galerina
let columns = vectorize rows {
  spend: Decimal = toDecimal(.spend)
  orders: Int = toInt(.orders)
  refunds: Int = toInt(.refunds)
}
```

Galerina should check that conversions are explicit and safe.

---

## Flow Modes

For most cases, a normal pure flow is enough:

```Galerina
pure flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  ...
}
```

This means:

```text
this flow is pure
this data section is vectorised
compiler may optimise the vectorised section
fallback is aLOwed
```

Use `pure vector flow` when the whole flow is intended to be vector-oriented:

```Galerina
pure vector flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  ...
}
```

Meaning:

```text
prefer vector optimisation for this flow
fallback is aLOwed unless policy says otherwise
```

Use `pure vector required flow` when vectorisation must succeed:

```Galerina
pure vector required flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  ...
}
```

Meaning:

```text
this flow must be vector-compatible
if Galerina cannot vectorise it, check/build should fail
```

This is useful for performance-critical data analysis, GPU-only workloads,
accelerator-required workloads and benchmark-sensitive code.

Recommended rule:

```text
`vectorize rows { ... }` marks the data operation as vectorised.
`pure vector flow` marks the whole flow as vector-preferred.
`pure vector required flow` makes vectorisation mandatory.
```

---

## Global Vector Policy

Most vector behaviour should be configured globally in `boot.spore`.

```Galerina
vector {
  enabled true

  defaults {
    layout "columnar"
    keep_on_device true
    fusion true
    target_order [gpu, cpu_vector, cpu]
  }

  fallback {
    aLOw_cpu true
    report true
  }

  reports {
    vector_report true
    memory_report true
    target_report true
  }
}
```

This prevents repetitive local policy blocks.

---

## Local Override

A flow should only define local vector policy when it needs different behaviour
from the global default.

```Galerina
pure vector flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult
vector_policy {
  layout "columnar"
  keep_on_device true
  fusion true
  prefer gpu
  fallback cpu_vector
  fallback cpu
} {
  ...
}
```

Most flows should not need this.

---

## Vectorised Dataset Flow

Recommended complete example:

```Galerina
/// @purpose Analyses customer data using vectorised dataset columns.
/// @target prefer gpu, fallback cpu_vector, fallback cpu
/// @ai-note Keep this flow pure. The vectorize block marks spend, orders and refunds as vector columns.
pure flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let rowCount = rows.length()

  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  let totalSpend = vector.sum(columns.spend)
  let averageSpend = totalSpend / rowCount

  let highValueCustomerCount = vector.countTrue(columns.spend > 500.00)

  let refundRate = columns.refunds / columns.orders
  let refundRiskCount = vector.countTrue(refundRate > 0.10)

  return CustomerAnalysisResult {
    rowCount: rowCount
    totalSpend: totalSpend
    averageSpend: averageSpend
    highValueCustomerCount: highValueCustomerCount
    refundRiskCount: refundRiskCount
  }
}
```

---

## Vector-Preferred Version

```Galerina
/// @purpose Analyses customer data using vector-preferred execution.
/// @target prefer gpu, fallback cpu_vector, fallback cpu
pure vector flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let rowCount = rows.length()

  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  let totalSpend = vector.sum(columns.spend)
  let averageSpend = totalSpend / rowCount

  let highValueCustomerCount = vector.countTrue(columns.spend > 500.00)

  let refundRate = columns.refunds / columns.orders
  let refundRiskCount = vector.countTrue(refundRate > 0.10)

  return CustomerAnalysisResult {
    rowCount: rowCount
    totalSpend: totalSpend
    averageSpend: averageSpend
    highValueCustomerCount: highValueCustomerCount
    refundRiskCount: refundRiskCount
  }
}
```

---

## Vector-Required Version

```Galerina
/// @purpose Analyses customer data and requires vector-compatible execution.
/// @target require gpu or cpu_vector, fallback fail
pure vector required flow analyseCustomersFast(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let rowCount = rows.length()

  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  let totalSpend = vector.sum(columns.spend)
  let averageSpend = totalSpend / rowCount

  let highValueCustomerCount = vector.countTrue(columns.spend > 500.00)

  let refundRate = columns.refunds / columns.orders
  let refundRiskCount = vector.countTrue(refundRate > 0.10)

  return CustomerAnalysisResult {
    rowCount: rowCount
    totalSpend: totalSpend
    averageSpend: averageSpend
    highValueCustomerCount: highValueCustomerCount
    refundRiskCount: refundRiskCount
  }
}
```

---

## How Galerina Can Optimise This

The compiler can see:

```text
rows is an array of typed records
vectorize creates columnar vectors
spend, orders and refunds are numeric fields
the flow is pure
vector operations are deterministic
no file, API, database, time or random effects exist
```

Galerina may then optimise using:

```text
CPU vector/SIMD
GPU vector/tensor execution
operation fusion
columnar memory layout
keep-on-device strategy
copy avoidance
Lazy Compact JSON integration
```

---

## Generated Vector Report Example

```json
{
  "vectorAnalysis": {
    "flow": "analyseCustomersFast",
    "source": "src/analysis/customer-analysis.spore:12",
    "mode": "auto",
    "vectorizedBy": "vectorize rows",
    "columns": [
      {
        "name": "spend",
        "type": "Vector<Decimal>",
        "sourceField": "CustomerDumpRow.spend"
      },
      {
        "name": "orders",
        "type": "Vector<Int>",
        "sourceField": "CustomerDumpRow.orders"
      },
      {
        "name": "refunds",
        "type": "Vector<Int>",
        "sourceField": "CustomerDumpRow.refunds"
      }
    ],
    "target": {
      "preferred": "gpu",
      "fallbacks": ["cpu_vector", "cpu"]
    },
    "optimisations": [
      "columnar_layout",
      "operation_fusion",
      "copy_avoidance"
    ]
  }
}
```

---

## AI Guide Integration

The AI guide should explain vectorised dataset sections.

Example:

```markdown
## Vectorised Dataset Analysis

Flow:
`analyseCustomersFast`

Vectorised source:
`vectorize rows`

Columns:

- `spend` from `CustomerDumpRow.spend`
- `orders` from `CustomerDumpRow.orders`
- `refunds` from `CustomerDumpRow.refunds`

Target preference:

- GPU
- CPU vector
- CPU fallback

AI note:
Do not replace `vectorize rows` with repeated manual `vector.from(...)` calls unless needed.
```

---

## Memory Behaviour

The `vectorize` block should work with Galerina's memory model.

Rules:

```text
do not clone the full dataset unnecessarily
use columnar views where possible
borrow source rows where safe
materialise vectors only when needed
reuse Lazy Compact JSON shape information where available
report large materialised columns
```

This keeps memory use low for large JSON dumps and datasets.

---

## Lazy Compact JSON Integration

If the input rows came from a large JSON dump, Galerina can connect:

```text
Lazy Compact JSON
repeated node shape detection
vectorize rows
columnar memory layout
```

Example flow:

```text
JSON dataset
  -> repeated node shape detected
  -> schema-backed compact representation
  -> vectorize selected fields
  -> vector operations
  -> strict result
```

---

## Syntax Rules

The `vectorize` block should use the source collection name.

```Galerina
let columns = vectorize rows {
  spend = .spend
  orders = .orders
}
```

Inside the block:

```text
.spend means the spend field from each row
.orders means the orders field from each row
```

The output is a column collection:

```text
columns.spend
columns.orders
```

---

## Invalid Examples

### Unknown Field

```Galerina
let columns = vectorize rows {
  total = .missingField
}
```

Expected error:

```text
Vectorize error:
CustomerDumpRow has no field missingField.

Source:
  src/analysis/customer-analysis.spore:8
```

### Non-Numeric Vector Operation

```Galerina
let columns = vectorize rows {
  id = .id
}

let total = vector.sum(columns.id)
```

Expected error:

```text
Vector operation error:
vector.sum requires numeric values.
columns.id is Vector<String>.
```

### Effect Inside Vector Flow

```Galerina
pure vector flow analyseCustomers(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let data = http.get("https://example.com")
}
```

Expected error:

```text
Purity error:
pure vector flow cannot perform network access.
```

---

## Recommended Best Practice

Use this for normal dataset analysis:

```Galerina
pure flow analyseCustomers(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  ...
}
```

Use this for vector-heavy flows:

```Galerina
pure vector flow analyseCustomers(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  ...
}
```

Use this only when vectorisation is mandatory:

```Galerina
pure vector required flow analyseCustomers(rows: Array<CustomerDumpRow>) -> CustomerAnalysisResult {
  ...
}
```

---

## Non-Goals

Vectorised Dataset Syntax should not:

```text
force every dataset function to be marked as vector
make simple loops difficult
hide unsafe effects inside vector flows
force GPU usage for small data
make vectorisation required by default
make syntax cryptic with symbols like ->v or | v
```

---

## Open Questions

```text
Should `vectorize` always infer types?
Should explicit types be required for production?
Should `pure vector flow` be only a hint or a stronger contract?
Should `pure vector required flow` fail in Run Mode or only Build Mode?
Should `vectorize` support nested fields like `.customer.age`?
Should `vectorize` support calculated columns?
Should `vectorize` support filtering rows?
Should `vectorize` automatically use Lazy Compact JSON shape maps?
```

---

## Recommended Early Version

Version 0.1:

```text
support vectorize rows syntax
infer vector column types from typed rows
generate vector report
allow vector.sum and vector.countTrue
```

Version 0.2:

```text
add pure vector flow
add pure vector required flow
add global vector policy in boot.spore
add AI guide vector section
```

Version 0.3:

```text
add Lazy Compact JSON integration
add GPU target planning
add operation fusion reports
add memory materialisation reports
```

---

## Final Principle

Galerina should make vectorised dataset analysis readable.

Final rule:

```text
Write dataset analysis like normal code.
Use `vectorize` where rows become columns.
Let the compiler plan CPU vector, GPU or future accelerator execution.
Keep fallback safe.
Report target and memory decisions clearly.
```
