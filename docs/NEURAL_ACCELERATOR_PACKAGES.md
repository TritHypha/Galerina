# Neural And Accelerator Packages

## Summary

Galerina should support neural-network workloads through typed packages and target
planning, not by making neural networks part of normal app syntax.

Best rule:

```text
Galerina core defines the language.
galerina-core-vector defines vector, matrix and tensor shapes.
galerina-ai-neural defines neural network workloads.
galerina-ai-neuromorphic defines spike/event workloads.
galerina-core-compute selects targets and fallback plans.
target packages map planned work to CPU, GPU, AI accelerator or photonic plans.
```

## Package Split

```text
packages-galerina/galerina-core-vector
  Vector<T, N>, Matrix<T, R, C>, Tensor<T, Shape>, numeric element contracts

packages-galerina/galerina-ai-neural
  neural models, layers, activations, inference, training boundaries

packages-galerina/galerina-ai-neuromorphic
  Spike, SpikeTrain, EventSignal<T>, spiking models

packages-galerina/galerina-ai
  generic AI model metadata, safety policy and AI inference reports

packages-galerina/galerina-ai-lowbit
  low-bit, quantized and ternary AI backend contracts

packages-galerina/galerina-core-compute
  compute auto, target selection and fallback reports

packages-galerina/galerina-target-ai-accelerator
  NPU, TPU, AI-chip and passive accelerator backend profile planning

packages-galerina/galerina-target-photonic
  future photonic target planning
```

## Photonic And `-1`

`-1`, `0` and `+1` can appear in more than one Galerina package, but they do not mean
the same thing everywhere.

```text
galerina-core-logic
  Tri truth/logical state semantics

galerina-ai-lowbit
  ternary or low-bit model weights

galerina-core-photonic
  possible optical signal mappings for logic or compute states

galerina-target-photonic
  backend plans for photonic hardware or simulators
```

Photonic support should not own `Tri`. `Tri` belongs to `galerina-core-logic`. Photonic
packages can map logic states to optical properties such as phase, amplitude or
wavelength.

## Neural Workloads

Neural inference should be a typed compute workload:

```Galerina
secure compute flow moderateText(input: Text) -> Result<ModerationDecision, AiError> {
  compute auto {
    prefer ai_accelerator
    prefer gpu
    fallback cpu
  }

  let result: ClassificationResult = neural.infer("moderation-model", input)
  return policy.moderation.decide(result)
}
```

Neural output is untrusted by default. Confidence, classification and
distribution outputs are not `Bool` and must not directly authorize security,
payment or access-control decisions.

## Training Workloads

Training should be more constrained than inference because it can consume large
amounts of memory, storage, accelerator time and sensitive data.

Training plans must declare:

```text
dataset reference
data policy
loss function
optimizer
epochs
batch size
memory limit
timeout
target preference
fallback behavior
```

## Target Planning

Target selection should stay generic:

```text
compute auto
prefer ai_accelerator
prefer gpu
prefer low_bit_ai
fallback cpu
```

Do not make source syntax depend on one backend, chipset or vendor.

Vendor-specific AI accelerators should be backend profiles. For example, Intel
Gaudi 3 can be selected as `intel.gaudi3.hl338` under the generic
`ai_accelerator` target, but Galerina source should not need `target gaudi`.

The practical first implementation should generate controlled adapter plans for
existing AI ecosystems such as PyTorch, vLLM, Hugging Face, DeepSpeed,
TensorFlow or PyTorch Lightning before attempting native backend integration.

Reports should record:

```text
requested target
selected target
selected backend
fallback reason
model name
precision
memory limit
thread or accelerator limit
warnings
```

## Non-Goals

- Do not make Galerina core a neural-network framework.
- Do not make BitNet, Graphify, a GPU vendor or an AI accelerator vendor part of
  Galerina syntax.
- Do not require photonic, GPU or AI accelerator hardware for baseline Galerina.
- Do not let model output directly make high-impact decisions.
- Do not put neural layers or training policy into `galerina-core-vector`.

## Final Rule

```text
Galerina should be able to define, check, run, accelerate and report neural workloads.
It should do that through typed packages and target plans, not by turning the
core language into a neural-network framework.
```
