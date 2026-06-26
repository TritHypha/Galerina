# Galerina Compute TODO

V1 freeze rule: compute planning must keep active target selection to CPU and
WASM. GPU, AI accelerator, optical I/O, photonic, low-bit AI and other advanced
targets are post-v1 planning unless needed to describe core type-system
semantics.

Quantum compute is future/research target planning. It must not be treated as an
active v1 runtime target.

```text
[x] Create /packages-galerina/galerina-core-compute
[x] Document package boundary
[x] Add package metadata
[x] Add initial typed exports
[x] Define compute capability model
[x] Define compute budget model
[x] Define target selection rules
[ ] Define specialist AI hardware target taxonomy for CPU, GPU, NPU, TPU, VPU, FPGA and ASIC
[ ] Define specialist compute capability, data-sensitivity and audit report fields
[x] Add generic low-bit AI fallback target concept
[x] Define offload planning reports
[ ] Define compute effects model (accelerator, optical_io, distributed_compute, high_memory, parallel_compute)
[ ] Define compute capabilities model (ComputeRuntime, GpuRuntime, AcceleratorRuntime, OpticalTransport, DistributedScheduler)
[ ] Define GPU planning metadata and fallback rules (SPORE-COMPUTE-001 through SPORE-COMPUTE-007)
[ ] Define GPU runtime architecture: compute planner → GPU scheduler → buffer manager → kernel adapter → GPU backend
[ ] Define vendor-neutral adapter model (CUDA/ROCm/Metal/Vulkan as runtime plugins, not language syntax)
[ ] Define optical/photonic transport planning (optical_io effect, OpticalTransport capability)
[ ] Define scheduler responsibilities (thermal balancing, queue depth, fairness, fallback)
[ ] Define planner responsibilities (parallelism, memory, energy cost, backend suitability)
[ ] Define compute audit event shapes for planner, scheduler, fallback, and distributed execution
[ ] Define RuntimeTarget union: cpu|node|wasm|browser-wasm|wasi|gpu|optical_io|photonic|native|serverless|edge (11 values)
[ ] Define GpuSuitability: high|medium|low|unsuitable|unknown
[ ] Define GpuRequirements: minMemoryMb, minParallelism, precision
[ ] Define GpuFallbackPlan: target, reason
[ ] Define GpuPlan v0.2: schemaVersion, suitability, recommendedTarget, reasons[], requirements, fallback, diagnostics[]
[ ] Implement estimateGpuSuitability(workload: ComputeWorkload): GpuSuitability — score-based algorithm
[ ] Implement buildGpuPlan(workload: ComputeWorkload): GpuPlan — with advisory warning if low/unsuitable
[ ] Create gpu/ dir: gpu-planner.ts, gpu-runtime.ts, gpu-fallback.ts, gpu-reports.ts, gpu-estimator.ts
[ ] Define OpticalNeed: none|data_movement|topology_aware|high_bandwidth|unknown
[ ] Define OpticalFallbackPlan: target (network_io|cpu|cluster_runtime), reason
[ ] Define OpticalPlan: need, recommendedMode (none|optical_io_awareness|photonic_planning_only), fallback, diagnostics[]
[ ] Implement estimateOpticalNeed(workload): OpticalNeed
[ ] Implement buildOpticalPlan(workload): OpticalPlan
[ ] Create photonic/ dir: photonic-planner.ts, optical-routing.ts, distributed-graph.ts, optical-runtime.ts, photonic-audit.ts
[ ] Upgrade WasmTarget: sandboxed, allowedEffects, runtime (browser|wasi|edge|node-wasm|unknown), forbiddenEffects[]
[ ] Define DEFAULT_WASM_FORBIDDEN_EFFECTS: filesystem, process, shell, native, gpu
[ ] Define BROWSER_WASM_FORBIDDEN_EFFECTS: DEFAULT + database, secret
[ ] Implement validateWasmEffect(effect, target): ComputeDiagnostic[]
[ ] Implement validateWasmTarget(target): ComputeDiagnostic[]
[ ] Create wasm/ dir: wasm-emitter.ts, wasm-runtime.ts, wasm-bindings.ts, wasm-sandbox.ts
[ ] Define SPORE-WASM-001 through SPORE-WASM-004 diagnostic codes
[ ] Define CompatibilityLevel: full|partial|degraded|incompatible
[ ] Define CompatibilityBlocker: reason, diagnosticCode
[ ] Define CompatibilityWarning: message, diagnosticCode
[ ] Define CompatibilityFallback: target, reason
[ ] Upgrade CompatibilityResult: target, level, blockers[], warnings[], fallback?
[ ] Define TargetProfile: target, supportedEffects[], forbiddenEffects[], requiredCapabilities[], memoryLimitMb?
[ ] Implement validateTarget(workload, profile): CompatibilityResult
[ ] Implement buildCompatibilityReport(workload, profiles[]): CompatibilityReport
[ ] Define CompatibilityReport: targets[], recommendedTarget, diagnostics[]
[ ] Create compatibility/ dir: target-compatibility.ts, compatibility-report.ts, compatibility-rules.ts, target-validator.ts
[ ] Define SPORE-COMPAT-001 through SPORE-COMPAT-004 diagnostic codes
[ ] Define shared types: ComputeWorkload, DataShape, DeploymentShape, ComputeDiagnostic
[ ] Define future quantum target planning rules after core compute reports stabilise
[x] Add examples
[x] Add tests
```
