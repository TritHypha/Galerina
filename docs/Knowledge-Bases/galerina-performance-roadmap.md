# Galerina — Performance Architecture Roadmap

## Status

```
Phase 21+ — Implementation roadmap
Foundation: Tensor<T,Shape> types (implemented), pure flow qualification (implemented)
Key principle: "Fast by planning execution before runtime, secure by proving governance before execution"
```

## TL;DR

- Galerina becomes faster by moving safety and governance work to compile time, then emitting predictable typed low-allocation runtime code
- Not a claim to beat C++ generally — a claim to be significantly faster than interpreted Python/Ruby for numeric/AI workloads
- The optimization opportunities arise directly from Galerina's governance model (typed tensors, pure flows, capability declarations)

---

## Language Comparison

| Language | Strength | Weakness | Galerina difference |
|---|---|---|---|
| C++ | Very fast, native control | Memory safety risks, weak governance | Galerina trades raw control for governed safety |
| Rust | Fast + memory safe | High cognitive load, borrow complexity | Galerina aims for safety with clearer contracts |
| Python | Very easy, huge AI ecosystem | Slow runtime, weak static safety | Galerina aims for readable code with stronger verification |
| TypeScript | Web-friendly, productive | Runtime trust still weak, JS escape hatches | Galerina adds effects, contracts, PII tracking, audit proof |
| Go | Simple, fast services | Limited type/governance expressiveness | Galerina adds explicit governance and auditability |
| Java/Kotlin | Mature runtimes, tooling | Heavy runtime, governance external | Galerina moves governance into source/contracts |
| **Galerina** | **Governance-first, AI-readable, auditable** | **Early-stage, runtime still evolving** | **Designed around contracts, effects, proof, and future compute** |

---

## Approved Optimizations (Fit Galerina)

### 1. Monomorphisation (Phase 21B)

For generics, emit specialised versions rather than generic dispatch:

```galerina
// Source
pure flow add<T>(a: T, b: T) -> T {
  return a + b
}
```

Compiler emits internally:
```text
add_Int
add_Decimal
add_Float32
```

Benefits: less dynamic dispatch, faster runtime, better V8/JIT optimisation, clearer type errors.

### 2. TypedArray / ArrayBuffer Lowering (Phase 21A — highest priority)

```galerina
Tensor<Float32, [768]>
```

lowers to `Float32Array` length 768 — not normal JS arrays.

Benefits: contiguous memory, less object overhead, better cache locality, better GPU/WASM bridge path. Already decided and documented in `galerina-tensor-numeric-performance.md`.

### 3. Object Flattening / Structure of Arrays (Phase 21C)

For hot math paths with record types, emit flat arrays or SoA layout:

```galerina
record Vector3 { x: Float32, y: Float32, z: Float32 }
```

Hot path emits `Float32Array` or separate flat fields, not JS objects per element.

### 4. Capability-Driven Dead-Code Elimination (Phase 21A)

Very Galerina-native. If a flow has no `network.outbound` declared, network-capable code must not appear in that flow's execution plan.

Benefits: smaller output, less attack surface, faster startup, cleaner audit proof.

### 5. Pure-Flow Hot Path Optimisation (Phase 21A)

A `pure flow` means: no I/O, no capabilities, no audit writes, no database, no mutation outside scope. The compiler can emit tight loops, fuse operations, and avoid governance checks inside the numeric hot path.

### 6. Kernel Fusion (Phase 21C)

```galerina
let a = Tensor.scale(x, 0.5)
let b = Tensor.add(a, bias)
let c = Tensor.relu(b)
```

emits one fused pass: `out[i] = relu(x[i] * 0.5 + bias[i])`

Reduces memory traffic (no intermediate allocations).

### 7. WASM Numeric Backend (Phase 22)

```text
Galerina governance layer → JS (capabilityHost, audit, governance)
Numeric kernel         → WASM SIMD
```

Host capabilities still stay outside the WASM kernel — security boundary maintained.

### 8. GPU/NPU Target Bridges (Phase 22-23)

Same Galerina source, different execution plan target. Governance verified before dispatch.

---

## What NOT to Claim

❌ "Galerina beats C++ generally" — not true  
❌ "Galerina eliminates GC completely" — V8 GC remains  
❌ "Galerina has zero runtime security cost" — governance has overhead  

✅ Correct claim: **"Galerina moves as much safety and governance work as possible to compile time, then emits predictable, typed, low-allocation runtime code."**

---

## Implementation Order (Highest ROI First)

```
Phase 21A:  TypedArray lowering + Capability-driven DCE + Pure-flow hot path
Phase 21B:  Monomorphisation + Shape-specialised kernels
Phase 21C:  Object flattening + Kernel fusion
Phase 22:   WASM SIMD numeric backend
Phase 23:   GPU/NPU target bridges
```

---

## See Also

- `galerina-tensor-numeric-performance.md` — TypedArray lowering detail
- `galerina-cache-aware-execution.md` — L1/L2/L3 tiling, SoA
- `galerina-ai-memory-efficiency.md` — tensor arenas, activation lifetime
- `galerina-passive-execution-plans.md` — plan-based execution enabling these
- `galerina-hardware-as-capabilities.md` — compute target selection
