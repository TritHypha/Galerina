# Galerina — Phase 18–23 Comprehensive Summary

## Status

```
Recorded: 2026-05-31
Covers: Phase 18A through Phase 23D (inclusive)
Authority: This is the canonical "what happened" reference for future sessions
```

---

## Overview

Phase 18–23 transformed Galerina from a working compiler into a governance-first platform
with WASM-ready architecture, structured type registries, and production deployment foundations.

The six-phase arc moved the project through four major structural shifts:

1. **Structured registries** — named numeric flags replaced ad-hoc strings throughout the compiler
2. **Stdlib capability enforcement** — every effectful stdlib call is now proven at compile time
3. **WASM architecture** — WAT emitter, linear memory layout, register VM, and lowering plans established
4. **Compute target expansion** — GPU, NPU, APU, and WASM-SIMD plans designed and typed

At the start of Phase 18 the compiler could lex, parse, type-check, and execute Galerina programs.
At the end of Phase 23 it can also: prove stdlib effects at compile time, emit governance manifests,
emit WAT skeletons, describe lowering strategies for tensors and iterators, and plan register-level
bytecode for a future native VM.

---

## Key Numbers

| Metric | Before (Phase 17) | After (Phase 23) | Change |
|---|---|---|---|
| Tests | 1993 | 2286 | +293 |
| TypeScript source files | ~42 | ~52 | +10 new |
| KB documents | ~302 | ~312 | +10 arch docs |
| New diagnostic codes | — | 15 | SPORE-STDLIB-001, SPORE-EFFECT-005, SPORE-GOV-013, SPORE-PKG-001..005, SPORE-GATE-001, SPORE-TYPE-030/031, SPORE-COMPUTE-001, SPORE-SYNTAX-LEGACY-001, SPORE-WAT-STUB |
| Test subdirectories added | 0 | 9 | bootstrap-determinism, governance-conformance, parser, package-resolver, value-state, type-registry, effect-checker, governance, stdlib |

### New Diagnostic Codes

| Code | Meaning | Phase |
|---|---|---|
| SPORE-STDLIB-001 | Effectful stdlib call missing declared effect | 18H / 19A |
| SPORE-EFFECT-005 | BroadAliasUsed — broad effect alias now a warning not error | 18E |
| SPORE-GOV-013 | BoundaryViolation — cross-boundary context contract violation | 20A |
| SPORE-PKG-001 | Package name does not match naming policy | 18B |
| SPORE-PKG-002 | Package missing required signature field | 18B |
| SPORE-PKG-003 | Package declares hidden capabilities not in manifest | 18B |
| SPORE-PKG-004 | Package install script present (not permitted) | 18B |
| SPORE-PKG-005 | Package targets unknown compute target | 18B |
| SPORE-GATE-001 | Value reaching governed sink without passing required gate | 18C |
| SPORE-TYPE-030 | Tensor type arity mismatch | 18D |
| SPORE-TYPE-031 | Tensor element type not numeric | 18D |
| SPORE-COMPUTE-001 | Compute preference references unknown target | 22A |
| SPORE-SYNTAX-LEGACY-001 | Legacy `req` keyword used instead of `request` | 18 (parser) |
| SPORE-SEC-020 | Monkey-patch detected: prototype modification | 17C / 18 |
| SPORE-SEC-021 | Monkey-patch detected: global object mutation | 17C / 18 |
| SPORE-WAT-STUB | WAT body is a stub (unreachable) — not yet executable | 19B |

---

## New Source Files

All files reside in `packages-galerina/galerina-core-compiler/src/`.

| File | What it provides | Phase |
|---|---|---|
| `monkey-patch-checker.ts` | SPORE-SEC-020/021 source-level detection of prototype and global mutation | 17C/18 |
| `stdlib-registry.ts` | `STDLIB_CAPABILITY_MAP` (35+ functions), `STDLIB_MODULE_KIND`, `TENSOR_STDLIB_OPS`, `TRI_STDLIB_OPS`, `getStdlibWasmImport()` | 18H |
| `wat-emitter.ts` | WebAssembly Text Format emitter skeleton, WAT type system, `renderWAT()` with stub bodies | 19B/C |
| `type-registry.ts` | `TypeId` (56 IDs), `EffectFlags` (14 flags), `GovernanceFlags` (8 flags), `EffectCheckerFlags` (6 flags), `ComputeCompatibilityFlags` (7 flags) | 18D/E/F |
| `lowering-plan.ts` | `TypedArrayLoweringPlan`, `MonomorphisationPlan`, `KernelFusionPlan`, `LazyIteratorChain`, `PRODUCTION_ERASURE`/`DEV_ERASURE` | 21A–D / 22C |
| `gpu-plan.ts` | `WebGPUComputePlan`, `NPUKernelPlan`, `APUSharedMemoryPlan` | 22A–C / 23A |
| `register-vm.ts` | `RegisterBytecodeModule`, full opcode set (arithmetic, memory, control flow, call, SIMD, governance), `emitBytecode()` stub | 23B |
| `views.ts` | `StringView`, `BytesView`, `TensorView<T>`, `WASMLinearMemoryLayout` | 23C/D |
| `boundary-graph.ts` | `BoundaryGraph` type structures, `BoundaryNode`, `BoundaryEdge`, `buildBoundaryGraph()` stub | 20A/B |

---

## New Test Directories (Phase 18 Restructure)

Added to `packages-galerina/galerina-core-compiler/tests/`:

```
tests/bootstrap-determinism/    — canonical hash determinism tests (Phase 16A, restructured 18)
tests/governance-conformance/   — monkey-patch and governance rule conformance tests
tests/parser/                   — parser-specific tests separated from integration suite
tests/package-resolver/         — package manifest resolver and naming policy tests
tests/value-state/              — value-state flag and sink requirement tests
tests/type-registry/            — TypeId, EffectFlags, ComputeCompatibilityFlags tests
tests/effect-checker/           — EffectCheckerFlags, FlowEffectSummary, mode tests
tests/governance/               — GovernanceFlags, RuntimeManifest, boundary tests
tests/stdlib/                   — STDLIB_CAPABILITY_MAP, SPORE-STDLIB-001 enforcement tests
```

---

## Architecture Decisions Made

These decisions were settled during Phases 18–23 and are standing rules for all future work.

### 1. WASM is the primary architecture target

```
Standing rule (recorded in project memory).
All lowering plans, memory layouts, type flags, and compute plans are
designed WASM-first. Native/CPU is a fallback, not the primary concern.
```

### 2. WAT text format first, then wat2wasm in CI

```
Emit human-readable WAT text via wat-emitter.ts.
Convert to binary via wat2wasm in the build pipeline.
This keeps the emitter readable, debuggable, and auditable.
Phase 24 wires this: real instruction emission → wat2wasm → wasmtime.
```

### 3. Arena lifetime is compiler-inferred; developer declares the bound

```galerina
contract {
  memory {
    arena 8mb
  }
}
```

The developer writes the bound. The compiler infers which allocations live in the arena
and derives the `Arena` from this declaration (Phase 22C). Developers do not manage arena
lifetimes manually.

### 4. Both wasm-standalone (WASI) and wasm-hybrid targets

```
wasm-standalone: full WASI module, runs in wasmtime/wasmer without a host JS runtime
wasm-hybrid:     WASM module embedded in a Node.js or Deno host, capabilities via JS imports
```

Both targets share the same WAT emitter. The difference is in which host imports are declared.

### 5. Nothing important should be hidden

```
See: docs/Knowledge-Bases/galerina-explicitness-principles.md
```

Effects, capabilities, PII, runtime policy, packages, compute targets, audit obligations,
and allocation must all be visible to the compiler and provable before deployment.
This principle drove every structured registry added in Phases 18–23.

### 6. contract { memory { arena 8mb } } is the canonical memory declaration syntax

Settled in Phase 22C. Developers declare memory bounds in the contract block.
The compiler derives `Arena` from this declaration and embeds it in the lowering plan.

---

## Standing Rules

- Explicitness principles: `docs/Knowledge-Bases/galerina-explicitness-principles.md`
- WASM architecture rule: recorded in project memory (**project_wasm_architecture_rule**)
- Stage B definition: `docs/Knowledge-Bases/galerina-phase16-20-decisions.md` (Decision 1)
- Package system (both registry + manifests): `galerina-phase16-20-decisions.md` (Decision 2)
- executePlan() scope (all flows): `galerina-phase16-20-decisions.md` (Decision 3)

---

## What Each Phase Delivered

### Phase 18A — Lexer Hardening

Added `SPORE-LEX-004` (file >10 MB), `SPORE-LEX-005` (line >10k chars), `SPORE-LEX-006` (>100
diagnostics). Introduced `TokenKindId` as a numeric enum replacing string-based token
identification — `kindId` field added to every Token. Added `V1_DEPRECATED_RESERVED` reserved
word registry for future language versioning safety. Slice-based identifier scanning and
direct char-pair operator lookahead added for performance.

### Phase 18B — Package Resolver: Security Fields

Expanded the package manifest resolver to validate hash, signature, compute targets, and
install scripts. Introduced `SPORE-PKG-001` through `SPORE-PKG-005` covering name policy, missing
signatures, hidden capabilities, forbidden install scripts, and unknown compute targets.
Added `checkPackageCapabilityExpansion()`, `checkInstallScript()`, `checkPackageProvenance()`,
and `getResolverReport()` to the package resolver API.

### Phase 18C — Value-State: Sink Requirements and Gate Enforcement

Added `ValueStateFlags` (8-bit bitset: Unsafe, Safe, Validated, Tainted, Protected, Redacted,
Secret, ReadOnly). Introduced `SINK_REQUIREMENTS` as a structured registry mapping each governed
sink to its required state, policy note, and WASM import path. Added `getSinkRequirement()`
with exact and pattern matching. Introduced `SPORE-GATE-001`: values reaching a governed sink
without passing a required gate are now a compile error.

### Phase 18D — Type Registry: TypeId, EffectFlags, ComputeCompatibilityFlags

Introduced `TypeId` — a 56-entry numeric enum covering all built-in Galerina types, tensor shapes,
and compute-compatible types. Added `EffectFlags` (14-bit bitset) with `effectsToFlags()` and
`effectsSubset()`. Added `ComputeCompatibilityFlags` (7-bit bitset). Implemented
`parseTensorType()` with `SPORE-TYPE-030` (tensor arity mismatch) and `SPORE-TYPE-031` (non-numeric
tensor element type).

### Phase 18E — Effect Checker: Flags and Mode

Added `EffectCheckerFlags` (6-bit bitset: PureComputeCandidate, ParallelSafe,
KernelFusionCandidate, EffectFree, ReadyForAPU, ReadyForNPU). Introduced `FlowEffectSummary`
bitset fields: `declaredEffectsMask`, `inferredEffectsMask`, `missingEffectsMask`, `checkerFlags`.
Added `EffectCheckerMode` enum (`development` | `production`). Changed `SPORE-EFFECT-005`
(BroadAliasUsed) from error to warning — broad effect aliases permitted in development mode.

### Phase 18F — Governance Verifier: GovernanceFlags and RuntimeManifest

Added `GovernanceFlags` (8-bit bitset: RequiresAudit, DenyRemote, ContainsPII, AllowsNetwork,
RequiresActor, ProductionStrict, RequiresIntent, HasPolicy). Introduced `RuntimeManifest` type
and `buildRuntimeManifest()` (production profile only). Extended `GovernanceVerifyResult` with
`governanceFlagsByFlow` and `runtimeManifests`. Every flow now produces a verified manifest
before production deployment is allowed.

### Phase 18G — GIR: Expanded Tensor Metadata and Source Provenance

Expanded `GIRTensorInfo` with WASM/compute fields: `wasmSimdCompatible`, `gpuCompatible`,
`npuCompatible`, `apuSharedMemoryCandidate`, `fixedShape`, `quantized`. Added
`GIRProgram.sourceHash` (links compiled artifact to source), `GIRProgram.entryPoints`
(explicit flow entry point declarations), and `GIRFlow.allowedEffectsMask` (EffectFlags bitset
from declared effects). Fixed `paramDecl` tensor extraction so tensor parameters in contract
type blocks are captured correctly.

### Phase 18H — Stdlib Registry: WASM Import Map

Added `stdlib-registry.ts` with `STDLIB_CAPABILITY_MAP` covering 35+ stdlib functions mapped
to their required effects and WASM import paths. Added `STDLIB_MODULE_KIND` (pure vs effectful
classification), `TENSOR_STDLIB_OPS`, `TRI_STDLIB_OPS`, `getStdlibRequiredEffects()`,
`getStdlibModuleKind()`, and `getStdlibWasmImport()`. Introduced the `SPORE-STDLIB-001` constant;
enforcement wired in Phase 19A.

### Phase 19A — SPORE-STDLIB-001 Enforcement

Wired `SPORE-STDLIB-001` into the effect checker as a compile error. The effect checker now
walks all call expressions, looks them up in `STDLIB_CAPABILITY_MAP`, and compares required
effects against declared effects. `File.readText` without `filesystem.read` in the contract
now produces a hard error. `Http.post` without `network.outbound` fails the build. Pure stdlib
calls (String.split, Math.sqrt, Hash.sha256) produce no diagnostic.

### Phase 19B/C — WAT Emitter and CLI WASM Modes

Added `wat-emitter.ts` with WAT type system and `renderWAT()`. `buildWATModule()` populates
a `WATModule` from GIR data. Stub bodies use `unreachable` — valid WAT syntax, but not
yet executable. Tracked `LEGACY_EFFECT_CALL_PATTERNS_COUNT = 31` for migration reporting.
Added `--target=wasm-standalone`, `--target=wasm-hybrid`, `--emit-wat`, and `--deterministic`
CLI modes. Introduced `SPORE-WAT-STUB` diagnostic to flag flows with stub bodies.

### Phase 20A/B — Boundary Graph and Context Governance

Derived `RuntimeManifest.requiredContext` from `contract.context { require actor }` declarations.
Set `GovernanceFlags.RequiresActor` automatically when actor context is required. Introduced
`SPORE-GOV-013` (BoundaryViolation): flows crossing a boundary without satisfying the context
contract now produce a compile error. Added `BoundaryGraph` type structures in `boundary-graph.ts`
(`BoundaryNode`, `BoundaryEdge`, `buildBoundaryGraph()` stub) to model cross-boundary
dependency relationships.

### Phase 21A–D — Lowering Plans: TypedArray, Monomorphisation, Kernel Fusion, Lazy Iterators

Added `lowering-plan.ts` with four plan types for the WASM lowering pipeline.
`TypedArrayLoweringPlan` maps Galerina types to WASM typed arrays (Float32→Float32Array,
Int8→Int8Array). `MonomorphisationPlan` describes generic type specialisation stubs
(add_Int, add_Float32, etc.). `KernelFusionPlan` merges adjacent compute steps into a single
kernel. `LazyIteratorChain` defers iterator composition with a fusability flag.
`PRODUCTION_ERASURE` and `DEV_ERASURE` constants control which metadata is stripped per
build mode.

### Phase 22A–C — GPU, NPU, WASM-SIMD, Arena from Contract

Added `gpu-plan.ts`. Phase 22A added `WASMSIMDCapability` and `WATSIMDInstruction` types with
`SPORE-COMPUTE-001`. Phase 22B added `WebGPUComputePlan` (with WGSL skeleton) and `NPUKernelPlan`
(with ONNX path structure). Phase 22C derived `Arena` from `contract.memory { arena Nmb }`
declarations — the compiler reads the developer's declared memory bound and embeds it in the
lowering plan as the first step toward WASM linear memory sizing. Sets
`RuntimeManifest.arenaLimitMb` automatically.

### Phase 23A–D — APU Plan, Register VM, Views, WASM Memory Layout

Phase 23A completed `APUSharedMemoryPlan` with buffer mapping and `zeroOnReturn` for redacted
outputs (prevents side-channel leakage via shared memory). Phase 23B added `register-vm.ts`
with `RegisterBytecodeModule` and a full opcode set covering arithmetic, memory load/store,
control flow (branch/jump), call/return, SIMD operations, and governance hooks
(AUDIT_WRITE, CAPABILITY_CALL, DENY_CHECK). `emitBytecode()` is a stub pending Phase 24.
Phase 23C added `views.ts`: `StringView`, `BytesView`, `TensorView<T>` — zero-copy view types
for WASM linear memory without allocation. Phase 23D added `WASMLinearMemoryLayout` — the
complete memory page layout descriptor for a compiled WASM module (code, data, stack, heap,
and governed memory regions).

---

## What Phase 24 Must Do

Phase 24 has one mandatory gate before it is considered complete:

```
A pure Galerina flow must compile → emit real WAT instructions →
pass wat2wasm → execute in wasmtime → return the correct result.
```

This requires replacing all `unreachable` stub bodies in `wat-emitter.ts` with actual
instruction emission driven by `PassiveExecutionPlan` steps.

### Phase 24 Sub-tasks

```
24A  Real WAT instruction emission for pure flows
       — arithmetic, local.get/set, i32/i64/f64 operations
       — function preamble, return value, complete module structure
       — driven by PassiveExecutionPlan step sequence

24B  Capability imports for effectful stdlib
       — host:* WASM imports declared from STDLIB_CAPABILITY_MAP
       — import section generated from approved_capabilities list
       — SPORE-STDLIB-001 cross-checked against declared imports

24C  First deployable WASM service
       — examples/wasm-hello-world/ working end-to-end
       — either wasm-standalone (WASI) or wasm-hybrid target
       — CI runs wat2wasm + wasmtime as a build gate
```

Phase 24 is the bridge from architecture to execution. Phases 18–23 built every prerequisite
(type registry, effect flags, lowering plans, WAT skeleton, linear memory layout). Phase 24
makes the output runnable.

---

## New KB Architecture Docs (10 files)

Added to `docs/Knowledge-Bases/`:

- `galerina-architecture-high-roi-ideas.md` — 16 high-ROI ideas with implementation status
- `galerina-effect-checker-architecture.md` — effect checker architecture, EffectCheckerFlags
- `galerina-explicitness-principles.md` — the core Galerina explicitness doctrine (standing rule)
- `galerina-gir-emitter-architecture.md` — GIR emitter and WASM lowering plan
- `galerina-governance-verifier-architecture.md` — GovernanceFlags, RuntimeManifest architecture
- `galerina-lexer-optimizations.md` — lexer optimisation roadmap
- `galerina-package-resolver-architecture.md` — package resolver architecture
- `galerina-runtime-interpreter-roadmap.md` — RegisterVM and bytecode roadmap
- `galerina-stdlib-architecture.md` — stdlib: capability-first, pure/effectful split
- `galerina-type-checker-architecture.md` — type checker: TypeId, tensor shape checking

---

## See Also

- `galerina-roadmap.md` — Phase-by-phase completion table (authoritative progress tracker)
- `galerina-phase16-20-decisions.md` — standing decisions made during this arc
- `galerina-explicitness-principles.md` — the "nothing important should be hidden" doctrine
- `galerina-passive-execution-plans.md` — PassiveExecutionPlan (what Phase 24 compiles from)
- `galerina-static-capability-proofs.md` — capability proof model and STDLIB_CAPABILITY_MAP
- `galerina-gir-schema.md` — GIR schema (upstream of all plans)
- `galerina-governance-verifier-spec.md` — RuntimeManifest and governance verification spec
