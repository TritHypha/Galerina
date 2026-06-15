# LogicN Neural

`logicn-ai-neural` is the package for neural-network model, layer, inference and
training boundary contracts.

It belongs in:

```text
/packages-logicn/logicn-ai-neural
```

Use this package for:

```text
Model
Layer
Activation
LossFunction
Optimizer
Gradient
Embedding
InferenceResult
TrainingResult
neural model reports
training limits
inference limits
```

> Note: the list above is a **conceptual overview**. The package exports typed `Neural*` contracts
> (`NeuralModelDefinition`, `NeuralLayer`, `ActivationFunction`, `NeuralInferencePlan`,
> `NeuralTrainingPlan`, …) — see `src/index.ts` for the exact surface; not every concept above maps
> to a standalone export yet.

## Boundary

Neural networks are not normal app syntax and should not be hard-coded into
`logicn-core`.

`logicn-ai-neural` may consume vector, matrix and tensor contracts from `logicn-core-vector`.
It may consume compute planning from `logicn-core-compute`, AI safety/report contracts
from `logicn-ai`, and low-bit backend references from `logicn-ai-lowbit`.

It must not own:

```text
basic LogicN language syntax
generic AI prompt/response contracts
low-bit backend implementation
CPU/GPU/NPU/photonic target output
security or payment authorization policy
```

## Example Direction

```LogicN
use neural
use vector

model TextClassifier {
  input Tensor<Float32, Shape<768>>

  layers {
    dense units 128 activation relu
    dense units 3 activation softmax
  }

  output Distribution<Category>
}
```

Inference stays typed and reported:

```LogicN
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

AI output is untrusted by default. A neural model result must be routed through
deterministic policy before security, payment or access-control decisions.

Final rule:

```text
logicn-ai-neural defines neural workloads.
logicn-core-vector defines tensor shapes.
logicn-core-compute chooses target plans.
target packages map plans to hardware or fallback outputs.
```
