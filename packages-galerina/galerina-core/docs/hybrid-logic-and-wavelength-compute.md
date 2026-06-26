# Galerina Hybrid Logic and Wavelength Compute

Ownership note: logic semantics belong in `packages-galerina/galerina-core-logic/`, vector concepts
belong in `packages-galerina/galerina-core-vector/`, compute planning belongs in
`packages-galerina/galerina-core-compute/`, photonic vocabulary belongs in `packages-galerina/galerina-core-photonic/`
and photonic backend target planning belongs in `packages-galerina/galerina-target-photonic/`.

This document describes the proposed **Hybrid Logic and Wavelength Compute**
model for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and
accelerator-aware programming language concept.

The goal is to let Galerina combine normal binary logic, vector compute, three-way
logic, GPU acceleration, photonic/ternary logic and future wavelength-based
analogue compute without making the language difficult for developers to use.

Status: Research. Wavelength compute is a future target-planning concept, not a
v0.1 prototype backend.

---

## Summary

Galerina should not use only one compute model.

The strongest design is a hybrid model:

```text
2-way binary logic
  -> normal CPU logic, control flow, APIs, JSON, security and exact decisions

2-way binary + vector
  -> CPU SIMD/vector acceleration for maths and data processing

GPU vector/tensor compute
  -> AI inference, matrix multiplication, batch processing and large numeric workloads

3-way logic
  -> true / false / unknown
  -> allow / deny / review
  -> uncertainty-aware business and security decisions

3-way photonic + vector
  -> future photonic or ternary-compatible vector operations

wavelength compute
  -> analogue photonic maths for suitable pure compute blocks
```

Core rule:

```text
Use exact logic where correctness matters.
Use vector/accelerator logic where performance matters.
Use three-way logic where uncertainty matters.
Use wavelength logic only for suitable pure maths.
```

---

## Core Principle

Galerina source code should stay clean for developers.

The compiler should decide how to lower suitable parts of the program into CPU,
vector, GPU, photonic, ternary or wavelength execution plans.

Developers should write clear Galerina code.

The compiler should produce:

```text
target reports
precision reports
fallback reports
memory reports
AI guides
source maps
```

For modern CPU/GPU feature detection, hardware-assisted security features and
deployment guidance, see `docs/hardware-feature-detection-and-security.md`.

---

## Hybrid Flow

```text
Galerina Source Code
        |
        v
Parser / Type Checker / Security Checker
        |
        v
Classify code by purpose
        |
        +--> Exact control logic
        |       |
        |       +--> 2-way binary CPU
        |       |       |
        |       |       +--> APIs
        |       |       +--> JSON parsing
        |       |       +--> authentication
        |       |       +--> security checks
        |       |       +--> database and file access
        |
        +--> Vector / tensor maths
        |       |
        |       +--> 2-way binary + CPU vector
        |       +--> GPU vector / tensor
        |       +--> 3-way photonic + vector
        |       +--> wavelength / analogue photonic
        |
        +--> Uncertainty / decision logic
        |       |
        |       +--> 3-way logic
        |               |
        |               +--> Allow / Deny / Review
        |               +--> True / False / Unknown
        |
        +--> Large JSON / data handling
                |
                +--> borrowed JSON
                +--> Lazy Compact JSON
                +--> low-memory data views

All paths return to strict Galerina values.
        |
        v
Source maps / reports / AI guide
```

---

## Compute Layers

Galerina should support several layers of execution.

```text
Layer 1: 2-way binary
Layer 2: 2-way binary + vector
Layer 3: GPU vector/tensor
Layer 4: 3-way logic
Layer 5: 3-way photonic + vector
Layer 6: wavelength / analogue photonic
```

---

## Layer 1: 2-Way Binary

This is normal CPU execution.

Use for:

```text
API routing
JSON parsing
authentication
authorisation
database access
file access
business rules
exact branching
security checks
payment decisions
logging
error handling
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

This should stay exact and digital.

---

## Layer 2: 2-Way Binary + Vector

This uses normal binary hardware but takes advantage of vector or SIMD-style
processing where possible.

Use for:

```text
small numeric loops
batch validation
normalisation
array processing
simple maths
data transformation
```

Example:

```Galerina
pure flow normaliseScores(scores: Vector<1024, Float32>) -> Vector<1024, Float32> {
  return scores / max(scores)
}
```

The compiler may lower this to CPU vector instructions.

---

## Layer 3: GPU Vector / Tensor

This is for larger maths and AI workloads.

Use for:

```text
matrix multiplication
tensor operations
batch AI inference
vector similarity
image processing
audio processing
large numeric transforms
embedding comparison
```

Example:

```Galerina
compute target gpu fallback cpu {
  logits = model.forward(inputBatch)
}
```

The compiler should report whether the operation is GPU-suitable.

---

## Layer 4: 3-Way Logic

Three-way logic is for uncertainty and safer decisions.

Example:

```Galerina
logic Decision {
  Deny
  Review
  ALOw
}
```

Use for:

```text
fraud checks
payment checks
access control
AI confidence routing
manual review workflows
security policy decisions
```

Example:

```Galerina
secure flow riskToDecision(score: RiskScore) -> Decision {
  match score {
    score >= 0.80 => Deny
    score >= 0.40 => Review
    _ => ALOw
  }
}
```

Important rule:

```text
Uncertainty should not be forced into true or false.
```

---

## Layer 5: 3-Way Photonic + Vector

This is a future hardware-aware model where three-way logic and vector
operations may be mapped to photonic or ternary-capable targets.

Use for:

```text
ternary-compatible AI weights
three-state model logic
positive / neutral / negative vector operations
uncertainty-aware model output
photonic vector planning
```

Example:

```Galerina
compute target photonic fallback gpu fallback cpu {
  prefer_logic Tri
  result = ternaryModel(features)
}
```

Galerina should always provide fallback:

```text
preferred target: photonic
fallback 1: GPU
fallback 2: CPU
```

---

## Layer 6: Wavelength / Analogue Photonic

Wavelength compute is for future analogue photonic maths.

Use for:

```text
matrix multiplication
tensor operations
signal processing
AI inference
large vector transforms
Fourier-like operations
```

Do not use for:

```text
payment status checks
security decisions
cryptography
JSON parsing
database writes
exact accounting
API routing
```

Example:

```Galerina
compute target wavelength fallback gpu fallback cpu {
  precision {
    input Float16
    compute Analogue
    accumulate Float32
    tolerance 0.001
  }

  verify {
    cpu_reference true
    max_error 0.001
  }

  riskScore = fraudModel(features)
}
```

The result must return to a strict Galerina type before business decisions are made.

---

## Hybrid Example

```Galerina
secure flow handleOrder(req: Request) -> Result<Response, ApiError> {
  let input: CreateOrderRequest = json.decode<CreateOrderRequest>(req.body)

  let paymentDecision: Decision = checkPayment(input.payment)

  match paymentDecision {
    Deny   => return JsonResponse({ "status": "denied" })
    Review => return JsonResponse({ "status": "review" })
    Allow  => continue
  }

  compute target wavelength fallback gpu fallback cpu {
    precision {
      input Float16
      compute Analogue
      accumulate Float32
      tolerance 0.001
    }

    verify {
      cpu_reference true
      max_error 0.001
    }

    riskScore = fraudModel(input.features)
  }

  let finalDecision: Decision = riskToDecision(riskScore)

  match finalDecision {
    Allow  => shipOrder(input)
    Review => holdForReview(input)
    Deny   => cancelOrder(input)
  }
}
```

---

## Developer Experience

Developers should be able to write simple Galerina:

```Galerina
compute target best {
  result = model.forward(features)
}
```

The compiler should handle:

```text
CPU fallback
GPU planning
photonic planning
wavelength planning
precision checks
memory checks
source maps
target reports
AI guide summaries
```

Developers should not need to write separate low-level versions manually.

Developer-friendly rules:

```text
Simple syntax first.
Explicit target blocks only where needed.
Safe defaults.
Clear fallback.
Generated reports explain what happened.
Source maps point back to original .spore files.
AI guide summarises the compiled or checked logic.
```

---

## Energy Efficiency

Hybrid logic can help energy efficiency by avoiding unnecessary CPU work.

Galerina should prefer:

```text
CPU for exact control
CPU vector for small numeric work
GPU for large batch/tensor work
photonic/wavelength for suitable maths if available
```

This avoids using heavy targets for tiny jobs.

Bad:

```text
send tiny if/else logic to GPU or wavelength target
```

Good:

```text
keep small exact logic on CPU
send large pure matrix work to accelerator
```

---

## Short CPU Cycles

Galerina should reduce CPU cycles through:

```text
pure flow caching
compile-time evaluation
CPU vectorisation
operation fusion
GPU offload for large tensors
wavelength offload for suitable maths
lazy JSON decoding
borrowed large values
copy-on-write
```

Example:

```Galerina
pure flow normalisePostcode(postcode: String) -> String
cache {
  scope process
  memory_limit 8mb

  on_limit {
    action "bypass_cache"
    report true
  }
} {
  return postcode.trim().uppercase().replace(" ", "")
}
```

---

## Low Memory Usage

Galerina should avoid hidden memory costs.

Rules:

```text
large values are borrowed by read-only reference
full copies require clone()
modified JSON uses copy-on-write
dataset-style JSON can use Lazy Compact JSON
cache memory is limited per cached flow
cache limit uses bypass_cache rather than failing
long-lived memory is reported
```

Example:

```Galerina
let payload: Json = req.json()

verifySignature(&payload)
processWebhook(&payload)
```

Expected behaviour:

```text
payload loaded once
payload borrowed by reference
no repeated 500kb copies
payload cleaned up when owning flow ends
```

---

## AI Understanding

Galerina should generate AI-readable explanations from the code.

Generated files may include:

```text
app.ai-guide.md
app.ai-context.json
app.target-report.json
app.security-report.json
app.memory-report.json
app.map-manifest.json
app.source-map.json
```

The AI guide should explain:

```text
which code runs on CPU
which code is vectorised
which code is GPU-suitable
which code is photonic/wavelength-suitable
which logic domains are used
which fallbacks exist
which precision rules apply
which memory optimisations are active
```

Example AI guide section:

```markdown
## Hybrid Compute Summary

Flow: `handleOrder`

CPU binary logic:
- JSON decode
- payment decision
- final order action

Three-way logic:
- `Decision`: Deny / Review / ALOw

Accelerator block:
- target: wavelength
- fallback: GPU, CPU
- operation: `fraudModel(features)`
- precision: Float16 input, analogue compute, Float32 accumulation
- verification: CPU reference, max error 0.001

Memory:
- request JSON borrowed by reference
- no hidden large clones detected
```

---

## Target Report Example

```json
{
  "hybridCompute": {
    "flow": "handleOrder",
    "source": "src/orders/handle-order.spore:1",
    "logic": [
      {
        "domain": "Decision",
        "states": ["Deny", "Review", "ALOw"],
        "target": "cpu",
        "reason": "security-sensitive exact decision"
      }
    ],
    "computeBlocks": [
      {
        "name": "fraudModel",
        "preferredTarget": "wavelength",
        "fallbacks": ["gpu", "cpu"],
        "precision": {
          "input": "Float16",
          "compute": "Analogue",
          "accumulate": "Float32",
          "tolerance": 0.001
        },
        "verification": {
          "cpuReference": true,
          "maxError": 0.001
        }
      }
    ]
  }
}
```

---

## Safety Rules

Galerina should enforce:

```text
wavelength logic cannot perform file, network or database I/O
wavelength logic cannot handle secrets
wavelength logic cannot make final security decisions directly
analogue results must return to strict typed Galerina values
precision and tolerance must be declared
fallback must be declared
security decisions must remain exact and exhaustive
```

---

## Candidate Workloads

Good candidates:

```text
AI inference
fraud scoring
recommendation scoring
image processing
audio processing
signal processing
vector similarity
large matrix operations
large batch transforms
```

Poor candidates:

```text
small if/else logic
API routing
JSON parsing
database queries
file reads
secret handling
cryptographic verification
payment state transitions
exact accounting
```

---

## Recommended Galerina Rule

```text
Scalar business logic stays simple.
Exact security logic stays digital.
Three-way logic handles uncertainty.
Pure vector/tensor logic can be moved to GPU, photonic or wavelength targets.
All accelerator results return to strict Galerina types before business decisions.
```

---

## Final Principle

Galerina should use hybrid logic to balance:

```text
developer friendliness
energy efficiency
short CPU cycles
low memory usage
AI understanding
future hardware compatibility
```

Final rule:

```text
Write clean Galerina.
Compile intelligently.
Run exact logic exactly.
Accelerate pure maths safely.
Report every target decision clearly.
```
