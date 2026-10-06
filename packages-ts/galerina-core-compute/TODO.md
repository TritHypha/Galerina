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
[x] Define compute effects model (accelerator, optical_io, distributed_compute, high_memory, parallel_compute)
      src/effects/compute-effects.ts COMPUTE_EFFECTS + validateComputeEffectNames + assertComputeEffectsAdmissible (v1 active: high_memory|parallel_compute only); tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define compute capabilities model (ComputeRuntime, GpuRuntime, AcceleratorRuntime, OpticalTransport, DistributedScheduler)
      src/capabilities/compute-runtime-capabilities.ts COMPUTE_RUNTIME_CAPABILITIES + validateComputeRuntimeCapabilityClaim (v1: only ComputeRuntime may claim available); tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GPU planning metadata and fallback rules (FUNGI-COMPUTE-001 through FUNGI-COMPUTE-007)
      src/gpu/gpu-codes.ts FUNGI_COMPUTE_CODES; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GPU runtime architecture: compute planner → GPU scheduler → buffer manager → kernel adapter → GPU backend
      src/gpu/gpu-runtime.ts GPU_RUNTIME_ARCHITECTURE_STAGES (planning vocabulary only; no stage executes); tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define vendor-neutral adapter model (CUDA/ROCm/Metal/Vulkan as runtime plugins, not language syntax)
      src/gpu/gpu-runtime.ts GPU_VENDOR_ADAPTERS; isGpuVendorAdapterAdmitted always false under v1 freeze; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[ ] Define optical/photonic transport planning (optical_io effect, OpticalTransport capability)
[ ] Define scheduler responsibilities (thermal balancing, queue depth, fairness, fallback)
[ ] Define planner responsibilities (parallelism, memory, energy cost, backend suitability)
[ ] Define compute audit event shapes for planner, scheduler, fallback, and distributed execution
[x] Define RuntimeTarget union: cpu|node|wasm|browser-wasm|wasi|gpu|optical_io|photonic|native|serverless|edge (11 values)
[x] Define GpuSuitability: high|medium|low|unsuitable|unknown
      src/gpu/gpu-types.ts; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GpuRequirements: minMemoryMb, minParallelism, precision
      src/gpu/gpu-types.ts; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GpuFallbackPlan: target, reason
      src/gpu/gpu-types.ts + src/gpu/gpu-fallback.ts cpuGpuFallback; closed reason tokens; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GpuPlan v0.2: schemaVersion, suitability, recommendedTarget, reasons[], requirements, fallback, diagnostics[]
      src/gpu/gpu-types.ts schemaVersion galerina.compute.gpu-plan.v0.2; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Implement estimateGpuSuitability(workload: ComputeWorkload): GpuSuitability — score-based algorithm
      src/gpu/gpu-estimator.ts: never returns high|medium under v1 freeze; unknown if invalid; low=advisory GPU-interest; unsuitable otherwise; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Implement buildGpuPlan(workload: ComputeWorkload): GpuPlan — with advisory warning if low/unsuitable
      src/gpu/gpu-planner.ts: recommendedTarget always cpu; always emits FUNGI-COMPUTE-001/005; sensitive→004; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Create gpu/ dir: gpu-planner.ts, gpu-runtime.ts, gpu-fallback.ts, gpu-reports.ts, gpu-estimator.ts
      plus gpu-codes.ts, gpu-types.ts, index.ts; createGpuPlanReport in gpu-reports.ts; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
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
[x] Define CompatibilityLevel: full|partial|degraded|incompatible
[x] Define CompatibilityBlocker: reason, diagnosticCode
[x] Define CompatibilityWarning: message, diagnosticCode
[x] Define CompatibilityFallback: target, reason
[x] Upgrade CompatibilityResult: target, level, blockers[], warnings[], fallback?
[x] Define TargetProfile: target, supportedEffects[], forbiddenEffects[], requiredCapabilities[], memoryLimitMb?
[x] Implement validateTarget(workload, profile): CompatibilityResult
[x] Implement buildCompatibilityReport(workload, profiles[]): CompatibilityReport
[x] Define CompatibilityReport: targets[], recommendedTarget, diagnostics[]
[x] Create compatibility/ dir: target-compatibility.ts, compatibility-report.ts, compatibility-rules.ts, target-validator.ts
[x] Define FUNGI-COMPAT-001 through FUNGI-COMPAT-004 diagnostic codes
[x] Define shared types: ComputeWorkload, DataShape, DeploymentShape, ComputeDiagnostic
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

### Compatibility and shared types (2026-10-05, Grok Bot, standing permission, owner may revisit)

- `src/workload.ts`: `RuntimeTarget` (the 11 TODO values, `RUNTIME_TARGETS`,
  `isRuntimeTarget`), `DataShape`, `DeploymentShape`, `ComputeWorkload` and a
  fail-closed `validateComputeWorkload`. `ComputeDiagnostic` is the existing type
  in `src/index.ts`. The README `RuntimeTarget` list (server/browser/worker/
  ai_accelerator) differs; the TODO list was used.
- `src/compatibility/`: `target-compatibility.ts` (levels per the TODO,
  `full|partial|degraded|incompatible`, not the README
  `compatible|compatible_with_warnings|requires_fallback|incompatible`; blocker,
  warning, fallback, result, `TargetProfile` with a required `allowsSensitiveData`),
  `compatibility-rules.ts` (registry FUNGI-COMPAT-001..005: forbidden effect,
  unsupported effect, missing capability, memory limit, sensitive data; 005 matches
  the README range), `target-validator.ts` (`validateTarget`) and
  `compatibility-report.ts` (`buildCompatibilityReport`).
- Zero-trust defaults: effects are allowlisted (unknown fails closed), a target's
  required capabilities must be declared by the workload, an undeclared memory
  limit is a warning, sensitive data needs an explicit allow, duplicate profiles are
  errors, and there is no implicit CPU default (`recommendedTarget: "none"`).
- Tests: `tests/compatibility.test.mjs`. GPU, optical/photonic and quantum rows stay
  open (post-v1 planning; photonic ownership unsettled).
