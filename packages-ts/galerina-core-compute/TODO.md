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
[x] Define specialist AI hardware target taxonomy for CPU, GPU, NPU, TPU, VPU, FPGA and ASIC
      src/specialist/specialist-hardware.ts SPECIALIST_HARDWARE_CLASSES + SpecialistHardwareTarget + validateSpecialistHardwareTarget (v1 freeze: only cpu may claim available); tests/specialist-hardware.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define specialist compute capability, data-sensitivity and audit report fields
      src/specialist/specialist-hardware.ts SpecialistComputeCapabilityFields / SpecialistDataSensitivity / SpecialistComputeAuditFields + specialistTargetAllowsSensitivity (omit max = admits nothing); tests/specialist-hardware.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Add generic low-bit AI fallback target concept
[x] Define offload planning reports
[x] Define compute effects model (accelerator, optical_io, distributed_compute, high_memory, parallel_compute)
      src/effects/compute-effects.ts COMPUTE_EFFECTS + validateComputeEffectNames + assertComputeEffectsAdmissible (v1 active: high_memory|parallel_compute only); tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define compute capabilities model (ComputeRuntime, GpuRuntime, AcceleratorRuntime, OpticalTransport, DistributedScheduler)
      src/capabilities/compute-runtime-capabilities.ts COMPUTE_RUNTIME_CAPABILITIES + validateComputeRuntimeCapabilityClaim (v1: only ComputeRuntime may claim available); tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GPU planning metadata and fallback rules (FUNGI-COMPUTE-001 through FUNGI-COMPUTE-007)
      src/gpu/gpu-codes.ts FUNGI_COMPUTE_CODES; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[HOLD] RD-0855 admission-time alternative plans: task-policy issuer and the allowed alternatives, permitted reasons and their order (proposed 2026-10-06, owner decision pending; refines the fallback rules row above)
    No new fallback mechanism. A failed attempt keeps its typed refusal. A separate alternative plan is allowed only for authenticated
    candidate-local unavailability or incompatibility, under the unchanged admitted task policy and with no prior effect; it needs its own
    SLIDE admission and a fresh VOK decision, lease and receipt. DENY, revocation, invalid evidence, unknown outcome, partial effects and
    cleanup failure never become retry permission. Post-effect or uncertain-outcome retry is excluded.
    Owner decided 2026-10-06 (Phillip, 16:52 BST correction; supersedes the 15:21 "K3 or binary" wording), three-tier fallback order: (1) run at the requested trit-width profile (1/8/16/32/64/256 etc.); (2) only if that width cannot run, fall back to standard Galerina Trit (K3) logic; (3) only if Trit cannot be processed at all, fall back to binary implementing the same task semantics, with K3 still deciding permission (no different two-valued algorithm, no semantic degradation). Each step down is a separate, independently admitted attempt (fresh SLIDE admission, fresh VOK decision/lease, linked receipt); DENY, revocation, unknown outcome and partial effects never become a retry. Task-policy issuer, coordinator package and retry budget are open owner decisions; unresolved = HOLD.
    Src: RD-0855 (private; ID+line only) L23-31, L192-200, L335-351, L365-374, L488; codex-rd0855-fallback-astra-20261006-answer-01; galerina2-rd0855-astra-fallback-20261006.
[x] Define GPU runtime architecture: compute planner â†’ GPU scheduler â†’ buffer manager â†’ kernel adapter â†’ GPU backend
      src/gpu/gpu-runtime.ts GPU_RUNTIME_ARCHITECTURE_STAGES (planning vocabulary only; no stage executes); tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define vendor-neutral adapter model (CUDA/ROCm/Metal/Vulkan as runtime plugins, not language syntax)
      src/gpu/gpu-runtime.ts GPU_VENDOR_ADAPTERS; isGpuVendorAdapterAdmitted always false under v1 freeze; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define optical/photonic transport planning (optical_io effect, OpticalTransport capability)
      effects/compute-effects.ts optical_io (planning-only under v1); capabilities OpticalTransport (planning_only); photonic/ optical plan (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define scheduler responsibilities (thermal balancing, queue depth, fairness, fallback)
    src/scheduling/responsibilities.ts SCHEDULER_RESPONSIBILITIES + validateSchedulerResponsibilityClaim; v1 planning_only only; tests/scheduler-planner.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[HOLD] Bound total attempts and resources across one task's RD-0855 alternative plans (proposed 2026-10-06, owner decision pending; refines the scheduler fallback row above)
    One budget for the whole task: attempt count, deadline and CPU/memory/accelerator use shared by every attempt; an exhausted or cyclic chain
    refuses instead of starting another attempt. Retry-budget owner is open; unresolved = HOLD. Src: RD-0855 (private; ID+line only) L23-31, L192-200, L335-351, L365-374, L488; codex-rd0855-fallback-astra-20261006-answer-01; galerina2-rd0855-astra-fallback-20261006.
[x] Define planner responsibilities (parallelism, memory, energy cost, backend suitability)
    src/scheduling/responsibilities.ts PLANNER_RESPONSIBILITIES + validatePlannerResponsibilityClaim; v1 planning_only only; tests/scheduler-planner.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define compute audit event shapes for planner, scheduler, fallback, and distributed execution
    src/scheduling/responsibilities.ts ComputeAuditEventShape v0.1 + validateComputeAuditEventShape / buildComputeAuditEvent; closed kind/subject/outcome; no free-text; tests/scheduler-planner.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[HOLD] Tests for RD-0855 alternative-plan planning (proposed 2026-10-06, owner decision pending; refines the audit fallback row above)
    Positive (three-tier order): requested trit-width profile authenticated-unavailable before any effect -> a tier-2 standard K3 Trit alternative
    is emitted as a proposal only, with a new plan identity linked to the refused attempt; tier-3 binary (same task semantics, K3 deciding
    permission) is proposed only after tier 2 is itself authenticated as unprocessable. Negative: binary proposed while tier 2 can run, a
    different two-valued algorithm or degraded semantics -> refuse. DENY, revoked capability, invalid or stale evidence, unknown outcome,
    partial effect or cleanup failure -> no retry grant, original typed refusal kept; task-policy substitution and exhausted or cyclic chains refuse.
    Src: RD-0855 (private; ID+line only) L23-31, L192-200, L335-351, L365-374, L488; codex-rd0855-fallback-astra-20261006-answer-01; galerina2-rd0855-astra-fallback-20261006.
[x] Define RuntimeTarget union: cpu|node|wasm|browser-wasm|wasi|gpu|optical_io|photonic|native|serverless|edge (11 values)
[x] Define GpuSuitability: high|medium|low|unsuitable|unknown
      src/gpu/gpu-types.ts; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GpuRequirements: minMemoryMb, minParallelism, precision
      src/gpu/gpu-types.ts; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GpuFallbackPlan: target, reason
      src/gpu/gpu-types.ts + src/gpu/gpu-fallback.ts cpuGpuFallback; closed reason tokens; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define GpuPlan v0.2: schemaVersion, suitability, recommendedTarget, reasons[], requirements, fallback, diagnostics[]
      src/gpu/gpu-types.ts schemaVersion galerina.compute.gpu-plan.v0.2; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Implement estimateGpuSuitability(workload: ComputeWorkload): GpuSuitability â€” score-based algorithm
      src/gpu/gpu-estimator.ts: never returns high|medium under v1 freeze; unknown if invalid; low=advisory GPU-interest; unsuitable otherwise; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Implement buildGpuPlan(workload: ComputeWorkload): GpuPlan â€” with advisory warning if low/unsuitable
      src/gpu/gpu-planner.ts: recommendedTarget always cpu; always emits FUNGI-COMPUTE-001/005; sensitiveâ†’004; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Create gpu/ dir: gpu-planner.ts, gpu-runtime.ts, gpu-fallback.ts, gpu-reports.ts, gpu-estimator.ts
      plus gpu-codes.ts, gpu-types.ts, index.ts; createGpuPlanReport in gpu-reports.ts; tests/gpu-plan.test.mjs (Grok 2026-10-05; zero-trust defaults, owner may revisit)
[x] Define OpticalNeed: none|data_movement|topology_aware|high_bandwidth|unknown â€” src/photonic/optical-types.ts (Grok 2026-10-05)
[x] Define OpticalFallbackPlan: target (network_io|cpu|cluster_runtime), reason â€” src/photonic/optical-types.ts (Grok 2026-10-05; executable fallback always cpu under v1)
[x] Define OpticalPlan: need, recommendedMode (none|optical_io_awareness|photonic_planning_only), fallback, diagnostics[] â€” src/photonic/optical-types.ts v0.2 (Grok 2026-10-05)
[x] Implement estimateOpticalNeed(workload): OpticalNeed â€” src/photonic/optical-estimator.ts (Grok 2026-10-05)
[x] Implement buildOpticalPlan(workload): OpticalPlan â€” src/photonic/photonic-planner.ts; always cpu fallback under v1 (Grok 2026-10-05)
[x] Create photonic/ dir: photonic-planner.ts, optical-routing.ts, distributed-graph.ts, optical-runtime.ts, photonic-audit.ts (+ optical-types/estimator/fallback/index) (Grok 2026-10-05)
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
- Tests: `tests/compatibility.test.mjs`, `tests/gpu-plan.test.mjs`, `tests/optical-plan.test.mjs`. GPU + optical planning vocabulary landed under v1 freeze (cpu-only executable). Quantum + specialist taxonomy (#83 parallel) stay open; scheduler/planner/audit closed on this tip.
