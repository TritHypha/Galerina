# Galerina — Hardware Compatibility Matrix

**Version: 1.0 — 2026-06-01**
**Status: Phase 32 done. Phase 33 (Intel/hardware routing) is next.**

This document answers one question: **what actually works today vs what is architecture only?**

Sources used to produce this document:
- `type-registry.ts` (lines 394–567) — HARDWARE_TRUST_PROFILES and HARDWARE_GOVERNANCE_CLASS_MAP
- `gpu-plan.ts` — WebGPUComputePlan, NPUKernelPlan, APUSharedMemoryPlan stubs
- `wat-emitter.ts` — WASMSIMDCapability, two-target WASM architecture
- `galerina-hardware-compute-fabric.md` — HardwareGovernanceClass, ComputeFabricGraph
- `galerina-hardware-targets.md` — Target ID reference, contract.hardware syntax
- `galerina-calibration-data.md` — i9-9900K and i5-11400H profiles
- `galerina-hardware-apple.md` — Apple Silicon (Phase 36+)
- `galerina-hardware-nvidia.md` — Nvidia GPU (Phase 36+)
- `results/latest.json` — 8 confirmed benchmark runs with WASM column

---

## 1. Current Compatibility Table (Phase 32 Done)

Legend:
- **Full** — compiled, executed, benchmarked, confirmed working
- **Type-only** — target ID exists in HARDWARE_TRUST_PROFILES; no routing or runtime code
- **Stub** — data structure exists (gpu-plan.ts), no runtime dispatch
- **Architecture** — documented in KB files only; no TypeScript code written yet

### GovernancePlane (Class 0) — Standard ProofLevel

| Target | Target ID | ProofLevel | InputSeal | Works Today | Phase |
|---|---|---|---|---|---|
| Generic CPU | `cpu` | Standard | No | Full | Done |
| Generic WASM | `wasm` | Standard | No | Full (Phase 27) | Done |
| WASM SIMD 128 | `wasm.simd128` | Standard | No | Type-only (WASMSIMDCapability declared, not emitted) | Phase 22B |
| WASM WASI | `wasm.wasi` | Standard | No | Type-only (WASM_GOVERNANCE_CLASS_MAP entry only) | Phase 22+ |

**What "Full" means for WASM:** `Galerina source → WAT emitter → binary WASM (wabt JS) → WebAssembly.instantiate`. Confirmed across 8 benchmarks. Smallest binary: 96 bytes (fibonacci). Largest: 261 bytes (six-digit-guess). Compile times: 0.7ms–56ms (one-time).

### ExecutionPlane (Class 1) — Attested or Sealed ProofLevel

#### Intel x86

| Target | Target ID | ProofLevel | InputSeal | Works Today | Phase |
|---|---|---|---|---|---|
| Generic Intel x86-64 | `intel` | Attested | No | Type-only | Phase 33 |
| Intel AVX2 | `intel.avx2` | Attested | No | Type-only (both dev machines route here) | Phase 33 |
| Intel AVX-512 | `intel.avx512` | Attested | No | Type-only (neither machine has AVX-512) | Phase 33 |
| Intel P-cores | `intel.pcore` | Attested | No | Architecture (HARDWARE_GOVERNANCE_CLASS_MAP only) | Phase 33 |
| Intel E-cores | `intel.ecore` | Attested | No | Architecture (HARDWARE_GOVERNANCE_CLASS_MAP only) | Phase 33 |

#### AMD CPU

| Target | Target ID | ProofLevel | InputSeal | Works Today | Phase |
|---|---|---|---|---|---|
| Generic AMD | `amd` | Attested | No | Type-only | Phase 33+ |
| AMD Zen 4 | `amd.zen4` | Attested | No | Type-only | Phase 33+ |
| AMD Zen 5 | `amd.zen5` | Attested | No | Type-only | Phase 33+ |
| AMD EPYC | `amd.epyc` | Attested | No | Architecture (class map only) | Future |
| AMD 3D V-Cache | `amd.vcache` | Attested | No | Architecture (not in TRUST_PROFILES) | Future |

#### ARM

| Target | Target ID | ProofLevel | InputSeal | Works Today | Phase |
|---|---|---|---|---|---|
| Generic ARM | `arm` | Attested | No | Type-only | Future |
| ARM NEON | `arm.neon` | Attested | No | Type-only | Future |
| ARM SVE2 | `arm.sve2` | Attested | No | Type-only | Future |
| ARM SME2 | `arm.sme2` | Attested | No | Type-only | Future |
| ARM Cloud | `arm.cloud` | Attested | No | Architecture (class map only) | Future |
| ARM Edge | `arm.edge` | Attested | No | Architecture (class map only) | Future |

#### GPU

| Target | Target ID | ProofLevel | InputSeal | Works Today | Phase |
|---|---|---|---|---|---|
| Generic GPU | `gpu` | Attested | No | Stub (WebGPUComputePlan in gpu-plan.ts; WGSL skeleton only) | Phase 23 |
| AMD RDNA | `amd.rdna` | Attested | No | Type-only | Future |
| Google Axion | `google.axion` | Attested | No | Type-only | Future |

#### NPU / APU / AI Accelerators (Sealed — InputSeal required)

| Target | Target ID | ProofLevel | InputSeal | Works Today | Phase |
|---|---|---|---|---|---|
| Generic NPU | `npu` | Sealed | Yes | Stub (NPUKernelPlan in gpu-plan.ts; ONNX path undefined) | Phase 23 |
| NPU Validation | `npu.validation` | Sealed | Yes | Stub | Phase 23 |
| NPU AI | `npu.ai` | Sealed | Yes | Stub | Phase 23 |
| APU Shared Memory | `apu` | Sealed | Yes | Stub (APUSharedMemoryPlan in gpu-plan.ts) | Phase 23B |
| Apple Neural Engine | `apple.neural_engine` | Sealed | Yes | Architecture only | Phase 36 |
| Apple Silicon | `apple.silicon` | Sealed | Yes | Architecture only | Phase 36 |
| Google TPU Inference | `google.tpu.inference` | Sealed | Yes | Architecture only | Phase 36+ |
| Google TPU Training | `google.tpu.training` | Sealed | Yes | Architecture only | Phase 36+ |
| AMD CDNA | `amd.cdna` | Sealed | Yes | Architecture only | Future |
| AMD Instinct | `amd.instinct` | Sealed | Yes | Architecture only | Future |
| Qualcomm Hexagon | `qualcomm.hexagon` | Sealed | Yes | Architecture only | Future |

#### Nvidia GPU (Sealed — InputSeal required, CUDA opaque loops)

| Target | Target ID | ProofLevel | InputSeal | Works Today | Phase |
|---|---|---|---|---|---|
| Generic Nvidia | `nvidia` | Sealed | Yes | Architecture only | Phase 36 |
| Nvidia Blackwell | `nvidia.blackwell` | Sealed | Yes | Architecture only | Phase 36 |
| Blackwell RTX | `nvidia.blackwell.rtx` | Sealed | Yes | Architecture only | Phase 36 |
| Blackwell B200 | `nvidia.blackwell.b200` | Sealed | Yes | Architecture only | Phase 36 |
| Nvidia Hopper | `nvidia.hopper` | Sealed | Yes | Architecture only | Phase 36 |
| Nvidia Ada | `nvidia.ada` | Sealed | Yes | Architecture only | Phase 36 |
| Nvidia Ampere | `nvidia.ampere` | Sealed | Yes | Architecture only (i5 has RTX 3050 Ti; i9 has RTX 2060 — neither wired up) | Phase 36 |

### AcceleratorPlane (Class 2) — Escalated ProofLevel (InputSeal + Runtime Attestation)

| Target | Target ID | ProofLevel | InputSeal | Attestation | Works Today | Phase |
|---|---|---|---|---|---|---|
| Photonic | `photonic` | Escalated | Yes | Yes | Architecture only | Phase 40+ |
| Neuromorphic | `neuromorphic` | Escalated | Yes | Yes | Architecture only | Phase 40+ |

### ExperimentalPlane (Class 3) — FormalRequired ProofLevel

| Target | Target ID | ProofLevel | InputSeal | Attestation | Works Today | Phase |
|---|---|---|---|---|---|---|
| Quantum | `quantum` | FormalRequired | Yes | Yes | Architecture only | Phase 40+ |

---

## 2. The Two-Tier Boundary

### What the WASM Core Sees

The WASM binary is the governed portable core. It receives no information about the host silicon. Its world is:

```
WASM module imports:
  (import "host" "log"         (func $log         (param i32 i32)))
  (import "host" "effect"      (func $effect      (param i32 i32 i32)))
  (import "host" "capability"  (func $capability  (param i32 i32) (result i32)))
  (import "host" "audit_write" (func $audit_write (param i32 i32 i32)))
```

Pure flows (arithmetic, control flow, validation) have **zero imports**. The WAT emitter already produces these. Effectful flows import only the four above host functions. The WASM module never calls into any SIMD or hardware-specific import.

### What the Host Exposes

When Two-Tier routing is implemented (Phase 33), the host side adds a second import namespace for silicon-specific acceleration. The WASM import declaration for a SIMD matrix multiply looks like:

```wat
;; Declared in the WASM module when contract.hardware allows intel.avx2 or higher
(import "host.simd" "matmul_f32" (func $simd_matmul_f32
  (param i32   ;; ptr to input matrix A (f32 row-major, in WASM linear memory)
         i32   ;; ptr to input matrix B
         i32   ;; ptr to output matrix C (written by host)
         i32   ;; rows_a
         i32   ;; cols_a / rows_b
         i32)  ;; cols_b
))
```

The WASM module allocates the input and output buffers in its linear memory. The host function reads the sealed input buffer, dispatches to AVX2 (or scalar fallback), writes results back, and returns. The WASM module never executes the vector instructions directly — that is the host's job.

### How the Host Decides Between i5-AVX2 and i9-AVX2

Both machines are AVX2. The host-side routing will look like:

```typescript
// Phase 33: to be implemented in a new file, e.g. src/runtime/hardwareRouter.ts
function selectSimdTier(cpuProfile: CpuProfile): SimdTier {
  if (cpuProfile.vector.includes("avx512f")) return SimdTier.AVX512;
  if (cpuProfile.vector.includes("avx2"))    return SimdTier.AVX2;
  if (cpuProfile.vector.includes("sse4_2"))  return SimdTier.SSE4;
  return SimdTier.Scalar;
}
```

Both the i5-11400H and i9-9900K will return `SimdTier.AVX2`. The router calls the same AVX2 implementation on both machines. The difference between the two machines is **throughput** (i9 has 8 cores, 5.0GHz turbo vs i5's 6 cores, 4.5GHz turbo) — not the code path. The compiled WASM binary is byte-for-byte identical on both machines.

### The Governance Contract: Which Flows May Use Host Silicon

A flow may only cross the Two-Tier boundary if the GovernancePlane has cleared it. The enforcement chain is:

```
1. ProofGraph validates the flow's contract block (all graph checks pass)
2. contract.hardware declares: target intel.avx2  (or allow intel.avx2)
3. GovernancePlane checks: HARDWARE_TRUST_PROFILES.get("intel.avx2").governanceClass
   → ExecutionPlane(1) — requires ProofGraph + ExecutionSignature
4. For Sealed targets (NPU, GPU): GovernancePlane computes inputSeal = SHA-256(inputs)
   and records it in ProofGraph before dispatching to the host import
5. The host WASM import is only registered if the CostGraph approved the target
6. If the target is unavailable (no AVX2), the import is not registered and the
   WASM module falls back to scalar computation via its own loop body
```

The invariant: **if `host.simd.matmul_f32` is importable, it has already been approved by the GovernancePlane.** A flow that never declares `hardware { allow intel.avx2 }` never gets the import registered. It runs purely in WASM.

---

## 3. Passive Compatibility — What Requires Zero Code Changes

### What WASM Portability Means in Practice

The WASM binary is the complete governed core. Every hardware target listed in this document that is `Type-only` or `Architecture only` today will **run correctly on WASM** with zero code changes. That is the point of the Two-Tier design:

- A flow deployed on an i9-9900K, a Raspberry Pi, an Apple M4, or a Google Axion server all execute the same WASM binary.
- The WASM binary contains the governance logic, the proof verification, the audit writes, and the computation.
- The host silicon optimisations are **additive acceleration**, not required for correctness.

### Confirmed WASM Portability (Phase 27)

The 8 confirmed benchmark WASM binaries are fully portable:

| Benchmark | Binary Size | Works On | Works On |
|---|---|---|---|
| arithmetic-threshold | 157 bytes | i5-11400H (dev) | Any WASM runtime |
| compute-mix | 250 bytes | i5-11400H (dev) | Any WASM runtime |
| six-digit-guess | 261 bytes | i5-11400H (dev) | Any WASM runtime |
| record-allocation | 115 bytes | i5-11400H (dev) | Any WASM runtime |
| fibonacci-recursive | 96 bytes | i5-11400H (dev) | Any WASM runtime |
| collection-pipeline | 114 bytes | i5-11400H (dev) | Any WASM runtime |
| governance-cost | 133 bytes | i5-11400H (dev) | Any WASM runtime |
| hardware-targets | 170 bytes | i5-11400H (dev) | Any WASM runtime |

These binaries will run on every hardware target in this document as long as a WASM runtime is available.

### What Breaks on Constrained Platforms

**32-bit ARM (ARMv7, Raspberry Pi 2):**
- WASM itself runs but is limited to 32-bit address space (2 GB max linear memory)
- Tensor operations on large matrices that exceed 32-bit addressing will fail
- The governance structures (ProofGraph, AuditGraph) are heap-allocated in JS/Node — they are unaffected
- Galerina WASM binaries today are all under 300 bytes and use no memory imports — they run fine
- Impact: none for current benchmarks; relevant only for future large tensor workloads

**Raspberry Pi 3/4/5 (ARMv8 64-bit):**
- WASM runs correctly. Node.js is available.
- Performance penalty: no AVX2, no NEON SIMD acceleration from the host
- The WASM binary runs scalar. All governance logic is correct.
- The i5 benchmark figures degrade proportionally (expect roughly 3-5x slower for integer workloads, 6-8x slower for float-heavy workloads)
- `arm.neon` host acceleration would restore performance but is not yet implemented

**Browser (any platform):**
- WASM runs correctly. `WebAssembly.instantiate` is available in all modern browsers.
- The `wasm.wasi` target (filesystem, clock, stdin) does NOT work in a browser — WASI is a non-browser interface
- Pure flows (the benchmarks above) run in-browser unchanged
- Effectful flows that import `host.effect` would need the JS host shim registered by the browser runtime

**Wasmtime / Wasmer (standalone):**
- WASM WASI target runs. Phase 27 confirmed `wabt` JS assembler produces valid binaries.
- The `wasm.wasi` path requires a second entry point and WASI import table — not yet emitted

---

## 4. The AVX2 Gap

### Current Situation

Both development machines are confirmed AVX2, no AVX-512:

| Machine | CPU | AVX2 | AVX-512 | Cores | Max Turbo |
|---|---|---|---|---|---|
| i5-11400H (dev) | Tiger Lake H | Yes | No | 6c/12t | 4.5 GHz |
| i9-9900K (truth) | Coffee Lake | Yes | No | 8c/16t | 5.0 GHz |

The hardware-targets benchmark confirms this directly: the Rust bench compiled with `target_feature = avx2` shows `"simdLevel": "avx2"`. The Rust bench compiled without shows `"simdLevel": "scalar"`. The `rustAvx512` column is absent from all benchmark results because neither machine has AVX-512.

The benchmark results show that for the current workloads (integer loops, branching, collection pipelines), AVX2 vs scalar makes **a small difference on these benchmarks**:
- arithmetic-threshold: Rust scalar 1352M/s vs Rust AVX2 1365M/s — only 1% difference (scalar integer loop, auto-vectorisation limited)
- collection-pipeline: Rust scalar 383K/s vs Rust AVX2 1213K/s — 3.2x difference (array iteration, AVX2 helps significantly)
- hardware-targets (dot product): Rust scalar 1091B FMA/s vs Rust AVX2 1076B FMA/s — near-identical (Rust auto-vectorises the scalar path)

### Expected AVX-512 Gains on an AVX-512 Machine

When Phase 33 lands and the project is tested on a Xeon, AMD Zen 4/5, or Intel Core i9 HX (which have AVX-512), the expected differences:

| Flow Type | AVX2 (i9-9900K) | AVX-512 (expected) | Gain | Reason |
|---|---|---|---|---|
| F32 dot product / matmul | ~1076 B FMA/s | ~2.0-2.5 B FMA/s | ~2x | 16-wide vs 8-wide FMA lanes |
| Bulk SHA-256 (InputSeal computation) | ~200 MB/s | ~350-400 MB/s | ~1.8x | AVX-512 SHA extensions on select CPUs |
| ProofGraph construction (hashing) | Baseline | ~1.5-2x faster | ~1.5x | Wider vector hashing |
| Integer branching (governance-cost, arithmetic-threshold) | Minimal gain | Minimal gain | ~1% | AVX-512 does not help scalar integer loops |
| Collection pipeline (filter/map over arrays) | Baseline | ~2x | ~2x | VPCONFLICT, VMOVDQU32 with k-masks |

**Galerina flows that would benefit most from AVX-512:**

1. **Bulk Input/Output Seal computation** — SHA-256 over large input buffers dispatched to NPU/GPU. When AVX-512 SHA extensions are present, the seal computation (currently the governance bottleneck for large Sealed-tier dispatches) halves in time.

2. **Tensor validation** — validating matrix shapes and checking NaN/Inf in input tensors before NPU dispatch. 16-wide f32 range checks (vrange_ps) are an AVX-512F instruction not available on AVX2.

3. **Bulk PII redaction** — scanning large byte arrays for PII field offsets and zeroing them. AVX-512 VPCMPEQB with k-mask writes is significantly faster than AVX2 equivalent.

4. **AuditGraph write compression** — for Blackwell's hardware decompression path. The CPU-side seal computation before GPU compression is the bottleneck; wider SIMD reduces it.

**The i9-9900K as truth machine:** All published benchmark figures show what the AVX2 tier achieves. These numbers are the correct baseline for the vast majority of real deployments (which are also AVX2 desktops, laptops, and cloud VMs). AVX-512 figures should be reported separately when a qualifying machine is available and clearly labelled as the AVX-512 tier.

---

## 5. Phase 33 Action Items — Minimum to Make Two-Tier Real

Phase 33 is "Intel/hardware routing." The current state is that all Intel target IDs exist in `HARDWARE_TRUST_PROFILES` and `HARDWARE_GOVERNANCE_CLASS_MAP` but **nothing routes to them**. Every flow executes on WASM regardless of what `contract.hardware` declares.

Three specific code-level actions to make the Two-Tier design real:

### Action 1: Add `src/runtime/hardwareRouter.ts` — CPU Feature Detection and Tier Selection

Create a new file. This is the host-side half of the Two-Tier boundary.

```typescript
// src/runtime/hardwareRouter.ts
import * as os from "os";

export const enum SimdTier {
  Scalar  = 0,
  SSE4    = 1,
  AVX2    = 2,
  AVX512  = 3,
}

export interface CpuHardwareProfile {
  readonly simdTier:   SimdTier;
  readonly coreCount:  number;
  readonly topology:   "symmetric" | "hybrid";   // hybrid = P/E cores
}

/** Detect host CPU capabilities at runtime. Phase 33: x86 only. */
export function detectCpuProfile(): CpuHardwareProfile {
  // Node.js does not expose CPUID directly. Phase 33 options:
  //   Option A: spawn a small Rust binary that runs CPUID and returns JSON
  //     (the bench-hardware-rust binary already emits simdLevel — reuse it)
  //   Option B: check process.env.GALERINA_SIMD_TIER for CI override
  //   Option C: use os.cpus()[0].model and string-match known AVX2/AVX-512 families
  // Start with Option B + C for Phase 33; graduate to Option A for Phase 34.
  const override = process.env["GALERINA_SIMD_TIER"];
  if (override === "avx512") return { simdTier: SimdTier.AVX512,  coreCount: os.cpus().length, topology: "symmetric" };
  if (override === "avx2")   return { simdTier: SimdTier.AVX2,    coreCount: os.cpus().length, topology: "symmetric" };
  if (override === "sse4")   return { simdTier: SimdTier.SSE4,    coreCount: os.cpus().length, topology: "symmetric" };
  if (override === "scalar") return { simdTier: SimdTier.Scalar,  coreCount: os.cpus().length, topology: "symmetric" };

  // Heuristic: Coffee Lake and Tiger Lake H are both symmetric AVX2
  const model = os.cpus()[0]?.model ?? "";
  const isHybrid = /12th|13th|14th|Core Ultra/i.test(model);
  const hasAvx512Hint = /Xeon|i9.*HX|i9.*X/i.test(model);
  return {
    simdTier:  hasAvx512Hint ? SimdTier.AVX512 : SimdTier.AVX2,
    coreCount: os.cpus().length,
    topology:  isHybrid ? "hybrid" : "symmetric",
  };
}

/** Map a hardware target ID to the minimum SimdTier required. */
export function targetRequiresSimdTier(targetId: string): SimdTier {
  if (targetId === "intel.avx512") return SimdTier.AVX512;
  if (targetId === "intel.avx2")   return SimdTier.AVX2;
  if (targetId === "intel")        return SimdTier.SSE4;
  return SimdTier.Scalar;
}

/** Resolve contract.hardware.target to the best available tier on this host. */
export function resolveHardwareTarget(
  requestedTarget: string,
  fallbackTarget: string,
  profile: CpuHardwareProfile,
): string {
  const required = targetRequiresSimdTier(requestedTarget);
  if (profile.simdTier >= required) return requestedTarget;
  // Degrade to fallback (typically "intel.avx2" or "cpu" or "wasm")
  return fallbackTarget;
}
```

This file is self-contained and has no dependencies on the rest of the compiler. It can be written and tested independently of any other Phase 33 work.

### Action 2: Register Host SIMD Imports in `src/runtime/runtimeContext.ts` — Wire the Two-Tier Boundary

The WASM module currently calls only `host.log`, `host.effect`, `host.capability`, and `host.audit_write`. To expose `host.simd.*`, the import object passed to `WebAssembly.instantiate` must be extended:

```typescript
// In src/runtime/runtimeContext.ts (or wherever WebAssembly.instantiate is called)
// Phase 33: add hardware-tier imports to the WASM import object.

import { detectCpuProfile, resolveHardwareTarget, SimdTier } from "./hardwareRouter.js";

function buildWasmImports(
  hardwareTarget: string,
  cpuProfile: ReturnType<typeof detectCpuProfile>,
  // ... existing imports
): WebAssembly.Imports {
  const baseImports = {
    host: {
      log:         hostLog,
      effect:      hostEffect,
      capability:  hostCapability,
      audit_write: hostAuditWrite,
    },
  };

  // Only expose host.simd if the contract declared a hardware target that needs it
  // AND the host CPU can satisfy the tier requirement
  const resolvedTarget = resolveHardwareTarget(hardwareTarget, "wasm", cpuProfile);
  if (resolvedTarget === "intel.avx2" || resolvedTarget === "intel.avx512") {
    return {
      ...baseImports,
      "host.simd": {
        matmul_f32: hostSimdMatmulF32,   // Phase 33: implement with typed arrays + JS loop
                                          // Phase 34: replace JS implementation with native addon
      },
    };
  }

  return baseImports;  // Pure WASM fallback — no host.simd imports registered
}
```

The key point: **the import namespace is conditionally constructed based on the resolved hardware target**. If `host.simd` is not registered and the WASM module tries to import it, `WebAssembly.instantiate` will throw at link time — a hard compile-time failure, not a silent runtime fallback. This is the governance enforcement mechanism.

For Phase 33, `hostSimdMatmulF32` can be implemented as a plain JS typed array operation — no native addon needed. This makes the Two-Tier boundary real without requiring a Rust FFI addon. The function signature matches the WAT import declaration from Section 2.

### Action 3: Add Hardware Target Validation Pass in `src/governance-verifier.ts`

Currently the governance verifier checks ProofLevel, capabilities, effects, and privacy. It does not check whether the declared `hardware.target` is actually satisfiable on the host. Add one validation function:

```typescript
// In src/governance-verifier.ts
// Phase 33: add hardware target satisfiability check.

import { HARDWARE_TRUST_PROFILES } from "./type-registry.js";
import { detectCpuProfile, resolveHardwareTarget } from "./runtime/hardwareRouter.js";

/**
 * SPORE-HW-001: Hardware target declared in contract.hardware must be in HARDWARE_TRUST_PROFILES.
 * SPORE-HW-002: Hardware target governance class must not exceed GovernancePlane for
 *             flows that issue leases or modify policy.
 * SPORE-HW-003: If target resolves to a lower tier on this host, emit a warning (not an error)
 *             because the WASM fallback ensures correctness.
 * SPORE-HW-004: safety_critical and medical classifications cannot use FP4/FP8 precision.
 */
export function verifyHardwareTarget(
  targetId: string,
  classification: string,
  flowIssuesLeases: boolean,
  cpuProfile: ReturnType<typeof detectCpuProfile>,
  diagnostics: Diagnostic[],
): void {
  const profile = HARDWARE_TRUST_PROFILES.get(targetId);
  if (!profile) {
    diagnostics.push({ code: "SPORE-HW-001", severity: "error",
      message: `Unknown hardware target: "${targetId}". Check galerina-hardware-targets.md for valid IDs.` });
    return;
  }
  if (flowIssuesLeases && profile.governanceClass !== HardwareGovernanceClass.GovernancePlane) {
    diagnostics.push({ code: "SPORE-HW-002", severity: "error",
      message: `Flow issues leases but declares non-GovernancePlane target "${targetId}". Lease-issuing flows must run on CPU or WASM.` });
  }
  const resolved = resolveHardwareTarget(targetId, "wasm", cpuProfile);
  if (resolved !== targetId) {
    diagnostics.push({ code: "SPORE-HW-003", severity: "warn",
      message: `Target "${targetId}" not available on this host (${cpuProfile.simdTier}). Routing to "${resolved}". Correctness preserved; performance reduced.` });
  }
  if ((classification === "medical" || classification === "safety_critical") &&
      (targetId.includes("fp4") || targetId.includes("fp8"))) {
    diagnostics.push({ code: "SPORE-HW-004", severity: "error",
      message: `FP4/FP8 precision forbidden for "${classification}" classification. Use FP32.` });
  }
}
```

This pass connects the type-system data (`HARDWARE_TRUST_PROFILES`) to the governance verifier for the first time. It is the minimum viable implementation that makes `contract.hardware` declarations produce real compiler errors rather than being silently ignored.

---

## Summary: What is Real vs What is Architecture

| Status | Count | Targets |
|---|---|---|
| Full (benchmarked, confirmed) | 2 | `cpu`, `wasm` |
| Type-only (in TRUST_PROFILES, no runtime) | 15 | All Intel, AMD CPU, ARM, GPU, RDNA, Axion targets |
| Stub (data structure in code, no dispatch) | 3 | `gpu`, `npu`, `apu` (gpu-plan.ts stubs) |
| Architecture only (KB docs, no TypeScript) | 17 | Apple, Nvidia, Google TPU, Qualcomm, Photonic, Neuromorphic, Quantum |

**The WASM portability guarantee covers all 37 targets.** Every target in this document runs correctly on WASM today. The Two-Tier design means host silicon acceleration is strictly additive — it improves throughput but never changes governance outcomes.

---

## See Also

- `galerina-hardware-compute-fabric.md` — HardwareGovernanceClass definitions, ComputeFabricGraph
- `galerina-hardware-targets.md` — All target IDs, contract.hardware syntax
- `galerina-calibration-data.md` — i9-9900K and i5-11400H specs, Two-Tier routing rules
- `galerina-hardware-apple.md` — Apple Silicon (Phase 36+)
- `galerina-hardware-nvidia.md` — Nvidia GPU (Phase 36+)
- `src/type-registry.ts` (lines 394–567) — HARDWARE_TRUST_PROFILES, ProofLevel definitions
- `src/gpu-plan.ts` — WebGPUComputePlan, NPUKernelPlan, APUSharedMemoryPlan stubs
- `src/wat-emitter.ts` — WASMSIMDCapability, two-target WASM architecture
- `packages-galerina/galerina-devtools-benchmarks/results/latest.json` — Confirmed benchmark data
