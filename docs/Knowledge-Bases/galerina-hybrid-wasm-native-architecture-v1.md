# Galerina Hybrid WASM–Native Architecture for Snapdragon and Future Accelerators

**Secure Governance, High-Performance Compute, and Future Hardware Integration**

**Version: 1.0 — 2026-05-31**

**Status: Canonical architecture direction document**

---

## Executive Summary

Galerina is designed around a fundamental principle:

> Governance, security, privacy, and accountability should be proven before execution.

Modern hardware is increasingly heterogeneous:

```
CPUs, GPUs, NPUs, APUs, DSPs, FPGAs, Photonic Processors, Future accelerator architectures
```

Traditional runtimes (Node.js, Python) treat all hardware as CPU-centric execution environments. Hardware acceleration is introduced through native libraries with ambient authority and little governance visibility.

Galerina takes a different approach. The architecture separates:

```
WASM            = Governance and Control
Native          = Acceleration and Compute
Compiler        = Placement Authority
Shared Arena    = Communication Boundary
```

This enables Galerina to remain secure, auditable, portable, and deterministic while exploiting modern hardware accelerators such as Qualcomm Snapdragon NPUs.

---

## Core Architectural Principle

### WASM Governs

The WASM layer is responsible for:
- Contracts, effects, governance, validation
- Audit obligations, policy enforcement
- Request routing, state transitions
- Workflow orchestration

**WASM answers:** *What is allowed to happen?*

### Native Accelerates

The native execution layer is responsible for:
- Tensor operations, matrix multiplication, SIMD workloads
- NPU inference, GPU acceleration
- Video processing, scientific computing
- Future photonic workloads

**Native answers:** *How should the computation happen?*

---

## Galerina Execution Pipeline

```
Galerina Source
    ↓
Parser
    ↓
Type Checker
    ↓
Value-State Checker
    ↓
Effect Checker
    ↓
Governance Verifier
    ↓
SemanticGraph
    ↓
Passive Execution Plan
    ↓
Target Planner
    ↓
Backend
```

**Possible backends:** JavaScript · WASM/WASI · Native · GPU · NPU · APU · Photonic

**Governance is proven before backend selection occurs.**

---

## Control Plane vs Data Plane

### Control Plane (WASM)

**Responsibilities:** authentication, authorization, privacy enforcement, policy evaluation, effect validation, workflow execution, audit generation

**Properties:** portable · deterministic · sandboxed · auditable

### Data Plane (Native)

**Responsibilities:** high-volume computation, tensor execution, device interaction, accelerator scheduling, SIMD execution

**Properties:** hardware aware · vendor optimized · throughput focused

---

## Snapdragon Integration Strategy

### Qualcomm Hexagon NPU

Snapdragon platforms contain dedicated tensor acceleration hardware through the Hexagon NPU. Traditional runtimes rarely use this efficiently.

Galerina exposes it through governed execution:

```galerina
contract {
  effects {
    ai.inference
  }
  targets {
    prefer [npu, gpu, cpu]
    fallback cpu
  }
}
```

The compiler verifies authority. The runtime chooses the best available accelerator.

### Hardware Access Is Not Ambient Authority

These are different concepts:

**Target preference** (planning metadata):
```galerina
targets {
  prefer [npu]
}
```
Means: *use NPU if available* — does not grant hardware access.

**Capability authority** (effect declaration):
```galerina
effects {
  ai.inference    // maps to: host.npu.inference
}
```
This grants authority to perform inference. The runtime verifies this before execution.

---

## Governed Shared Memory Arena

Passing raw pointers into WASM memory breaks WASM's isolation model. Galerina uses a governed arena instead.

### Shared Arena Model

```
Shared Arena
  ├── Metadata
  ├── Tensor Buffers
  ├── Payload Buffers
  ├── Result Buffers
  └── Audit Markers
```

Neither WASM nor Native receives unrestricted memory access. Instead they exchange:

```
offset
length
permissions
```

through typed handles:

```
TensorHandle { offset: 4096, length: 8192 }
```

Native modules never receive unrestricted access to the WASM runtime.

---

## Native Isolation Strategy

Native code remains inherently dangerous. A segmentation fault can crash an entire process. Galerina addresses this through worker isolation.

### Phase 27 Model

```
Host Supervisor
  ├── WASM Worker
  └── Native NPU Worker (child process)
```

Communication: shared memory handles · IPC · anonymous memory maps · local sockets

**If the native worker crashes:**
1. Audit event generated
2. Worker restarted
3. Fallback executed (declared fallback target)
4. Application continues serving

The governance layer remains intact. WASM never crashes because native crashes.

---

## Privacy and PII Protection

Protected values cannot cross native boundaries directly.

```
[protected MessageText]  →  (WASM Tokenizer)  →  [Tensor Buffer]  →  (Native Inference)
      Text strings                                  Raw Float arrays      Safe compute
```

The native layer receives only numerical tensor data. PII strings never exist in the native memory space. This is enforced as a **compile-time type error** by the Governance Verifier — not a runtime check.

---

## ARM64 / Snapdragon Optimisation Strategy

Snapdragon processors benefit from:
- NEON SIMD → use Tensor stdlib (WASM SIMD path)
- Large L1/L2 caches → arena allocation, fixed tensor shapes
- Unified memory → shape-aware lowering, TypedArrays

Avoid: dynamic object graphs · excessive allocations · large GC pressure

**Goal:** predictable execution, not manual memory management.

---

## Future Hardware Support

### GPU
```galerina
targets { prefer [gpu, cpu] }
```
Lowering: WebGPU · CUDA · ROCm · Metal · DirectML

### APU
Useful for: shared memory · mixed graphics and AI · low-power edge devices

### Photonic
Future photonic systems appear as **native accelerator providers**. The WASM governance layer is unchanged. Photonic hardware never bypasses contracts, effects, governance, or audit obligations.

---

## WASM Component Model Alignment

Future Galerina native interfaces align with the WebAssembly Component Model:

```wit
interface galerina-hardware-npu {
    record tensor-view {
        offset: u32,
        length: u32,
    }
    execute-inference: func(input: tensor-view, output: tensor-view) -> result<void, u32>;
}
```

Benefits: typed interfaces · explicit ownership · better portability · strong capability boundaries

`NativeCapabilityId.NpuInference` maps directly to this interface type.

---

## Deployment Roadmap

### Phase 25 — Hybrid (Node.js + WASM)
```
Node.js → WebAssembly.instantiate → Governed Auth Service
```
Goal: real traffic · real audit trails · real governance

### Phase 26 — Standalone (WASM/WASI)
```
WASM/WASI → wasmtime
```
Goal: no Node.js dependency · true standalone execution · WASI imports

### Phase 27 — Native Acceleration
```
Tensor.dot → NPU inference → GPU acceleration
```
Requirements: signed providers · child-process isolation · shared arena handles · audit evidence · CPU fallback

---

## Guiding Principle

> Galerina should not treat hardware acceleration as an escape hatch.

```
WASM Governs.
Native Accelerates.
Compiler Proves The Boundary.
```

This allows Galerina to exploit future CPUs, GPUs, NPUs, APUs, and photonic processors while preserving its core promise:

**Security, privacy, governance, transparency, and accountability by design.**

---

## Implementation Status

| Component | Status |
|---|---|
| WASM governance layer | ✅ Phase 24 — WAT emitter, governed imports |
| NativeCapabilityId constants | ✅ Phase 18G+ |
| Shared arena (DataHandle) types | ✅ Phase 18G (types defined) |
| Supervisor model | 📋 Phase 27 |
| Tensor.dot native plugin | 📋 Phase 27 |
| Component Model ABI | 📋 Phase 27-28 |
| Photonic bridge | 📋 Phase 29+ |

---

## See Also

- `galerina-hybrid-wasm-architecture.md` — detailed EDA model, crash recovery, WAT assembler decision
- `galerina-security-anti-abuse.md` — anti-botnet protections, network destination policy
- `galerina-runtime-interpreter-roadmap.md` — interpreter evolution plan
- `galerina-gir-emitter-architecture.md` — GIR and WASM lowering plan
- `galerina-passive-execution-plans.md` — execution plan foundation
