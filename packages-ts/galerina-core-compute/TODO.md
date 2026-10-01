# Galerina Compute TODO

V1 freeze rule: compute planning must keep active target selection to CPU and
WASM. GPU, AI accelerator, optical I/O, photonic, low-bit AI and other advanced
targets are post-v1 planning unless needed to describe core type-system
semantics.

Quantum compute is future/research target planning. It must not be treated as an
active v1 runtime target.

```text
[x] Create /packages-ts/galerina-core-compute
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
[ ] Define GPU planning metadata and fallback rules (FUNGI-COMPUTE-001 through FUNGI-COMPUTE-007)
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
[x] SUPERSEDED (galerina-target-wasm, see note W1) Upgrade WasmTarget: sandboxed, allowedEffects, runtime (browser|wasi|edge|node-wasm|unknown), forbiddenEffects[]
[x] SUPERSEDED (galerina-target-wasm, see note W2) Define DEFAULT_WASM_FORBIDDEN_EFFECTS: filesystem, process, shell, native, gpu
[x] SUPERSEDED (galerina-target-wasm, see note W2) Define BROWSER_WASM_FORBIDDEN_EFFECTS: DEFAULT + database, secret
[x] SUPERSEDED (galerina-target-wasm, see note W3) Implement validateWasmEffect(effect, target): ComputeDiagnostic[]
[x] SUPERSEDED (galerina-target-wasm, see note W3) Implement validateWasmTarget(target): ComputeDiagnostic[]
[x] SUPERSEDED (package split, see note W4) Create wasm/ dir: wasm-emitter.ts, wasm-runtime.ts, wasm-bindings.ts, wasm-sandbox.ts
[x] SUPERSEDED (galerina-target-wasm, see note W5) Define FUNGI-WASM-001 through FUNGI-WASM-004 diagnostic codes
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
[ ] Define FUNGI-COMPAT-001 through FUNGI-COMPAT-004 diagnostic codes
[ ] Define shared types: ComputeWorkload, DataShape, DeploymentShape, ComputeDiagnostic
[ ] Define future quantum target planning rules after core compute reports stabilise
[x] Add examples
[x] Add tests
```

### WASM rows superseded (2026-09-29, Grok Bot, owner-approved; AGENTS session-exchange grok-bot-pkg-todo-work-20260929/LEDGER.md)

WASM target ownership moved to `packages-ts/galerina-target-wasm` (see its
TODO.md). These rows are closed by cross-reference, not by code in this package;
the shipped design differs in places:

- W1: `WasmTarget` is `{ runtime: browser|edge|server|standalone, features }`
  in target-wasm `src/index.ts`. There are no `sandboxed`/`allowedEffects`
  fields, and the runtime vocabulary differs from `browser|wasi|edge|node-wasm|unknown`
  (reconciled with compute via `wasmRuntime`, `FUNGI-WASM-028`). Sandbox limits
  live on the artefact (`WasmSandboxLimits`).
- W2: target-wasm `FORBIDDEN_EFFECTS` is keyed by runtime. `browser` =
  filesystem, process, shell, native, gpu, database, secret (matches the BROWSER
  row). `edge` and `standalone` = filesystem, process, shell, native (no `gpu`,
  unlike the DEFAULT row). `server` = none.
- W3: effect and runtime checks run inside `validateWasmArtefact`
  (`FUNGI-WASM-017` effect forbidden, `FUNGI-WASM-005` runtime invalid); there
  are no standalone `validateWasmEffect`/`validateWasmTarget` functions.
- W4: emission is in `galerina-core-compiler` (`src/wat-emitter.ts`), runtime in
  `galerina-core-runtime-wasm`, contracts in `galerina-target-wasm`; there is no
  core-compute `wasm/` dir.
- W5: the registry is `FUNGI-WASM-001`..`FUNGI-WASM-030`
  (`WASM_DIAGNOSTIC_REGISTRY`); its meanings do not match this package README's
  `FUNGI-WASM-001`..`005` list.
