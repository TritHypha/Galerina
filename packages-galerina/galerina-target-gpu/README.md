# Galerina Target GPU

`galerina-target-gpu` is the package for GPU target planning and output contracts.

It belongs in:

```text
/packages-galerina/galerina-target-gpu
```

Use this package for:

```text
GPU target metadata
GPU plan output
kernel mapping plans
precision and tolerance reports
data movement reports
GPU fallback reports
future CUDA/ROCm/WebGPU/Vulkan planning
```

## Boundary

`galerina-target-gpu` should consume compute plans from `galerina-core-compute` and produce
GPU-specific target plans or reports. It should not own vector semantics,
compute target selection or application runtime policy.

Final rule:

```text
galerina-core-vector defines vector operations.
galerina-core-compute chooses and plans compute targets.
galerina-target-gpu maps suitable work to GPU plans or outputs.
```
