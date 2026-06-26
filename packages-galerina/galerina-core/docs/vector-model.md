# Galerina Hybrid Scalar + Vector Model

Ownership note: `galerina-core` may document vector syntax and compiler checks, but
vector values, lanes, dimensions, operations and vector reports belong in
`packages-galerina/galerina-core-vector/`.

This document defines a security-first design for adding vector-aware execution to **Galerina / Galerina**.

The goal is not to make Galerina a pure vector language. The goal is to let Galerina support normal readable application logic while giving developers and the compiler a safe way to optimise repeated, data-heavy work.

For dataset-column syntax, `vectorize rows { ... }`, vector-preferred flows,
vector-required flows and generated vector reports, see
`docs/vectorised-dataset-syntax.md`.

Recommended model:

```text
Scalar logic by default.
Vector logic when repeated work is safe.
Scalar fallback when vector execution is unavailable or disabled.
Compiler reports for every optimisation decision.
Security checks before any vectorisation.
```

This aLOws Galerina to support:

```text
normal business workflows
frontend form validation
backend services
batch processing
maths-heavy workloads
AI/tensor helpers
image/audio/data processing
CPU SIMD
WebAssembly SIMD
GPU planning
CPU worker nodes
future accelerator targets
```

---

## Core Principle

Galerina should use a hybrid model:

```text
Scalar code = one value or one workflow step at a time.
Vector code = repeated work over many values.
```

Scalar code remains the default because it is clearer for:

```text
business rules
payments
database transactions
API calls
UI events
authentication
authorisation
security checks
error handling
state changes
```

Vector code is used for repeated work where each item can be handled safely and independently.

Recommended Galerina position:

```text
Galerina is scalar-first and vector-aware.
```

---

## How This Changes Code

The hybrid scalar + vector model encourages developers to separate:

```text
workflow logic
repeated calculations
side effects
storage operations
network operations
memory-heavy processing
```

Traditional scalar style:

```Galerina
let totals = []

for item in order.items {
  totals.add(item.price * item.quantity)
}
```

Hybrid Galerina style:

```Galerina
let itemTotals = vector order.items {
  item => item.price * item.quantity
}
```

The vector version tells the compiler:

```text
This is repeated work.
Each item can probably be handled independently.
This may be suitable for CPU SIMD, WASM SIMD, GPU or CPU workers.
This must pass safety checks before optimisation.
```

The main workflow should still be written in normal scalar style.

Example:

```Galerina
secure flow checkout(order: Order) -> Result<Receipt, Error> {
  validate order

  let itemTotals = vector order.items {
    item => item.price * item.quantity
  }

  let total = sum itemTotals

  let payment = await PaymentApi.charge(order.customer, total)

  return payment
}
```

Meaning:

```text
validate order = scalar workflow/security logic
vector order.items = repeated safe calculation
PaymentApi.charge = scalar async side effect
return payment = scalar result handling
```

This makes the code more explicit and easier to audit.

---

## Why Hybrid Is Better Than Vector-First

A pure vector-first language can be powerful for maths, but it is not ideal for normal applications.

Galerina should avoid forcing everything into vector form.

| Model | Security | Memory | Performance | Developer Experience |
|---|---|---|---|---|
| Pure scalar | Strong for workflows | Predictable | Can be slower for repeated work | Familiar and readable |
| Pure vector | Risky for side effects | Can create large hidden copies | Excellent for maths/data workloads | Awkward for normal apps |
| Hybrid scalar + vector | Best balance | Can be optimised safely | Fast where suitable | Clear intent and readable code |

---

## Developer Control

Developers should have direct control over vector syntax.

Normal scalar code:

```Galerina
let total = calculateOrderTotal(order)
```

Explicit vector code:

```Galerina
let itemTotals = vector order.items {
  item => item.price * item.quantity
}
```

The `vector` keyword tells the compiler:

```text
This is repeated work.
Each item should be independent.
This may be suitable for optimisation.
This must pass security and purity checks.
This must have scalar fallback unless strict mode says otherwise.
```

---

## Security-First Vector Rules

Vector blocks should be pure by default.

ALOwed inside vector blocks:

```text
maths
validation
normalisation
formatting
scoring
classification
image transformation
audio transformation
data transformation
read-only calculations
pure function calls
```

Blocked by default inside vector blocks:

```text
database writes
payment actions
network calls
file system writes
secret access
environment variable access
global mutation
session mutation
user account mutation
random external side effects
uncontrolled logging
```

ALOwed:

```Galerina
let scores = vector users readonly {
  user => calculateRiskScore(user)
}
```

Blocked:

```Galerina
let results = vector users {
  user => saveToDatabase(user)
}
```

Compiler error:

```text
galerina-ERR-VECTOR-SECURITY-001: Side effect "saveToDatabase" is not aLOwed inside vector block.
```

Reason:

```text
Vector blocks are pure by default. Database writes must be performed in scalar flow, an explicit transaction block, or an approved worker/offload block.
```

---

## Why Side Effects Are Dangerous

Vector execution may change:

```text
execution order
error order
timing
thread/worker placement
memory placement
CPU/GPU/WASM target
retry behaviour
partial failure behaviour
```

This is dangerous for:

```text
payments
database writes
emails
authentication changes
stock reservation
account updates
audit logging
security-sensitive workflows
```

Therefore Galerina should keep these actions in scalar code unless the developer uses a specialised, explicit construct.

---

## Scalar Fallback and Backwards Compatibility

Code written with vector syntax must still be able to run when vector execution is disabled, unless the project explicitly requires vector acceleration.

Example vector code:

```Galerina
let itemTotals = vector order.items {
  item => item.price * item.quantity
}
```

If vector acceleration is disabled, Galerina should compile it as safe scalar code:

```Galerina
let itemTotals = []

for item in order.items {
  itemTotals.add(item.price * item.quantity)
}
```

The behaviour should remain the same. The execution target changes, but the meaning of the program does not.

Recommended default:

```text
Vector syntax is aLOwed.
Vector acceleration is optional.
Scalar fallback is enabled.
Compiler reports when fallback is used.
```

Example `boot.spore`:

```Galerina
boot {
  optimisation {
    vector {
      enabled true
      mode explicit_and_suggest
      fallback scalar
      require_pure_functions true
      block_side_effects true
      generate_report true
    }
  }
}
```

Example report:

```json
{
  "vector": {
    "enabled": true,
    "requestedBlocks": 1,
    "acceleratedBlocks": 0,
    "fallbackBlocks": 1,
    "fallback": "scalar",
    "notes": [
      "Vector block in src/checkout.spore:5 compiled to scalar fallback because vector execution is disabled for this target."
    ]
  }
}
```

---

## Strict Mode

Some applications may require vector execution for performance.

Example:

```Galerina
boot {
  optimisation {
    vector {
      enabled true
      mode explicit
      fallback disabled
      require_vector_execution true
    }
  }
}
```

If vector execution is unavailable, the compiler should fail:

```text
galerina-ERR-VECTOR-REQUIRED-001: Vector execution was required, but this target does not support it.
```

Suggestion:

```text
Enable scalar fallback, choose a vector-capable target, or remove require_vector_execution.
```

---

## Vector Modes

Galerina should support clear project-level modes.

| Mode | Meaning | Recommended Use |
|---|---|---|
| `off` | Do not use vector acceleration. Compile vector syntax to scalar fallback if aLOwed | Maximum compatibility |
| `explicit` | Only optimise blocks written with `vector` | Safe default for production |
| `explicit_and_suggest` | Optimise explicit vector blocks and report scalar code that could be vectorised | Best general default |
| `safe_auto` | Automatically vectorise scalar code only when the compiler can prove safety | Advanced projects |
| `aggressive` | Optimise heavily with fewer restrictions | Not recommended for secure Galerina apps |

Recommended Galerina default:

```text
explicit_and_suggest
```

Recommended security-first production mode:

```text
explicit
```

Recommended research/performance mode:

```text
safe_auto
```

Avoid by default:

```text
aggressive
```

---

## Auto-Vectorisation

Galerina may auto-vectorise scalar code only when it can prove safety.

The compiler should not silently rewrite the developer's source files.

Good:

```text
Compiler detects safe scalar code and emits vector-optimised output.
Compiler generates a report.
Developer can review what happened.
```

Bad:

```text
Compiler secretly changes source files.
Compiler vectorises code with side effects.
Compiler changes payment/database/network behaviour.
Compiler hides memory aLOcations.
```

Example scalar code:

```Galerina
let totals = []

for item in order.items {
  totals.add(item.price * item.quantity)
}
```

The compiler may detect:

```text
no side effects
no network calls
no database writes
no shared mutation
no dependency between items
no secret access
deterministic calculation
```

Then it may compile the loop as:

```text
CPU scalar
CPU SIMD
WebAssembly SIMD
CPU worker chunking
GPU compute block
future accelerator target
```

But only if it is safe.

---

## Suggestions Instead of Source Rewrites

Galerina should provide a command that suggests vector syntax without changing files automatically.

Example command:

```bash
Galerina suggest vector
```

Example output:

```text
src/checkout.spore:4

This loop may be suitable for vector syntax.

Current:
for item in order.items {
  totals.add(item.price * item.quantity)
}

Suggested:
let totals = vector order.items {
  item => item.price * item.quantity
}
```

Possible future command:

```bash
Galerina refactor vector --interactive
```

This should be interactive and reviewable.

---

## Memory Usage Rules

The hybrid model is good for memory usage only if Galerina avoids hidden copies.

Bad memory behaviour:

```Galerina
let a = vectorData.map(clean)
let b = a.map(validate)
let c = b.map(score)
let d = c.filter(highRisk)
```

This could create multiple large intermediate arrays.

Galerina should prefer:

```text
lazy pipelines
streaming
chunked processing
read-only references
copy-on-write
explicit clone()
move ownership where safe
compiler memory reports
```

Better vector pipeline:

```Galerina
let highRisk = vector users readonly
  |> map normalizeUser
  |> map calculateRiskScore
  |> filter score > 80
  |> collect
```

The compiler should be aLOwed to fuse the pipeline into fewer passes where safe.

Possible compiled behaviour:

```text
read users as read-only input
process in chunks
avoid storing every intermediate result
collect only final high-risk scores
use scalar fallback if vector execution is disabled
```

Example memory configuration:

```Galerina
boot {
  runtime {
    memory {
      hidden_copies false
      copy_on_write true
      require_explicit_clone true
      max_vector_memory "512mb"
      chunk_large_vectors true
      default_chunk_size 4096
    }
  }
}
```

---

## Explicit Clone Rule

Bad:

```Galerina
let copy = largePayload
```

Better:

```Galerina
let copy = clone(largePayload)
```

Better for read-only vector work:

```Galerina
let summary = vector largePayload.items readonly {
  item => summarise(item)
}
```

Core rule:

```text
Large immutable values should be passed by safe read-only reference.
Full copies must be explicit.
Mutation must be explicit.
```

---

## Compiler Security Checks

Before compiling vector code, Galerina should check:

```text
Is the vector block pure?
Does the block access secrets?
Does the block access environment variables?
Does the block perform network calls?
Does the block write to a database?
Does the block mutate global state?
Does each item depend on previous items?
Does the block rely on execution order?
Does the block contain unsafe randomness?
Does the block handle errors safely?
Can scalar fallback preserve behaviour?
```

If any check fails, Galerina should either:

```text
fail compilation
fall back to scalar with a warning
require explicit developer override
```

For security-first Galerina, fail closed by default.

---

## Compiler Memory Checks

The compiler should also check:

```text
Will vectorisation create large intermediate arrays?
Will CPU/GPU transfer cost exceed expected benefit?
Is chunking required?
Is streaming possible?
Is copy-on-write possible?
Is the input read-only?
Is a full clone required?
Does target memory support this workload?
```

Example warning:

```text
galerina-WARN-VECTOR-MEMORY-004: Vector pipeline may aLOcate a large intermediate result.
```

Suggestion:

```text
Use a streaming vector pipeline or add chunk size configuration.
```

---

## Error Handling

Vector blocks should return structured errors.

Example:

```Galerina
let results = vector rows {
  row => validateRow(row)
} errors collect
```

Possible behaviour:

```text
each row is validated
errors are collected with row references
the whole operation does not hide failures
```

Example result handling:

```Galerina
match results {
  Ok(validRows) => continueImport(validRows)
  Err(errors)   => return ImportError.RowValidation(errors)
}
```

Galerina should avoid hidden partial failure.

---

## Order Rules

Vector code should not rely on execution order unless explicitly declared.

Default:

```text
Vector execution order is not guaranteed internally.
Final result order should be preserved by default unless unordered output is explicitly declared.
```

Examples:

```Galerina
let scores = vector users preserve_order {
  user => calculateRiskScore(user)
}
```

```Galerina
let scores = vector users unordered {
  user => calculateRiskScore(user)
}
```

Security-first default:

```text
Preserve output order unless the developer explicitly aLOws unordered output.
```

---

## Floating-Point and Precision Rules

Vector, SIMD, GPU and WASM targets can produce small differences in floating-point results.

Galerina should provide precision controls.

Example:

```Galerina
compute target best {
  precision decimal required
  fallback scalar

  let totals = vector order.items {
    item => item.price * item.quantity
  }
}
```

For money, Galerina should avoid unsafe floating-point maths.

Recommended money rule:

```text
Use Decimal or Money types for financial calculations.
Do not use Float32/Float64 for payments, invoices, tax or accounting totals unless explicitly aLOwed.
```

Compiler warning:

```text
galerina-WARN-MONEY-PRECISION-001: Float type used inside financial vector calculation.
```

---

## Frontend and Browser Behaviour

For browser targets, vector code could compile to:

```text
JavaScript scalar fallback
JavaScript array operations
WebAssembly SIMD where supported
Web worker chunks
GPU/WebGPU in a future version
```

Example:

```Galerina
target browser

let scores = vector formRows {
  row => validateRow(row)
}
```

If WebAssembly SIMD is unavailable:

```text
Compile to JavaScript scalar fallback.
Keep behaviour the same.
Report fallback.
```

Browser security rule:

```text
Vector code compiled to the frontend is public code.
It must not contain secrets, private API keys, server-only imports, or environment access.
```

---

## Backend Behaviour

For backend targets, vector code could compile to:

```text
normal CPU scalar fallback
CPU SIMD
CPU worker nodes
GPU compute
batch/offload workers
```

Example:

```Galerina
let cleanRows = vector uploadedRows readonly {
  row => cleanImportRow(row)
}
```

If CPU worker nodes are enabled, Galerina may chunk work across workers.

If workers are disabled, Galerina falls back to scalar.

---

## Primary Lane and Offload Integration

The vector model should integrate with Galerina's primary lane/offload nodes idea.

Example:

```Galerina
boot {
  runtime {
    primary_lane {
      reserve true
      priority high
    }

    offload_nodes {
      cpu enabled
      max_cpu_percent 70
      leave_cores 1
    }
  }

  optimisation {
    vector {
      enabled true
      mode explicit_and_suggest
      fallback scalar
    }
  }
}
```

Example code:

```Galerina
let cleaned = offload cpu_nodes {
  vector rows readonly {
    row => cleanRow(row)
  }
}
```

Meaning:

```text
the primary lane stays free
rows are processed by CPU nodes
the vector block must pass security checks
if vector acceleration is unavailable, CPU nodes may use scalar fallback
```

---

## Example Files to Add Later

Do not add these as executable `.spore` examples until parser support exists for `vector` blocks.

Recommended future examples:

```text
examples/vector/checkout-vector.spore
examples/vector/vector-disabled-scalar-fallback.spore
examples/vector/vector-memory-safe-pipeline.spore
examples/vector/vector-security-blocked-side-effect.spore
```

Example checkout vector:

```Galerina
secure flow checkout(order: Order) -> Result<Receipt, Error> {
  validate order

  let itemTotals = vector order.items preserve_order {
    item => item.price * item.quantity
  }

  let total = sum itemTotals

  let payment = await PaymentApi.charge(order.customer, total)

  return payment
}
```

Example side-effect rejection:

```Galerina
secure flow importUsers(users: List<User>) -> Result<ImportSummary, Error> {
  let results = vector users {
    user => saveToDatabase(user)
  }

  return Ok(summary(results))
}
```

Expected compiler behaviour:

```text
Compilation fails.
Database write is not aLOwed inside vector block by default.
Developer must move the database write outside the vector block or use an explicit safe worker/transaction pattern.
```

---

## Compiler Report

Galerina should generate:

```text
build/app.vector-report.json
```

Example:

```json
{
  "target": "browser",
  "vector": {
    "enabled": true,
    "mode": "explicit_and_suggest",
    "fallback": "scalar",
    "explicitBlocks": 2,
    "autoVectorisedBlocks": 0,
    "fallbackBlocks": 1,
    "blockedBlocks": 1
  },
  "security": {
    "sideEffectsBlocked": 1,
    "secretAccessBlocked": 0,
    "networkCallsBlocked": 0,
    "databaseWritesBlocked": 1
  },
  "memory": {
    "hiddenCopiesALOwed": false,
    "copyOnWrite": true,
    "chunkLargeVectors": true,
    "maxVectorMemory": "512mb"
  },
  "suggestions": [
    {
      "file": "src/checkout.spore",
      "line": 8,
      "message": "Loop may be suitable for vector syntax."
    }
  ]
}
```

---

## Testing Requirements

Galerina should include tests for:

```text
vector syntax parses correctly
vector blocks compile to scalar fallback when vector is disabled
side effects are blocked inside vector blocks
secret access is blocked inside vector blocks
database writes are blocked inside vector blocks
order preservation works
unordered mode works only when declared
memory report detects large intermediate arrays
Money/Decimal precision warnings work
compiler reports fallback decisions
safe auto-vectorisation only works for proven-safe loops
```

---

## Suggested Implementation Order

```text
1. Add vector model documentation.
2. Add vector syntax examples as docs.
3. Add boot/main configuration options.
4. Add parser support for vector blocks.
5. Add scalar fallback lowering.
6. Add security checks for vector blocks.
7. Add memory checks and hidden-copy warnings.
8. Add vector report generation.
9. Add vector suggestions for safe scalar loops.
10. Add safe_auto mode later.
11. Add CPU SIMD/WASM SIMD targets later.
12. Add GPU planning later.
13. Add real GPU execution much later.
```

---

## Minimum Viable Version

The first version does not need real SIMD, WASM or GPU execution.

MVP:

```text
vector syntax
scalar fallback
pure-function checks
side-effect blocking
secret blocking
memory warnings
compiler report
suggestions for suitable loops
```

---

## Summary

Galerina should adopt a hybrid scalar + vector model.

The safest design is:

```text
Scalar-first for workflows and side effects.
Vector-aware for repeated safe calculations.
Pure vector blocks by default.
Side effects blocked by default.
Scalar fallback for backwards compatibility.
Strict mode available for performance-critical systems.
No silent source rewriting.
Compiler reports every vector decision.
Memory usage controlled by read-only references, copy-on-write, chunking and explicit clone().
```

Recommended tagline:

```text
Galerina is scalar-first, vector-aware, and security-first.
```
