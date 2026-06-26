# Galerina Neuromorphic

`galerina-ai-neuromorphic` is the package for neuromorphic and spiking event model
contracts.

It belongs in:

```text
/packages-galerina/galerina-ai-neuromorphic
```

Use this package for:

```text
Spike
SpikeTrain
EventSignal<T>
SpikingModel
NeuromorphicPlan
neuromorphic reports
event-driven inference plans
```

## Boundary

Neuromorphic support is related to neural computing, but it is not the same as
normal tensor neural networks.

```text
galerina-ai-neural
  tensors, weights, layers, inference, training

galerina-ai-neuromorphic
  spikes, events, event-driven spiking models
```

`galerina-ai-neuromorphic` should consume compute target planning from `galerina-core-compute` and
target output planning from future accelerator packages. It must not own normal
neural-network layer definitions or Galerina core syntax.

Final rule:

```text
galerina-ai-neuromorphic owns spiking/event concepts.
galerina-ai-neural owns tensor neural network concepts.
target packages own hardware-specific plans.
```
