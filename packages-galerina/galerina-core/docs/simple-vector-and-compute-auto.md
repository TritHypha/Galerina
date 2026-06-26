# Galerina Simple Vector Syntax and Compute Auto

Ownership note: `galerina-core` may document language syntax for vector flows and
`compute auto`, but vector semantics belong in `packages-galerina/galerina-core-vector/` and compute
planning semantics belong in `packages-galerina/galerina-core-compute/`.

This document describes the proposed **Simple Vector Syntax** and **Compute Auto** model for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

The goal is to keep Galerina friendly for normal developers while still allowing advanced optimisation for CPU vector, GPU, photonic, MZI and future accelerator targets.

---

## Summary

Galerina should not force normal developers to write complex hardware-style types such as:

```Galerina
Vector<1024, Float16>
```

This is useful for advanced compiler, AI or hardware work, but it is too confusing for many developers.

Instead, Galerina should support simple, readable syntax:

```Galerina
pure flow calculateVat(subtotal: Money) -> Money {
  return subtotal * 0.20
}
```

```Galerina
pure vector flow analyseCustomers(rows: CustomerRows) -> CustomerAnalysisResult {
  ...
}
```

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Advanced vector details should live in:

```text
type definitions
model definitions
compiler reports
target reports
AI guides
generated schemas
```

not in every function signature.

---

## Core Principle

```text
Keep normal Galerina code simple.
Hide hardware-specific vector details unless advanced control is needed.
Let the compiler infer and optimise where possible.
Use `compute auto` to choose the best available compute target.
```

---

## Why This Matters

This style is too technical for everyday code:

```Galerina
pure vector flow scoreFraud(features: Vector<1024, Float16>) -> Vector<256, Float32> {
  ...
}
```

It exposes:

```text
Vector
1024
Float16
Vector
256
Float32
```

That may be useful for AI model internals, but it makes the language harder to learn.

A friendlier version is:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

This keeps the intent clear:

```text
pure          = deterministic, no side effects
vector        = vector-friendly
float         = approximate numeric/AI-style maths
flow          = named unit of behaviour
FraudFeatures = business-friendly input type
FraudScore    = business-friendly output type
compute auto  = Galerina chooses the best compute target
```

---

## Recommended Developer Levels

Galerina should support different levels of detail.

---

## Level 1: Beginner / App Developer

Use simple business types.

```Galerina
type Money = Decimal

pure flow calculateVat(subtotal: Money) -> Money {
  return subtotal * 0.20
}
```

This is easy to understand:

```text
subtotal is money
the result is money
the calculation is pure
```

---

## Level 2: Data / AI Developer

Use simple vector-friendly declarations without exposing hardware shape details.

```Galerina
type FraudFeatures
type FraudScore

pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

This tells Galerina:

```text
this is pure
this is vector-friendly
this uses float-style maths
the compiler may target CPU vector, GPU, photonic, MZI or CPU fallback
```

---

## Level 3: Advanced Compiler / Hardware Developer

Use explicit vector shapes and precision only when needed.

```Galerina
type FraudFeatureVector = Vector<1024, Float16>
type FraudScoreVector = Vector<256, Float32>

pure vector float flow scoreFraudRaw(features: FraudFeatureVector) -> FraudScoreVector {
  compute auto {
    return fraudWeights * features
  }
}
```

This level is for:

```text
AI library authors
compiler/runtime developers
hardware target developers
performance-critical kernels
```

Most Galerina application developers should not need to write this.

---

## Simple Type Aliases

Galerina should encourage readable type aliases.

```Galerina
type Money = Decimal
type Score = Float
type CustomerRows = Array<CustomerDumpRow>
type FraudFeatures
type FraudScore
```

Then normal code stays readable:

```Galerina
pure flow calculateVat(subtotal: Money) -> Money {
  return subtotal * 0.20
}
```

```Galerina
pure vector flow analyseCustomers(rows: CustomerRows) -> CustomerAnalysisResult {
  ...
}
```

---

## Decimal vs Float

Galerina should make the difference clear.

Use `Decimal` or `Money` for business values:

```Galerina
type Money = Decimal

let subtotal: Money = 140.00
let vat: Money = calculateVat(subtotal)
```

Use `Float`, `Float16`, `Float32` or `Float64` for approximate numeric work:

```Galerina
let score: Float = 0.92
```

Recommended rule:

```text
Decimal / Money = money, VAT, invoices and business totals
Float* = AI, scoring, vectors, graphics, science and approximate maths
Int = whole numbers
```

---

## Simple Flow Modifiers

Galerina can use readable modifiers before `flow`.

```Galerina
pure flow
pure vector flow
pure vector float flow
pure vector decimal flow
pure vector required flow
```

---

## `pure flow`

Use for deterministic calculations.

```Galerina
pure flow calculateVat(subtotal: Money) -> Money {
  return subtotal * 0.20
}
```

Meaning:

```text
same input returns same output
no API calls
no database access
no file access
no random values
no hidden external state
```

---

## `pure vector flow`

Use for deterministic vector-friendly data analysis.

```Galerina
pure vector flow analyseCustomers(rows: CustomerRows) -> CustomerAnalysisResult {
  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  let totalSpend = vector.sum(columns.spend)
  let averageSpend = totalSpend / rows.length()

  return CustomerAnalysisResult {
    rowCount: rows.length()
    totalSpend: totalSpend
    averageSpend: averageSpend
  }
}
```

Meaning:

```text
the flow is pure
the flow contains vector-friendly work
fallback is allowed unless policy says otherwise
```

---

## `pure vector float flow`

Use for deterministic vector-friendly approximate maths.

Good for:

```text
AI scoring
model inference
risk scoring
matrix maths
tensor maths
signal processing
GPU/photonic candidates
```

Example:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Meaning:

```text
this is pure
this is vector-friendly
this uses float-style approximate maths
Galerina can consider GPU, photonic_mzi, wavelength, CPU vector or CPU fallback
```

---

## `pure vector decimal flow`

Use for deterministic vector-friendly business-safe maths.

Good for:

```text
bulk invoice totals
VAT calculations
financial summaries
price analysis
stock value summaries
```

Example:

```Galerina
pure vector decimal flow calculateInvoiceTotals(rows: InvoiceRows) -> InvoiceSummary {
  let columns = vectorize rows {
    subtotal = .subtotal
    vat = .vat
  }

  return InvoiceSummary {
    totalSubtotal: vector.sum(columns.subtotal)
    totalVat: vector.sum(columns.vat)
  }
}
```

Meaning:

```text
vector-friendly
but still uses Decimal-style business-safe maths
```

---

## `pure vector required flow`

Use only when vectorisation must succeed.

```Galerina
pure vector required flow analyseCustomers(rows: CustomerRows) -> CustomerAnalysisResult {
  ...
}
```

Meaning:

```text
if Galerina cannot vectorise this flow, check/build should fail
```

This is useful for:

```text
performance-critical code
benchmark-sensitive code
accelerator-required workloads
specialised numeric libraries
```

---

## Vectorised Dataset Syntax

Galerina should use `vectorize` to mark dataset fields for vector optimisation.

```Galerina
let columns = vectorize rows {
  spend = .spend
  orders = .orders
  refunds = .refunds
}
```

This is simpler than:

```Galerina
let spend: Vector<Decimal> = vector.from(rows, row => row.spend)
let orders: Vector<Int> = vector.from(rows, row => row.orders)
let refunds: Vector<Int> = vector.from(rows, row => row.refunds)
```

The `vectorize` block means:

```text
turn selected row fields into vector-friendly columns
```

---

## Type Inference in `vectorize`

If `rows` is typed:

```Galerina
type CustomerDumpRow {
  id: String
  spend: Decimal
  orders: Int
  refunds: Int
}
```

then Galerina can infer:

```text
columns.spend   = vector of Decimal values
columns.orders  = vector of Int values
columns.refunds = vector of Int values
```

So this is enough:

```Galerina
let columns = vectorize rows {
  spend = .spend
  orders = .orders
  refunds = .refunds
}
```

Explicit types should still be allowed when needed:

```Galerina
let columns = vectorize rows {
  spend: Decimal = .spend
  orders: Int = .orders
  refunds: Int = .refunds
}
```

---

## Compute Auto

`compute auto` lets Galerina choose the best available compute target.

Instead of writing hardware-specific code:

```Galerina
compute target photonic_mzi fallback gpu fallback cpu {
  ...
}
```

normal developers can write:

```Galerina
compute auto {
  ...
}
```

The target order is defined globally in `boot.spore`.

---

## Example `boot.spore` Compute Policy

```Galerina
compute {
  target_selection "auto"

  prefer [
    photonic_mzi,
    wavelength,
    gpu,
    cpu_vector,
    cpu
  ]

  fallback true

  reports {
    target_report true
    precision_report true
    fallback_report true
  }
}
```

This means:

```text
try photonic_mzi if available and suitable
otherwise try wavelength
otherwise try GPU
otherwise try CPU vector
otherwise use CPU
```

---

## Compute Auto Example

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Galerina decides whether this should run on:

```text
photonic_mzi
wavelength
GPU
CPU vector
CPU
```

depending on:

```text
hardware availability
data type
operation type
shape information
precision policy
security policy
fallback policy
```

---

## Hardware Detection

Before `main()` runs, Galerina should detect available compute targets.

Startup flow:

```text
1. Read boot.spore
2. Validate compute policy
3. Detect CPU features
4. Detect GPU support
5. Detect photonic / MZI support
6. Detect wavelength target support
7. Build target capability map
8. Run main()
```

Example internal capability map:

```json
{
  "availableTargets": {
    "photonic_mzi": {
      "available": false,
      "reason": "No MZI runtime detected"
    },
    "wavelength": {
      "available": false,
      "reason": "No wavelength backend detected"
    },
    "gpu": {
      "available": true,
      "supportsFloat16": true
    },
    "cpu_vector": {
      "available": true,
      "features": ["AVX2"]
    },
    "cpu": {
      "available": true
    }
  }
}
```

---

## Automatic Target Selection

For a `compute auto` block, Galerina should check:

```text
is the flow pure?
is the data numeric?
is this vector, matrix or tensor style work?
are shapes known, inferred or bounded?
is precision acceptable?
is the target available?
is fallback allowed?
is verification required?
```

Selection rule:

```text
photonic_mzi available and operation suitable
  -> use photonic_mzi

else wavelength available and operation suitable
  -> use wavelength

else GPU available and operation suitable
  -> use GPU

else CPU vector available and operation suitable
  -> use CPU vector

else
  -> use normal CPU
```

---

## Support for `photonic_mzi`

Galerina may support `photonic_mzi` as an advanced target-plugin or deployment-profile
target.

MZI means:

```text
Mach-Zehnder interferometer
```

In Galerina, `photonic_mzi` should be treated as an optional plugin-backed target for
suitable numeric vector/matrix compute, not as a mandatory core target.

Good candidates:

```text
matrix-vector multiplication
matrix-matrix multiplication
AI inference
signal processing
complex-valued maths
large vector transforms
optical neural network layers
```

Poor candidates:

```text
API routing
JSON parsing
database access
file I/O
payment logic
security decisions
exact accounting
```

---

## Photonic MZI Through `compute auto`

Normal developer code should not need to say:

```Galerina
compute target photonic_mzi fallback gpu fallback cpu {
  ...
}
```

Instead, `boot.spore` may declare that `photonic_mzi` is allowed when a matching
target plugin or deployment profile exists:

```Galerina
compute {
  target_selection "auto"

  prefer [
    photonic_mzi,
    gpu,
    cpu_vector,
    cpu
  ]

  fallback true
}
```

Then normal code can stay clean:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Galerina can select `photonic_mzi` only if:

```text
hardware is available
target plugin or deployment profile is available
operation is suitable
flow is pure
input is numeric/vector/matrix compatible
precision/tolerance policy is satisfied
fallback and verification rules are satisfied
```

---

## Explicit Photonic MZI Target

Advanced users should still be able to force a target for testing, benchmarking or hardware-specific builds.

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute target photonic_mzi required {
    return FraudModel.predict(features)
  }
}
```

Meaning:

```text
photonic_mzi is required
if unavailable or unsuitable, check/build fails
requires a matching target plugin or deployment profile
```

This should be rare in normal application code.

---

## Compute Target Levels

Galerina should support three levels of target control.

---

## Level 1: Fully Automatic

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  return FraudModel.predict(features)
}
```

Galerina may infer compute automatically from:

```text
pure vector float flow
model prediction
numeric input/output
global compute policy
```

---

## Level 2: Compute Auto

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

This clearly marks the section as compute work, but does not hard-code hardware.

Recommended for most AI/vector code.

---

## Level 3: Explicit Target

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute target photonic_mzi required {
    return FraudModel.predict(features)
  }
}
```

Use only when:

```text
testing a target
benchmarking a target
building for known hardware
requiring a special accelerator
```

---

## Precision Without Confusing Signatures

Precision should not clutter normal flow signatures.

Avoid this in normal app code:

```Galerina
pure vector flow scoreFraud(features: Vector<1024, Float16>) -> Vector<256, Float32> {
  ...
}
```

Prefer this:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Then define advanced precision in the model or type:

```Galerina
model FraudModel {
  input FraudFeatures
  output FraudScore

  precision {
    input Float16
    compute Float16
    accumulate Float32
    output Float32
    tolerance 0.001
  }
}
```

This keeps function code friendly.

---

## Model-Based Detail

Model definitions can hold the technical details.

```Galerina
model FraudModel {
  input FraudFeatures
  output FraudScore

  vector {
    input_size 1024
    output_size 256
  }

  precision {
    input Float16
    compute Float16
    accumulate Float32
    output Float32
    tolerance 0.001
  }

  targets {
    prefer [photonic_mzi, gpu, cpu_vector, cpu]
    fallback true
  }
}
```

Then the developer writes:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

---

## Dataset Analysis Example

```Galerina
type CustomerRows = Array<CustomerDumpRow>

type CustomerDumpRow {
  id: String
  spend: Decimal
  orders: Int
  refunds: Int
}

type CustomerAnalysisResult {
  rowCount: Int
  totalSpend: Decimal
  averageSpend: Decimal
  refundRiskCount: Int
}

pure vector decimal flow analyseCustomers(rows: CustomerRows) -> CustomerAnalysisResult {
  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  compute auto {
    totalSpend = vector.sum(columns.spend)
    averageSpend = totalSpend / rows.length()
    refundRiskCount = vector.countTrue((columns.refunds / columns.orders) > 0.10)
  }

  return CustomerAnalysisResult {
    rowCount: rows.length()
    totalSpend: totalSpend
    averageSpend: averageSpend
    refundRiskCount: refundRiskCount
  }
}
```

This is readable and still optimisable.

---

## AI Scoring Example

```Galerina
type FraudFeatures
type FraudScore

pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Advanced detail goes elsewhere:

```Galerina
model FraudModel {
  input FraudFeatures
  output FraudScore

  vector {
    input_size 1024
  }

  precision {
    input Float16
    compute Float16
    accumulate Float32
    output Float32
    tolerance 0.001
  }

  targets {
    prefer [photonic_mzi, wavelength, gpu, cpu_vector, cpu]
    fallback true
  }
}
```

---

## Generated Target Report

Galerina should report what target was selected.

```json
{
  "computeTargetSelection": {
    "flow": "scoreFraud",
    "source": "src/risk/fraud.spore:8",
    "computeMode": "auto",
    "operation": "model_predict",
    "selectedTarget": "gpu",
    "preferredTarget": "photonic_mzi",
    "fallbackUsed": true,
    "fallbackReason": "photonic_mzi runtime not available",
    "checkedTargets": [
      {
        "target": "photonic_mzi",
        "available": false,
        "suitable": true
      },
      {
        "target": "gpu",
        "available": true,
        "suitable": true
      },
      {
        "target": "cpu_vector",
        "available": true,
        "suitable": true
      },
      {
        "target": "cpu",
        "available": true,
        "suitable": true
      }
    ]
  }
}
```

---

## Generated AI Guide Section

```markdown
## Compute Auto Summary

Flow:
`scoreFraud`

Developer code:
`compute auto`

Model:
`FraudModel`

Target preference:
1. photonic_mzi
2. wavelength
3. gpu
4. cpu_vector
5. cpu

Selected target:
GPU

Reason:
No photonic MZI target plugin was available. GPU was available and suitable.

AI note:
Do not hard-code `compute target photonic_mzi` unless the project requires that
hardware and a target plugin or deployment profile is available.
```

---

## Security Rules

Galerina should enforce safety around compute targets.

```text
compute auto cannot perform file I/O
compute auto cannot perform database I/O
compute auto cannot call APIs
compute auto cannot handle secrets unless explicitly allowed
compute auto cannot make final security decisions directly
photonic/plugin targets cannot run business side effects
photonic/plugin target results must return to strict Galerina types
fallback must be reported
```

---

## Good Candidate Workloads

Good for `compute auto`:

```text
AI inference
risk scoring
fraud scoring
matrix operations
vector operations
dataset analysis
signal processing
image/audio transforms
recommendation scoring
large numeric transforms
```

---

## Poor Candidate Workloads

Poor for `compute auto`:

```text
API routing
JSON parsing
payment decisions
database writes
file access
secret handling
email sending
business side effects
small if/else logic
exact accounting
```

---

## Beginner-Friendly Rule

Normal Galerina developers should mostly write:

```Galerina
pure flow calculateVat(subtotal: Money) -> Money {
  return subtotal * 0.20
}
```

```Galerina
pure vector flow analyseCustomers(rows: CustomerRows) -> CustomerAnalysisResult {
  ...
}
```

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

They should not normally need to write:

```Galerina
Vector<1024, Float16>
```

or:

```Galerina
compute target photonic_mzi fallback gpu fallback cpu
```

unless they are working at an advanced level.

---

## Non-Goals

Simple Vector Syntax and Compute Auto should not:

```text
hide unsafe behaviour
force GPU/photonic use for small tasks
make vectorisation mandatory by default
require developers to understand hardware details
remove advanced control for library authors
silently change precision without reporting
silently use photonic_mzi without reporting
```

---

## Open Questions

```text
Should `Float` default to Float32 or Float64?
Should `pure vector float flow` imply approximate maths?
Should `pure vector decimal flow` restrict GPU/photonic targets by default?
Should `compute auto` be required or inferred from model calls?
Should model definitions own precision policy?
Should photonic_mzi always require verification?
Should beginner code hide all Vector<N, Type> syntax?
Should reports expose advanced vector shapes even when code hides them?
```

---

## Recommended Early Version

Version 0.1:

```text
support simple type aliases
support pure vector flow
support vectorize rows syntax
support compute auto
use global compute target policy from boot.spore
generate target report
```

Version 0.2:

```text
support pure vector float flow
support pure vector decimal flow
support model-based precision details
support CPU vector and GPU target planning
```

Version 0.3:

```text
support photonic_mzi as an optional plugin/deployment target profile
support explicit compute target photonic_mzi required when a target plugin exists
support target capability detection
support AI guide compute summaries
```

Version 0.4:

```text
support wavelength target planning
support hardware verification reports
support fallback benchmarking
support cloud accelerator profiles
```

---

## Final Principle

Galerina should be friendly first and powerful underneath.

Final rule:

```text
Use simple business types in normal code.
Use `vectorize` to mark datasets for vector optimisation.
Use `compute auto` to let Galerina choose the best target.
Hide advanced vector shapes behind types, models and reports.
Support photonic_mzi as an advanced target without forcing developers to write hardware-specific code.
```
