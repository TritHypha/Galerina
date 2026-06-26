# Galerina — Runtime / Interpreter Improvement Roadmap

## Current State

Galerina Stage A uses a **tree-walking interpreter** (`interpreter.ts`):
```
AST node → pattern match → execute child nodes recursively → return GalerinaValue
```

This is correct and simple. The right foundation for Stage A. It is NOT the final architecture.

## Principle

```
Secure as possible, fast as possible, without contradiction.

The key insight: governance proof at compile time → zero governance overhead at runtime.
Static capability proofs mean no runtime capability checks in hot paths.
Effect bitsets mean O(1) subset checking.
```

---

## Ideas from Other Languages (Applied to Galerina)

### From Lua / LuaJIT — Register VM

Lua's VM is one of the fastest scripting VMs ever built.

**What to borrow:**
- Register-based bytecode (vs tree-walking) → Phase 21
- Compact instruction format (opcode + 3 registers, 4 bytes per instruction)
- Upvalues for captured bindings (maps to Galerina's let/mut scoping)
- No boxing for small integers (tagged pointer or NaN-boxing)

**Why it fits Galerina:**
- Galerina flows are bounded (no dynamic loading, no monkey patching) → tight bytecode
- Pure flows can be compiled to pure register-based loops with no GC pressure
- Upvalues map cleanly to Galerina's lexical scope without mutation surprises

**What NOT to borrow:**
- Lua's metatables (Galerina has no prototype mutation — SPORE-SEC-021)
- Lua's `rawget/rawset` (bypasses governance)

---

### From CPython 3.11-3.13 — Adaptive Specialization

Python's major speedup came from **specializing bytecode** for observed types.

**What to borrow:**
- Specialize hot paths for known types (Int add → direct int addition, no dispatch)
- Inline cache for method calls (the type is known from effects/value-state)

**Why it fits Galerina better than Python:**
- Galerina has static types proven at compile time → specialization is **certain**, not adaptive
- `pure flow add(a: Int, b: Int) -> Int` can emit a single typed add instruction with NO guard
- Python has to guess and deoptimize. Galerina never deoptimizes.

---

### From Rust / Zero-Cost Abstractions

**What to borrow:**
- Move governance proof to compile time, pay zero runtime cost ✅ (already Galerina's direction)
- Ownership model → Galerina's value-state checker proves safe transitions statically
- No hidden allocations → Galerina's arena plan (Phase 23) follows this
- Drop in deterministic order → Galerina `resource { }` lifecycle

**What NOT to borrow:**
- Borrow checker complexity (Galerina's value-state model is simpler)
- Unsafe blocks at systems level (Galerina's unsafe is bounded and declared)

---

### From V8 / JIT Compilation

**What to borrow:**
- Tiered compilation: interpret first → JIT when hot
- For Galerina: `pure flow` with no effects → ideal JIT candidate (no side-effect guards)
- V8 already JITs the JS output if Galerina emits JS (Phase 21A)

**Key advantage:**
Galerina provides MORE information to V8 than plain JS:
- The effect mask tells V8 there are no I/O calls → optimize aggressively
- TypedArray for tensors → V8's typed array JIT paths fire immediately
- `pure flow` → V8 can inline and constant-fold freely

**What NOT to do:**
- Don't fight V8's JIT with hand-written asm.js tricks
- Instead, emit JS that V8 recognizes as fast (typed arrays, predictable shapes, no dynamic dispatch)

---

### From WASM / WASI

**What to borrow:**
- Linear memory model → each flow execution gets a memory region
- Typed imports/exports → capabilities map to WASM imports
- Stack-based VM for expression evaluation (simpler than register for first pass)
- Deterministic execution → WASM has no threads by default (fits Galerina's model)
- WASI → filesystem/network access as typed system calls (maps exactly to Galerina effects)

**Galerina advantage:**
- Effect mask → exactly the WASM imports needed. No more, no less.
- Pure flows → WASM functions with NO imports (pure computation)
- PassiveExecutionPlan → translates directly to a WASM function body

**Target path:**
```
pure flow           → WASM function with no imports
guarded flow        → WASM function with typed effect imports
GIR.entryPoints     → WASM exports
GIR.allowedEffects  → WASM import table
```

---

### From Go — Simple Runtime, Bounded Concurrency

**What to borrow:**
- Simple goroutine-like tasks for `parallel safe` flows (proven by EffectCheckerFlags.ParallelSafe)
- Channel-based communication (maps to Galerina events and `message.publish`)
- Efficient GC with short pause times

**What NOT to borrow:**
- Go's lack of effect tracking (Galerina tracks everything)
- Implicit nil (Galerina uses Option<T>)

---

### From Zig — Comptime, No Hidden Allocations

**What to borrow:**
- Compile-time evaluation for known-pure expressions (Galerina pure flows are comptime-eligible)
- Explicit allocator patterns → Galerina's arena plan (Phase 23)
- No hidden control flow → Galerina's no-monkey-patching rule (SPORE-SEC-020/021)

---

## What Legacy Should Go (Current Interpreter)

### Replace Tree-Walking with Bytecode VM (Phase 21)
**Current:** `interpreter.ts` pattern-matches on AstNode recursively.
**Better:** Compile AST to flat bytecode once, execute the bytecode many times.
- One-time cost: AST → bytecode
- Hot path: tight bytecode loop (no tree traversal, better cache locality)

### Replace String Capability Checks with Bitset (Phase 19)
**Current:** `capabilityHost.ts` checks strings like `"database.read"`.
**Better:** `declared & required === required` using EffectFlags.
- Already done in type-registry.ts. Wire into capabilityHost in Phase 19.

### Replace String Binding Parsing at Runtime (Phase 19)
**Current:** The interpreter parses `"unsafe email: Email"` at runtime.
**Better:** Compile binding info to ValueStateFlags once, store in bytecode.
- ValueStateFlags already defined. Wire in Phase 19.

### Metadata Erasure (Phase 21A)
**Current:** Intent strings, contract metadata, suggestedFix all exist at runtime.
**Better:** Erase from production output. Keep in GIR/audit, not in executable.
- Reduces binary size, reduces attack surface.

---

## How to Support Future Hardware

### NPU (Neural Processing Unit)
```
Requirement:     deterministic, typed, no dynamic branching, fixed tensor shapes
Galerina proof:    EffectCheckerFlags.ReadyForNPU (pure + no I/O)
                 NodeFlags.TensorCandidate (Tensor<> in params/return)
                 ComputeCompatibilityFlags.FixedShape + NoDynamicBranch
Path:            GIR.tensors → TypedArray lowering → NPU kernel
```

### APU (Accelerated Processing Unit / Shared Memory)
```
Requirement:     readonly inputs, deterministic, shared memory access
Galerina proof:    NodeFlags.ReadonlyInputs + EffectCheckerFlags.ReadyForAPU
                 GIRTensorInfo.apuSharedMemoryCandidate
Path:            Pure flow + readonly Tensor<> params → APU shared memory buffer
```

### GPU
```
Requirement:     element-wise parallelizable, typed, no branching per element
Galerina proof:    GIRTensorInfo.gpuCompatible + ComputeCompatibilityFlags.TensorCompilable
Path:            GIR.tensors → WebGPU compute shader / CUDA kernel
```

### Photonic / Ternary
```
Requirement:     EffectFree + deterministic + all states handled + TriState
Galerina proof:    EffectCheckerFlags.EffectFree
                 Exhaustive match on TriState (SPORE-TYPE-021 checks this)
                 No hidden mutation (SPORE-SEC-020/021)
Path:            GIR.tensors.photonic_compatible → photonic bridge adapter
                 TriState domain type → balanced ternary encoding at backend
```

### WASM (nearest-term, highest ROI)
```
Requirement:     typed imports, linear memory, bounded execution
Galerina proof:    GIR.allowedEffectsMask → import table
                 GIR.entryPoints → WASM exports
                 PassiveExecutionPlan → WASM function body
Path:            Phase 21 target (see WASM section above)
```

---

## Security + Speed — Not a Contradiction

The false choice: "either secure OR fast." Galerina refutes this.

**Static proofs eliminate runtime overhead:**

| Overhead | Where it Goes |
|---|---|
| Capability checks | Compile-time effect proof → zero runtime check |
| Type guards | Static type system → no instanceof, no duck typing |
| Effect validation | EffectFlags bitset → one O(1) bitmask check at entry |
| Governance verification | PassiveExecutionPlan is pre-verified → runtime executes directly |
| PII checks | Value-state checker proves at compile time → no runtime wrapping |
| Null checks | Option<T> types → explicit .unwrap() with fallback |

**Memory efficiency:**
- TypedArray for tensors (Float32Array, not Array<number>) → 4 bytes/element vs 8
- Arena allocation (Phase 23): AST arena → discard after GIR; SemanticGraph arena → discard after planning
- Metadata erasure: intent strings, comments, suggestedFix not in production binary
- Compact PassiveExecutionPlan: flat array of steps vs recursive AST

**CPU efficiency:**
- Register-based bytecode VM (Phase 21): tight loop, better cache locality
- Effect bitsets: one AND instruction vs string comparison loop
- Pure flow JIT path: V8/LLVM can see the function has no I/O and optimize aggressively
- WASM SIMD for tensor operations (Phase 22): 4x–8x speedup on Float32 element-wise ops

---

## Runtime Policy Config Integration

The `galerina.runtime.policy` (or `galerina.policy`) file defines governance before any code runs:
```
boot/main → Runtime Policy Config → Package Resolver → GIR → Execution
```

Key: the Runtime Policy Config should feed into `RuntimeManifest` generation so the runtime executes from a combined manifest (flow-level proof + system-level policy).

```
flow.allowedEffectsMask & runtimePolicy.allowedEffectsMask → intersection mask
```

Only effects in BOTH the flow manifest AND the runtime policy are permitted.

---

## Roadmap

```
Phase 19:   Wire EffectFlags into capabilityHost hot path
            Replace string binding parsing with ValueStateFlags
Phase 21A:  TypedArray lowering (Tensor<Float32, [768]> → Float32Array)
            Metadata erasure from production output
Phase 21B:  Register-based bytecode VM
            Monomorphisation for pure flows
Phase 21C:  Kernel fusion for tensor pipelines
Phase 22:   WASM/WASI backend (GIR → WASM module)
            WebGPU compute shader lowering
Phase 23:   Arena allocation (AST, SemanticGraph, ExecutionPlan)
            NPU kernel emission
            APU shared-memory lowering
```
