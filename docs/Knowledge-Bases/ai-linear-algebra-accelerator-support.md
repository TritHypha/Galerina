# AI and Linear Algebra Accelerator Support

## Definition

Galerina supports AI and linear-algebra accelerators through the Neutral Governed IR, making them **first-class governed compute targets** rather than hidden libraries.

```text
Declare the tensor.
Verify the authority.
Choose the accelerator.
Execute efficiently.
Audit the result.
```

## Execution Flow

```text
Galerina source
 -> Governed IR
 -> AI/Linear Algebra Compute Plan
 -> Sheriff approves
 -> Balancer selects hardware
 -> Scheduler queues work
 -> Accelerator module executes
 -> Assembler returns ordered result
 -> Audit proves
```

## 1. Native Tensor and Matrix Types

Galerina exposes these as first-class types:

```galerina
tensor<float16, [1, 768]> EmbeddingVector
matrix<float32, [1024, 1024]> WeightMatrix
```

Types understood by the runtime:

```text
tensor
matrix
vector
embedding
image frame
audio frame
model input
model output
```

## 2. Accelerator Compute Targets

```text
CPU   = general compute
GPU   = parallel accelerator compute
NPU   = neural processing
TPU   = tensor / AI ASIC
VPU   = vision processing
ASIC  = specialist fixed-function compute
FPGA  = reconfigurable hardware
```

Hardware is declared with preferences, not hard-coded to a vendor:

```galerina
compute: npu preferred, gpu fallback, cpu safe_fallback
```

## 3. Declared Accelerator Capabilities

```text
capability.compute.gpu
capability.compute.npu
capability.compute.tpu
capability.compute.vpu
capability.compute.asic
capability.compute.tensor
capability.compute.infer
capability.compute.train
```

No accelerator access unless declared and approved.

## 4. Linear Algebra Operations in Governed IR

The IR represents:

```text
matmul
conv2d
softmax
attention
embedding_lookup
normalise
quantise
dequantise
batch
reduce
transpose
```

Different backends lower these to CPU, GPU, NPU, TPU, VPU, or ASIC.

## 5. Precision Awareness

```text
float32
float16
bfloat16
int8
int4
future tri-state/optical formats
```

Precision is declared and runtime-controlled:

```galerina
ai infer ProductRank {
  input: ProductQuery
  output: RankedProducts
  precision: int8 allowed
  compute: npu preferred, cpu fallback
  audit: required
}
```

## 6. AI Compute Plan

Before execution the runtime builds a plan:

```text
input type
tensor shape
model identity
precision
memory layout
allowed hardware
fallback hardware
batching strategy
audit requirement
```

## 7. Zero-Copy Accelerator Buffers

Avoid expensive conversion chains:

```text
JSON -> object -> array -> tensor -> GPU buffer -> tensor -> object
```

Prefer:

```text
typed view -> tensor view -> accelerator buffer -> typed output view
```

## 8. Batching and Scheduling

The Scheduler groups compatible work:

```text
same model
same tensor shape
same precision
same hardware target
```

Then runs one efficient batch instead of many tiny calls.

## 9. Accelerator Trust Levels

```text
dedicated CPU        = high trust
shared GPU           = restricted
remote TPU           = policy controlled
unknown accelerator  = denied
```

The Sheriff decides if the accelerator is allowed for the data sensitivity level.

## 10. Audit Proof for AI/Linear Algebra

Every accelerator execution records:

```text
model used
model hash/version
input contract
output contract
precision used
hardware target
fallback used
capabilities used
data sensitivity
policy decision
```

## Core Principle

```text
AI compute should be typed, planned, governed, scheduled, accelerated, and audited.
```

## Implementation Status

This feature requires:
- [ ] Tensor/matrix types in syntax
- [ ] Accelerator capabilities in the IR
- [ ] Linear algebra operations in Governed IR
- [ ] Precision annotations in syntax
- [ ] Compute plan generation in the runtime
- [ ] Accelerator trust level enforcement in the Sheriff
- [ ] Batching support in the Scheduler
- [ ] Audit trail for accelerator execution
