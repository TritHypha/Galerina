# Hybrid Electronic-Optical Compute

## Definition

Galerina is designed as a **hybrid governed compute runtime** where electronic systems govern and photonic/optical systems accelerate. The two layers work together but are architecturally distinct.

```text
Electronics govern.
Photonics accelerate.
Unify through governed IR.
```

## The Core Mistake to Avoid

The wrong model:

```text
photonic compute replaces electronic compute
```

The correct model:

```text
electronic systems handle governance and control
photonic systems handle dense parallel compute
conversions are minimised and intentional
the runtime understands compute shape before execution
```

## The Two Layers

### 1. Governed Control Layer (Electronic-First)

Responsible for:

```text
security
policy
capabilities
branching
runtime governance
scheduling
memory ownership
audit
control flow
```

This layer is deterministic, branch-heavy, stateful, and governed. This is where Sheriff, Director, Steward, Balancer, and Scheduler primarily live.

### 2. Dense Compute Layer (Photonic/Accelerator-Friendly)

Responsible for:

```text
tensor math
matrix operations
AI inference
signal transforms
vector search
dense parallel operations
```

This layer is batch-oriented, flow-oriented, parallel, and stream-oriented. Best suited for GPU, NPU, TPU, photonic accelerators, and future optical systems.

## Optical Suitability

Good optical candidates:

```text
AI inference
matrix multiplication
signal processing
vector search
ranking
embeddings
simulation
vision workloads
```

Bad optical candidates:

```text
branch-heavy logic
policy systems
capability enforcement
small random operations
pointer-heavy execution
```

```text
Governance enforcement stays electronic.
Dense tensor compute may become optical.
```

## Compute-Aware Syntax

Galerina should allow developers and AI systems to declare compute intent:

```galerina
tensor<float16, [4096,4096]> weights

compute optical preferred {
  matmul(weights, input)
}
```

This declares that the workload may benefit from optical acceleration — it does not force it.

## Conversion-Aware Design

Conversions between electronic and optical execution have a cost:

```text
energy
latency
precision loss
memory movement
```

The runtime should avoid:

```text
electronic -> optical -> electronic -> optical  (unnecessary conversions)
```

Prefer keeping workloads inside one domain as long as possible:

```galerina
boundary optical {
  batch infer ProductRankModel
}
```

## Precision-Aware Types

Future photonic systems may not use classic binary precision. Galerina should expose precision intentionally:

```galerina
precision: fp16
precision: int8
precision: ternary
precision: analog_approximate
```

## IR Changes for Hybrid Compute

The Governed IR should represent:

```text
compute density
tensor shape
conversion boundaries
precision class
optical suitability
batching opportunities
data movement cost
control-flow graphs
compute-flow graphs
signal-flow graphs
```

Not just CPU instruction sequences.

## Runtime Cost Model

Before choosing hardware, the runtime should estimate:

```text
conversion cost
memory movement
tensor size
precision loss
batch efficiency
hardware load
thermal pressure
energy usage
```

The Balancer and Steward work together to make this decision.

## Future Syntax Direction

Galerina may eventually distinguish block types:

```galerina
control {
  validate request
  check capability
  approve execution
}

compute optical {
  run inference batch
}
```

## Memory Model

Traditional: random mutable RAM.

Future hybrid systems may use:

```text
electronic state memory
+ optical flow buffers
+ stream persistence
+ accelerator-local memory
```

Galerina should therefore prefer: immutable views, stream pipelines, batch processing, compute locality.

## Long-Term Vision

```text
Galerina Source
 -> Governed IR
 -> Runtime Planning
 -> Compute Classification
 -> Hybrid Electronic/Optical Execution Graph
 -> Governed Conversion Boundaries
 -> Hardware Execution
 -> Audit Proof
```

## Core Principle

```text
Keep governance electronic.
Keep dense parallel math optical.
Convert rarely.
Batch heavily.
Plan compute before conversion.
Preserve governed execution throughout.
```

```text
Do not optimise the conversion.
Optimise avoiding the conversion.
```

```text
Galerina should model governed computation
independent of hardware medium.
```
