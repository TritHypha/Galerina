# @galerina/devtools-benchmarks

Runtime comparison benchmarks for the Galerina language runtime. Three compute-heavy workloads run across six runtimes, measuring raw throughput and the overhead introduced by Galerina's governance and manifest verification layers.

---

## What the benchmarks measure

Each benchmark is a tight numerical loop that exercises a different mix of CPU operations:

| Benchmark | What it exercises |
|---|---|
| **compute-mix** | 2x LCG steps, 2x xorshift mix, float `sqrt`, 4-way branch. Stresses integer arithmetic, floating-point, and branch prediction together. |
| **arithmetic-threshold** | Unrolled double-step addition loop with a modular-multiply + XOR checksum. Pure integer throughput with a stopping condition. |
| **six-digit-guess** | Sequential sweep of all 6-digit codes with a full bulls-and-cows score computed per attempt. Stresses string/array comparison and loop overhead. |

All benchmarks produce a JSON result object on stdout, making them easy to pipe into the runner and compare.

---

## The six runtimes

| Runtime | What it represents |
|---|---|
| **Rust** | Native optimised binary (`rustc -O`). The ceiling for single-thread throughput on this machine. |
| **C++** | Native optimised binary (`g++ -O2 -march=native`). Comparable to Rust; shows compiler-specific tuning differences. |
| **Node.js** | V8 JIT. The baseline for "fast scripting" — well-optimised after warmup, but not native-speed. |
| **Python** | CPython interpreted. The lower-bound reference. Typically 5x–30x slower than Node.js on these workloads. |
| **Galerina (manifest)** | Galerina source compiled to an AST, effect-checked, governance-verified, then executed. The manifest layer adds static proof checks before execution begins. |
| **Galerina (governed)** | Same as manifest but the runtime enforces governance contracts continuously during execution. The strictest and most overhead-heavy mode. |

---

## How to run

### Prerequisites

- Node.js >= 18
- Python 3 (for Python benchmarks)
- `g++` or `clang++` (optional, for C++ native binaries)
- `rustc` (optional, for Rust native binaries)

### Install dependencies

```
npm install
```

### Run all benchmarks

```
npm run run
```

Runs all three benchmarks across all available runtimes and writes results to `results/latest.json`.

### Run a single benchmark

```
npm run run:compute-mix
npm run run:arithmetic
npm run run:guess
```

### Print a comparison table

```
npm run compare
```

Reads `results/latest.json` and prints a Markdown table showing throughput for each runtime and cross-runtime ratios.

### Build native binaries

```
npm run build:native
```

Compiles the C++ and Rust implementations for all three benchmarks. Skips gracefully if a compiler is not available. Binaries are placed alongside the source files in each benchmark directory.

---

## Understanding the results

The comparison table shows operations per second (or additions/attempts per second, depending on benchmark). Higher is faster.

The final column — **Node/Galerina** — shows how many times faster Node.js is compared to the Galerina governed runtime. This ratio is the primary signal for Galerina runtime optimisation work.

Typical result shape on a mid-range desktop:

- Rust and C++ are 2x–5x faster than Node.js
- Node.js is 10x–40x faster than Python
- Galerina (manifest) is slower than Node.js due to parse + effect-check overhead per run
- Galerina (governed) is slower still due to continuous contract enforcement during execution

All three workloads are designed so the algorithm is identical across all runtimes. Checksum fields let you verify correctness — matching checksums across runtimes confirm the implementations are equivalent.

---

## The governance overhead story

Galerina's governed runtime deliberately trades throughput for safety guarantees:

**Manifest mode** adds a static pre-flight phase before execution:
- Parse the `.spore` source and build an AST
- Run the effect checker to classify all side-effects
- Run the governance verifier to confirm the program meets its declared contracts
- Then execute

**Governed mode** adds continuous enforcement:
- All of the above, plus
- Runtime capability checks at each effect boundary
- Audit-log emission for every governed operation
- Rate-limit enforcement if declared in the flow contract

This overhead is intentional. Galerina programs operating under governance get proofs that would otherwise require external audit tools.

The benchmark numbers make the cost of that guarantee visible: if Galerina governed runs at 1/20th of Node.js throughput, that gap is the price of continuous governance enforcement on this hardware.

---

## Phase 25: closing the gap with WASM

The current Galerina runtime is a tree-walking interpreter running inside Node.js. Phase 25 of the Galerina roadmap introduces a WASM compilation target:

1. The Galerina compiler emits a WebAssembly module from the typed, effect-annotated AST.
2. Governance checks are compiled into the WASM binary itself as inline assertions rather than interpreted checks.
3. The WASM module runs under Node.js's built-in V8 WASM JIT.

Expected outcome: the Node/Galerina ratio should fall from ~10x–20x toward ~2x–3x for compute-bound workloads. Governance overhead becomes a static compile-time cost rather than a per-operation interpreted cost.

A new runtime column — **Galerina (wasm)** — will be added to the benchmark suite when Phase 25 lands. The `results/latest.json` schema is forward-compatible: the runner skips any runtime whose binary or module is not present.

---

## File layout

```
benchmarks/
  compute-mix/
    node.mjs          Node.js ESM benchmark
    python.py         Python benchmark
    bench.cpp         C++ source
    bench.rs          Rust source
    benchmark.spore     Galerina source
  arithmetic-threshold/
    node.mjs
    python.py
    bench.cpp
    bench.rs
    benchmark.spore
  six-digit-guess/
    node.mjs
    python.py
    bench.cpp
    bench.rs
    benchmark.spore
src/
  runner.mjs          Orchestration — runs all runtimes, writes results/latest.json
  compare.mjs         Reads results/latest.json, prints Markdown comparison table
  build-native.mjs    Compiles C++ and Rust binaries
  galerina-runner.mjs   Galerina interpreter bridge
results/
  latest.json         Written by npm run run (gitignored except .gitkeep)
```
