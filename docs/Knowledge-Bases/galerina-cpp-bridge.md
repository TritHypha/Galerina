# Galerina — C++ Bridge & Transpilation Framework

**Status: DESIGN PROPOSAL (2026-06-03)**
Package `galerina-ext-bridge-cpp` does not yet exist. This document records the intended design so
it can be built incrementally without re-deriving it. No source code is touched by this document.

**Auto-by-default note:** contract blocks auto-synthesized during transpilation (see §4) follow the
same dual-mode pattern as `economics {}` and `secrets {}` — they are compiler-inferred defaults,
not developer obligations. See `galerina-contract-economics.md` and
`galerina-design-secrets-epilogue-blocks.md` for the canonical description of auto-by-default
governance blocks.

---

## 1. Purpose

`galerina-ext-bridge-cpp` is a **non-core devtools package** whose goal is to validate that
Galerina can express the same low-level semantics as C++ without sacrificing safety or governance.
It does this in two directions:

- **Inward (transpile C++ → Galerina):** parse C++ source and emit equivalent governed `.spore` flows,
  injecting appropriate contracts automatically.
- **Outward (verify equivalence):** run side-by-side benchmarks between clang -O3 output and Galerina
  WASM Phase 27 output to confirm that zero-cost-abstraction promises hold numerically.

The package is intentionally non-core. Its Clang dependency, equivalence harness, and benchmark
runner would bloat the compiler runtime for the majority of Galerina workloads that never touch C++.
It sits at the same tier as `galerina-ext-secrets-vault` and `galerina-ext-proof-snarkjs`: optional,
injected at the project level, invisible to pure Galerina consumers.

---

## 2. Package Layout

```
galerina-ext-bridge-cpp/
  src/
    parser/         # C++ AST ingestion — Phase 2 requires Clang; Phase 1 is pattern-match only
    transformer/    # Maps C++ constructs to Galerina IR nodes
    emitter/        # Serializes IR nodes to .spore source text
    contracts/      # Auto-synthesis of contract {} blocks from detected C++ patterns
  tests/
    unit/           # Per-mapping unit tests (RAII → linear let, pointer → Array<Int32>, …)
    equivalence/    # Side-by-side C++ vs Galerina output comparisons
  benchmarks/
    runner.ts       # Orchestrates clang -O3 compilation + Galerina WASM Phase 27 emission
    compare.ts      # Numeric diff of outputs, timing, and IR size
  README.md
```

The `parser/` directory has two implementation tracks:

- **Phase 1 (pattern-match):** regex + heuristic scanning of C++ source text. No Clang dependency.
  Handles the common 80% of idiomatic C++ (RAII constructors, raw pointer dereferences, `new`/
  `delete`, simple template instantiations).
- **Phase 2 (Clang AST ingestion):** uses `libclang` or the Clang TypeScript bindings to walk the
  full AST. Required for templates with non-trivial specialization, macro expansion, and implicit
  conversions.

---

## 3. Core C++ → Galerina Mappings

### 3.1 RAII / Stack Allocation → Linear Scoped `let` Binding

C++ RAII ties object lifetime to lexical scope via constructor/destructor pairs. Galerina expresses
the same guarantee with a **linear scoped `let` binding** — a binding that lives for exactly the
enclosing block and is automatically reclaimed at block exit (a "self-terminating memory lane").

```cpp
// C++
{
    FileHandle fh("data.bin");
    process(fh);
}  // fh.~FileHandle() called here — guaranteed
```

```galerina
// Galerina equivalent
let fh: FileHandle = FileHandle.open("data.bin")
process(fh)
// fh reclaimed at end of enclosing block — no explicit destructor needed
```

The transformer detects constructor-in-scope-with-matching-destructor patterns and emits a scoped
`let`. If the C++ destructor contains non-trivial logic (logging, network flush), the transformer
emits a `flow_finalizer` block — see `flow-finalizer-and-cleanup.md`.

### 3.2 Raw Pointer Arithmetic → Typed `Array<Int32>` with Bound-Checked Offsets

C++ pointer arithmetic is unsafe by construction: `ptr + n` produces undefined behaviour if `n`
takes the pointer out of the allocated region. Galerina replaces this with **typed array access
with compile-time and runtime bound checking**.

```cpp
// C++
int32_t* buf = malloc(64 * sizeof(int32_t));
buf[42] = 99;   // safe if 42 < 64; UB if not
```

```galerina
// Galerina equivalent
let buf: Array<Int32> = Array.allocate(64)
buf[42] = 99    // compile-time or runtime bounds check; SPORE-BOUND-* error on violation
```

The transformer maps `T*` to `Array<T>` and rewrites `ptr + offset` dereferences to indexed
access. Where the offset is a compile-time constant that exceeds the declared capacity, the
emitter flags a compile-time error. Where it is runtime-dynamic, the emitter inserts a bounds
guard that raises a governed error rather than producing undefined behaviour.

### 3.3 Zero-Cost Abstractions → WASM Phase 27 Output

C++'s zero-cost abstraction promise: high-level constructs (iterators, ranges, `std::function`,
`constexpr`) compile to machine code indistinguishable from hand-written assembly at `-O3`.

Galerina's equivalent claim is that **WASM Phase 27 output** (the highest optimization tier in
Galerina's emission pipeline, targeting the WASM Component Model + SIMD extensions) produces
machine code of comparable density to clang `-O3` for the same algorithm expressed in Galerina.

The equivalence test runner (see §5) validates this claim empirically. The transformer does not
attempt to replicate C++-specific optimizations; it emits semantically correct Galerina and trusts
the WASM Phase 27 pipeline to optimize. Where a specific C++ template produces a known hot path
(e.g. `std::sort` → introsort), the transformer may emit a hint annotation that the Galerina
runtime can use to select an equivalent primitive.

### 3.4 Manual Heap Management → Galerina SoA Arena + Automatic GIR Lowering

C++ manual heap management (`new`/`delete`, allocators, placement new) requires the programmer
to track ownership explicitly. Galerina replaces this with **Structure-of-Arrays (SoA) arenas** —
contiguous, type-homogeneous memory regions — that are allocated once per logical boundary and
freed atomically when the boundary exits.

```cpp
// C++
Particle* particles = new Particle[N];
simulate(particles, N);
delete[] particles;
```

```galerina
// Galerina equivalent — arena allocated, GIR-lowered to SoA layout
let particles: Array<Particle> = Array.arena(N)
simulate(particles)
// arena freed at boundary exit — no explicit delete
```

The transformer maps `new T[N]` to `Array.arena(N)` and `delete[]` to a no-op (the arena
lifecycle is governed by the enclosing boundary, not the call site). The GIR (Governed
Intermediate Representation — see `neutral-governed-ir.md`) lowering phase then converts
`Array<Particle>` to SoA layout automatically for cache efficiency, matching the access pattern
C++ programmers achieve manually via `std::vector<float> x, y, z`.

---

## 4. Contract Synthesis During Transpilation

When the transformer emits a `.spore` file from C++ source, it **auto-injects a `contract {}`
block** derived from patterns detected in the C++ code. The developer is not expected to write
this block manually — it is a transpilation artifact. The same auto-by-default principle that
governs `economics {}` applies here: the synthesized contract is a conservative default that
the developer may override by editing the emitted `.spore`.

A minimal synthesized contract for a C++ file with hardware access patterns:

```galerina
contract {
  intent { "Transpiled from C++ — auto-synthesized contract. Review before production use." }
  target {
    preferred_execution hardware
    cyber_physical_hardening {
      // populated only if C++ source contained hardware register access or DMA patterns
    }
  }
  economics {
    // populated from detected allocation and loop-iteration budgets
  }
}
```

The `target { preferred_execution hardware }` directive is emitted whenever the C++ source
contains:
- Direct memory-mapped I/O (`volatile` pointer dereferences)
- Inline assembly (`__asm__`, `asm volatile`)
- Platform intrinsics (`_mm256_*`, `__builtin_ia32_*`)
- `mmap` / `mprotect` system calls

For C++ that is purely computational (no hardware access, no syscalls), the contract omits the
`target {}` block and defers entirely to the ValueGraph auto-inference layer.

---

## 5. Equivalence Test Runner

The equivalence runner validates the zero-cost-abstraction claim (§3.3) empirically. For each
test case in `tests/equivalence/`, it:

1. Compiles the C++ reference file with `clang -O3 -std=c++20 -o ref.wasm --target=wasm32`.
2. Transpiles the same algorithm via the bridge transformer to a `.spore` file.
3. Compiles the `.spore` file at WASM Phase 27.
4. Runs both WASM modules on an identical input vector and asserts:
   - **Numeric equivalence:** outputs match to within a configurable ULP tolerance.
   - **Performance parity:** Galerina execution time is within a configurable threshold (default:
     ≤ 1.5× the C++ time; target: ≤ 1.1× for production certification).
   - **IR size parity:** WASM module byte count is within 2× of the C++ reference.

Test cases ship in three tiers:
- `tier-1/` — trivial (RAII, single pointer, simple loop): must pass at ≤ 1.0× C++ time.
- `tier-2/` — medium (arena allocations, template algorithms): must pass at ≤ 1.2× C++ time.
- `tier-3/` — complex (SIMD intrinsics, parallel DMA patterns): best-effort; failures are logged
  as known gaps rather than blocking CI.

---

## 6. Build Order Recommendation

| Phase | Work | Clang required? | Effort |
|-------|------|-----------------|--------|
| 1 | Pattern-match transformer (no Clang dep) | No | Low |
| 2 | Equivalence test runner (WASM Phase 27 + clang -O3) | Yes (clang only) | Medium |
| 3 | Full Clang AST ingestion via libclang | Yes | High |
| 4 | Contract synthesis for hardware-access patterns | No | Low |
| 5 | SoA arena GIR lowering integration | No | Medium |

Phase 1 can begin immediately using the existing Galerina Stage-A compiler and a simple regex-based
C++ scanner. Phases 2–5 depend on Phase 1's transformer IR being stable.

---

## 7. Package Boundary

`galerina-ext-bridge-cpp` is **non-core**. It must not be imported by:
- `galerina-core-compiler` (no Clang dep in the core compiler)
- `galerina-core-runtime`
- `galerina-core-stdlib`

It may import from `galerina-core-compiler` (to emit GIR nodes) and from `galerina-core-stdlib`
(for `Array<T>`, `FileHandle`, etc. type references). The package registers itself via the same
`ProverBackend`-style plug-in injection pattern used by `galerina-ext-proof-snarkjs` — the core
never takes a hard dependency on the bridge.

---

## 8. Related Documents

- `galerina-contract-economics.md` — auto-by-default dual-mode contract blocks (same pattern used
  for transpilation-synthesized contracts)
- `galerina-design-secrets-epilogue-blocks.md` — `secrets {}` and `epilogue {}` blocks; dual-mode
  governance pattern this package inherits
- `neutral-governed-ir.md` — GIR lowering that the transformer emits into
- `galerina-zk-proof-plan.md` — `ProverBackend` plug-in injection pattern (same architecture used
  for bridge package registration)
- `galerina-asic-cyber-physical.md` — hardware target contracts synthesized for C++ hardware-access
  patterns (§4)
- `memory-pressure-security.md` — arena allocation safety model
- `flow-finalizer-and-cleanup.md` — `flow_finalizer` block used for non-trivial C++ destructors
