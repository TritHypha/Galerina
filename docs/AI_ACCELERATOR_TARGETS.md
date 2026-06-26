# AI Accelerator Targets

Galerina should support AI accelerators passively through generic target planning,
capability profiles, adapters and reports.

It should not create permanent language syntax for every hardware vendor or
chipset.

The right model is:

```text
Galerina source syntax:
  prefer ai_accelerator

Runtime or config profile:
  backend intel.gaudi3.hl338

Reports:
  selected_backend: intel.gaudi3.hl338
```

This keeps Galerina vendor-neutral while still allowing the project to understand
important accelerator concepts such as tensor workloads, precision, HBM memory,
framework interop, topology and fallback behaviour.

## Intel Gaudi As A Profile

Galerina should treat Intel Gaudi 3 as an AI accelerator profile, not as a normal CPU
or GPU target.

Intel describes the Intel Gaudi 3 PCIe HL-338 card as an AI accelerator for
inference and fine-tuning in a PCIe Gen 5 form factor. Intel's product brief
lists features including 128GB HBM2e, 96MB on-die SRAM, 600W TDP, 8 MME
engines, 64 Tensor Processor Cores, AI data types including FP8, BF16, FP16,
TF32 and FP32, and HBM bandwidth of 3.7 TB/s.

So Galerina should not ask:

```text
Should this run on CPU, GPU or Gaudi?
```

It should ask:

```text
Is this an AI accelerator workload?
Which accelerator profile is available?
Which framework adapter is allowed?
Which precision is safe?
Where should tensors and model weights live?
What is the fallback path?
What report should be generated?
```

## Generic Target Syntax

Prefer this:

```Galerina
compute auto {
  prefer ai_accelerator
  prefer gpu
  fallback cpu
}
```

Avoid this as public language syntax:

```Galerina
compute target gaudi {
  ...
}
```

Vendor-specific names should be selected by backend policy:

```Galerina
compute_backend {
  ai_accelerator {
    backend auto
    allow ["intel.gaudi3.hl338", "generic_npu", "cpu_reference"]
  }
}
```

This avoids locking Galerina source code to one chipset. Gaudi support can evolve,
and another accelerator can replace it later without requiring application code
to be rewritten.

## Good Workloads

AI accelerator profiles should prefer workloads such as:

```text
LLM inference
LLM fine-tuning
RAG generation
embedding generation
multimodal AI
image and video AI preprocessing
tensor batching
large matrix operations
model serving
```

They should not be selected for:

```text
general web API routing
normal file handling
small scripts
basic JSON validation
ordinary task orchestration
security policy decisions
```

## Practical Adapter Path

The first implementation should be an adapter over existing ecosystems, not a
native compiler backend.

For Intel Gaudi, Intel documents support for familiar AI frameworks including
PyTorch, vLLM and Hugging Face in the Gaudi 3 product brief, and the Gaudi
software page describes support for PyTorch, DeepSpeed, TensorFlow, PyTorch
Lightning and Hugging Face-related workflows.

Practical first path:

```text
Galerina typed AI task
  -> generated adapter config
  -> PyTorch / vLLM / Hugging Face / DeepSpeed workflow
  -> Intel Gaudi software stack when selected
  -> typed Galerina result
  -> Galerina accelerator report
```

Example direction:

```Galerina
secure compute flow answerQuestion(input: RagRequest)
  -> Result<RagAnswer, AiError>
{
  compute auto {
    prefer ai_accelerator
    prefer gpu
    fallback cpu

    workload rag
    framework vllm
    precision auto
    memory max 96gb
    batch auto
    report true
  }

  return ai.rag(input)
}
```

## Tensor Types

AI accelerator planning depends on first-class tensor and batch types.

Useful Galerina concepts:

```text
Tensor<Float32>
Tensor<BF16>
Tensor<FP16>
Tensor<FP8>
EmbeddingVector
TokenBatch
ImageBatch
AudioBatch
VideoFrameBatch
```

`galerina-core-vector` should own tensor shape and numeric element contracts.
`galerina-ai-neural` should own neural workload contracts.
`galerina-core-compute` should own target selection.
`galerina-target-ai-accelerator` should own accelerator capability profiles and
reports.

## Precision Policy

AI accelerator planning must be precision-aware.

For Gaudi 3, Intel lists AI data types including FP8, BF16, FP16, TF32 and FP32,
and highlights FP8 quantization for large language and multimodal models.

Galerina should support policy such as:

```text
precision auto
precision require BF16
precision allow FP8 if accuracy >= 0.98
precision deny FP8 for financial/security-critical output
```

Example:

```Galerina
ai model CustomerSupportLlm {
  precision {
    prefer FP8
    fallback BF16
    require_accuracy_check true
  }

  safety {
    deny_unverified_quantization_for "legal_advice"
    deny_unverified_quantization_for "financial_decision"
  }
}
```

FP8 may improve throughput, but high-impact outputs need verification policy.

## Memory Policy

Accelerator memory is not normal CPU memory.

Galerina should model accelerator memory tiers:

```text
CPU RAM
PCIe transfer
accelerator HBM
accelerator SRAM
pooled HBM across cards
```

For Gaudi 3 HL-338, Intel lists 128GB HBM2e, 96MB on-die SRAM and 3.7 TB/s HBM
bandwidth. Galerina should therefore optimise for:

```text
keep tensors on accelerator
avoid unnecessary CPU to accelerator transfers
batch prompts together
stream token output efficiently
cache model weights in HBM
report HBM pressure
reduce batch size on out-of-memory
```

Example direction:

```Galerina
memory ai_accelerator {
  keep_model_weights_on_device true
  batch_inputs auto
  avoid_host_round_trips true
  max_hbm_use 110gb
  fallback_on_oom smaller_batch
}
```

## Topology Awareness

AI accelerators may appear as one independent device, a group of devices, or a
pooled topology.

Intel's Gaudi 3 PCIe product brief describes 1x4, 2x4 and 4x1 card layouts. It
describes 1x4 as four cards with 512GB pooled HBM2e, 2x4 as two groups of four
cards with 2 x 512GB pooled HBM2e, and 4x1 as four independent cards without a
top bridge.

Galerina should therefore ask:

```text
How many accelerator cards?
Are they independent?
Are they pooled?
Is there a bridge or scale-up fabric?
What is the interconnect bandwidth?
Should the model be sharded?
Should separate models run independently?
```

Example policy direction:

```Galerina
ai_accelerator topology auto {
  if layout == "pooled_1x4" {
    prefer model_sharding
    allow pooled_hbm
  }

  if layout == "independent_4x1" {
    prefer independent_models
    prefer parallel_inference_services
  }

  if layout == "pooled_2x4" {
    prefer large_model_or_two_model_groups
  }
}
```

## Reports

Every accelerator build or run should generate reports.

Possible outputs:

```text
app.ai-accelerator-report.json
app.tensor-report.json
app.precision-report.json
app.memory-report.json
app.compute-placement-report.json
```

Vendor-specific details can appear in the report, but should not become public
Galerina syntax.

Example:

```json
{
  "target": "ai_accelerator",
  "backend": "intel.gaudi3.hl338",
  "available": true,
  "cardsDetected": 4,
  "topology": "pooled_1x4",
  "hbmTotalGb": 512,
  "precisionSelected": "FP8",
  "fallbackPrecision": "BF16",
  "framework": "vllm",
  "warnings": [
    {
      "message": "Prompt batch too small. Accelerator utilisation may be low."
    },
    {
      "message": "Model output returns through CPU after every token. Use streaming token buffer."
    }
  ]
}
```

## Benchmarks

`galerina-tools-benchmark` should benchmark accelerator behavior generically:

```bash
Galerina benchmark --target ai_accelerator --light
Galerina benchmark --target ai_accelerator --llm
Galerina benchmark --target ai_accelerator --rag
Galerina benchmark --target ai_accelerator --multimodal
```

The report can identify the selected backend:

```json
{
  "target": "ai_accelerator",
  "backend": "intel.gaudi3.hl338"
}
```

Useful benchmark measurements:

```text
tokens per second
batch throughput
latency per request
accelerator memory use
host-to-accelerator transfer cost
multi-card scaling
FP8 versus BF16 accuracy/performance
embedding throughput
RAG retrieval plus generation pipeline
fallback to CPU/GPU
```

## Implementation Phases

```text
Phase 1
  detect AI accelerator availability and generate reports

Phase 2
  generate external model-runtime adapter configs

Phase 3
  allow compute auto to choose ai_accelerator for AI tasks

Phase 4
  add precision and memory policy: FP8, BF16, HBM, batching

Phase 5
  add multi-card topology reports and placement recommendations

Phase 6
  optionally add deeper compiler/runtime integration if stable hooks exist
```

## Safety Rules

```text
Do not make vendor names part of normal source syntax.
Do not require AI accelerator hardware for baseline Galerina.
Do not claim native accelerator execution unless an adapter/backend actually ran.
Do not silently downgrade precision.
Do not use FP8 for high-impact decisions without verification policy.
Do not treat accelerator output as trusted security logic.
Always report selected backend, precision, memory tier, topology and fallback.
```

## Package Ownership

```text
galerina-core-compute
  generic ai_accelerator selection and fallback planning

galerina-target-ai-accelerator
  capability profiles, framework adapters, precision and memory reports

galerina-ai
  model metadata, inference safety and AI output policy

galerina-ai-neural
  neural workload contracts

galerina-core-vector
  tensor and shape contracts

galerina-tools-benchmark
  generic ai_accelerator benchmark target and backend-specific report fields
```

## References

- Intel Gaudi 3 PCIe product brief: <https://cdrdv2-public.intel.com/817488/Gaudi%203%20PCIe%20Product%20Brief_RB_1_V6.pdf>
- Intel Gaudi software: <https://www.intel.com/content/www/us/en/software/ai-accelerators/gaudi-software.html>
