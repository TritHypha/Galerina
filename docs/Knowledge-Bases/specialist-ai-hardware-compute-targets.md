# Specialist AI Hardware Compute Targets

## Purpose

Galerina and LSGR should support specialist AI hardware as governed compute
targets, not as ordinary runtime access and not as permanent vendor-specific
syntax.

Specialist hardware is acceleration, not authority.

## Target Terminology

```text
CPU  = general compute
GPU  = parallel graphics/general accelerator compute
NPU  = neural processing unit
TPU  = tensor processing unit / AI ASIC
VPU  = vision processing unit
FPGA = field-programmable gate array
ASIC = application-specific integrated circuit
```

Related future targets may include:

```text
photonic accelerator
optical accelerator
neuromorphic accelerator
low-bit AI accelerator
```

## Core Rule

```text
Declare the compute.
Verify the authority.
Choose the hardware.
Audit the result.
```

The runtime may use CPU, GPU, NPU, TPU, VPU, FPGA, AI ASIC or future
optical/photonic hardware only when the verified execution plan allows it.

## Compute Boundary

Specialist hardware must enter through a compute boundary.

It must not be treated as:

- unrestricted device access
- hidden native interop
- a source of authority
- a required baseline runtime dependency
- a reason to bypass policy, data classification or audit

## Compute Target Model

Every compute target should declare:

```text
hardware type
provider
driver/runtime
supported precision
supported model formats
supported operation classes
memory limits
isolation level
data sensitivity allowed
tenant sharing status
hardware risk posture
audit requirements
fallback target
```

## Suitable Workloads

Specialist AI hardware may be used for:

```text
tensor operations
inference
training
embeddings
ranking
recommendation
vision
audio inference
language model execution
matrix-heavy workloads
```

It should not be used for normal application concerns such as:

```text
API routing
request parsing
authorization checks
database queries
policy decisions
string-heavy business logic
security-critical secret handling
```

## TPU And AI ASIC Support

TPUs and AI ASICs should be treated as high-performance but restricted compute
targets.

They should remain:

- capability-checked
- policy-aware
- data-classification aware
- auditable
- optional
- replaceable
- fallback-safe

Galerina source should prefer generic target classes such as `tpu`,
`ai_accelerator` or `tensor_accelerator`, while provider and device details
remain backend profiles.

## Suggested Capabilities

```text
capability.compute.cpu
capability.compute.gpu
capability.compute.npu
capability.compute.tpu
capability.compute.vpu
capability.compute.fpga
capability.compute.asic
capability.compute.ai_accelerator
```

## Suggested Effects

```text
effect.compute.infer
effect.compute.train
effect.compute.embed
effect.compute.rank
effect.compute.vision
effect.compute.tensor
effect.compute.accelerator
```

## Example

```galerina
ai infer CustomerRisk {
  input: CustomerRiskInput
  output: RiskScore

  compute: tpu preferred, gpu fallback, cpu safe_fallback
  precision: fp16
  data: private

  capability: compute.tpu
  effects: [compute.infer]
  audit: required
}
```

The runtime must decide:

```text
Is TPU allowed?
Is this data allowed on TPU?
Is the model approved for TPU?
Is the precision allowed?
Is fallback needed?
Can this run on CPU instead?
What audit proof is required?
```

## Runtime Verification

Before selecting specialist hardware, the runtime should verify:

- actor capability
- package permission
- effect declaration
- data classification
- model approval
- target availability
- driver/runtime trust
- memory budget
- precision compatibility
- tenant isolation
- fallback policy
- audit requirement

## Reports

Galerina should generate specialist compute evidence:

```text
compute-target-report.json
specialist-hardware-report.json
ai-accelerator-capability-report.json
accelerator-fallback-report.json
accelerator-data-sensitivity-report.json
accelerator-hardware-risk-report.json
precision-compatibility-report.json
```

Reports should identify which target was selected, why fallback occurred,
whether data was allowed on that target and whether the result was audited.

## Priority Placement

Specialist AI hardware support is a platform concept and target-planning area.

The v1 baseline remains CPU-compatible checked execution. GPU, NPU, TPU, VPU,
FPGA, ASIC, photonic and optical targets are optional target planning unless
needed to define core type-system semantics.

## References

- Google Cloud TPU architecture: https://cloud.google.com/tpu/docs/system-architecture
- Microsoft DirectML AI acceleration overview: https://learn.microsoft.com/windows/ai/directml/dml
- Microsoft Windows ML execution providers: https://learn.microsoft.com/windows/ai/new-windows-ml/accelerate-ai-models

## Best Short Statement

```text
LSGR should not be CPU/GPU-only.

It should use a neutral governed compute model where CPU, GPU, NPU, TPU, VPU,
FPGA, AI ASIC and future optical/photonic hardware are selectable execution
targets under policy, capability, data and audit control.
```
