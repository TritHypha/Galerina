# AI Compute Plan

## Purpose

Galerina should not treat AI work as unknown code.

Galerina should treat AI work as declared, typed, planned compute.

Core principle:

```text
Typed intent before compute.
```

## Problem

Many runtimes see AI work as opaque function calls:

```text
some function calls a model
runtime does not understand the model
runtime does not understand the data
runtime does not understand the compute shape
```

Galerina should require AI work to declare:

- input type
- output type
- model type
- data sensitivity
- compute target
- memory needs
- precision level
- latency target
- allowed tools
- audit needs

## AI Compute Flow

```text
AI request
 -> classify workload
 -> choose model/backend
 -> choose precision
 -> choose CPU/GPU/NPU/TPU/VPU/FPGA/ASIC/WASM when allowed
 -> allocate memory once
 -> batch if possible
 -> execute
 -> audit
```

## What Galerina Should Understand

Galerina should know:

- the kind of AI work: classification, embedding, generation, ranking, vision or planning
- the sensitivity of the data: public, internal, private, secret or regulated
- the required precision: exact, approximate, low precision or quantised
- the latency target: realtime, background or batch
- the allowed hardware: CPU only, GPU/NPU/TPU/VPU/FPGA/ASIC allowed or remote model allowed
- the output contract: text, JSON, score, decision, vector or action plan
- the authority: infer only, read memory, write memory, call tool or edit code

## Concept Syntax

```galerina
ai classify SupportTicketRisk {
  input: SupportTicketSummary
  output: RiskLevel
  precision: low
  latency: realtime
  data: private
  compute: local_npu preferred, cpu fallback
  effects: none
  audit: required
}
```

The runtime can infer:

```text
small classification
private data
no tools allowed
local hardware preferred
low precision acceptable
audit required
```

It can then choose a smaller model, a quantised format, local hardware,
preallocated memory and typed output validation.

## Security And Efficiency Benefits

### Model Routing

Small tasks should use small models. Complex or high-risk decisions can require
larger governed models and audit.

### Quantisation

The runtime may choose lower precision only when the declared precision and risk
policy allow it.

### Batching

Compatible AI requests may be batched when doing so preserves data boundaries,
tenant isolation, permissions and audit.

### Zero-Copy AI Buffers

Galerina should prefer typed input views, tensor views and typed output views over
repeated JSON/object/string/tensor conversions.

### Static AI Graphs

Predictable AI tasks can become planned graphs:

```text
tokenise
embed
classify
filter
respond
```

The graph should remain policy-aware and reportable.

### Data Minimisation

Only the required fields should enter AI compute.

```text
full customer record: rejected by default
required fields only: preferred
```

This improves speed, memory, privacy, security and cost.

## Cache Rule

Some AI outputs can be cached safely, such as embeddings for the same document
or classification for the same known input.

AI caches must be:

- bounded
- typed
- audited
- data-sensitive
- permission-aware
- safe to delete
- never required for correctness

## Runtime Ownership

`galerina-ai` describes provider-neutral AI inference contracts.

`galerina-core-runtime` should understand AI compute plans as governed runtime
work.

`galerina-core-compute` and target packages choose where work runs.

`galerina-core-security` owns secret and privacy checks.

`galerina-core-reports` owns shared report shapes.

Specialist hardware targets such as NPU, TPU, VPU, FPGA and AI ASIC must remain
governed compute targets. See [Specialist AI Hardware Compute Targets](specialist-ai-hardware-compute-targets.md).

## Reports

AI compute plans should produce:

```text
ai-compute-plan-report.json
ai-memory-report.json
ai-target-report.json
ai-data-minimisation-report.json
ai-audit-report.json
```

## Rule

AI may request capabilities, but it may not grant capabilities to itself or
bypass policy, type checks, effect checks or audit.

AI systems that generate or modify code must follow
[AI Self-Modification Governance](ai-self-modification-governance.md).
