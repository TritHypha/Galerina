# Galerina Target AI Accelerator

`galerina-target-ai-accelerator` is the package for NPU, TPU, VPU, FPGA, AI ASIC
and related accelerator target planning contracts.

It belongs in:

```text
/packages-galerina/galerina-target-ai-accelerator
```

Use this package for:

```text
NPU target capability reports
TPU target capability reports
VPU target capability reports
FPGA target capability reports
AI accelerator target planning
AI ASIC target planning
passive accelerator backend profiles
framework adapter planning
precision support reports
memory limit reports
HBM and accelerator memory reports
multi-card topology reports
model operation mapping plans
fallback reports
```

## Boundary

This package plans AI accelerator targets. It does not define neural network
models, tensor shapes, generic AI safety policy or CPU fallback kernels.

AI accelerator support should stay passive and vendor-neutral. Galerina source should
prefer generic target classes such as `ai_accelerator`, `npu`, `tpu`, `vpu`,
`fpga` or `asic`, not a vendor name such as `gaudi`.

Target terminology:

```text
NPU  neural processing unit
TPU  tensor processing unit / AI ASIC
VPU  vision processing unit
FPGA field-programmable gate array
ASIC application-specific integrated circuit
```

NPU support is specifically an AI inference target. It is for model graphs,
tensors, matrix operations, embeddings, image/audio inference and similar neural
workloads. It is not for normal API routing, string parsing, database queries,
security checks or general business logic.

TPU and AI ASIC support should be treated as tensor-heavy accelerator target
planning. Suitable workloads include inference, training, embeddings, ranking,
recommendation, vision, language model execution and matrix-heavy tensor
operations. These targets remain capability-checked, policy-aware, optional and
replaceable.

The preferred source-level shape is generic:

```text
compute target ai_accelerator {
  prefer npu
  fallback gpu
  fallback cpu
  require on_device
  allow network false
  allow silent_fallback false
}
```

Adapters may map that plan to ONNX Runtime execution providers, CoreML, WebNN,
DirectML, QNN, TensorFlow Lite or other backend ecosystems, but those backend
names remain capability/profile details rather than permanent Galerina syntax.
Fallback must be declared and reported.

Vendor devices should be represented as backend profiles selected by config,
adapter policy or capability detection:

```text
ai_accelerator
  backend profile intel.gaudi3.hl338
```

## Intel Gaudi Profile

Intel Gaudi 3 should be represented as an AI accelerator backend profile, not as
a CPU or GPU target and not as permanent Galerina syntax.

The first implementation should use controlled adapters over existing framework
ecosystems such as PyTorch, vLLM, Hugging Face, DeepSpeed, TensorFlow and
PyTorch Lightning where available.

Gaudi-style profile reports should include:

```text
backend profile id
hardware type
selected framework adapter
selected precision
fallback precision
HBM budget
isolation level
data sensitivity allowed
host-to-accelerator transfer warnings
multi-card topology
fallback target
```

Related packages:

| Package | Responsibility |
|---|---|
| `galerina-ai-neural` | Neural model, layer, inference and training contracts |
| `galerina-core-vector` | Vector, matrix and tensor shape contracts |
| `galerina-ai` | Generic AI inference safety and report contracts |
| `galerina-core-compute` | Target selection and fallback planning |
| `galerina-target-cpu` | CPU fallback target planning |
| `galerina-target-gpu` | GPU target planning |
| `galerina-ai-lowbit` | Low-bit AI backend selection |
| `galerina-target-photonic` | Future photonic target planning |
| `galerina-tools-benchmark` | Generic AI accelerator benchmark diagnostics |

Final rule:

```text
galerina-target-ai-accelerator maps suitable AI workloads to NPU/TPU/VPU/FPGA/AI ASIC plans.
Vendor-specific devices are passive backend profiles, not language syntax.
It does not make any accelerator mandatory for Galerina.
CPU-compatible fallback remains the baseline.
```
