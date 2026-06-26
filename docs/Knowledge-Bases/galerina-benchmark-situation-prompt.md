# Galerina Benchmark Situation — Full Context Prompt

## What Galerina Is

Galerina is a governance-first programming language. Every flow declares its effects, capabilities, and contracts before execution. The compiler proves these at compile time; the runtime enforces them. The current runtime is a tree-walking interpreter written in TypeScript, running on Node.js.

The three-way benchmark comparison (Node.js / Python / Galerina) is intended to show:
- Where native runtimes are without governance
- Where Galerina currently is with governance (tree-walker overhead)
- Where Galerina should get to (WASM + bytecode VM)

---

## Current Benchmark Setup

Three benchmarks exist in `packages-galerina/galerina-devtools-benchmarks/benchmarks/`:

### 1. compute-mix (lcg2x-xorshift2x-sqrt-4branch)
Per operation: 2× LCG step, 2× xorshift mix, float sqrt, 4-way branch.
Run for 30 seconds. Measures operations per second.

### 2. arithmetic-threshold
Counter loop: `total += i` × 2 per cycle + imul+XOR checksum, until `total > 2×10^14`.
Measures additions per second.

### 3. six-digit-guess
Sequential brute-force search for 6-digit code "042069" with Wordle-style bulls+cows scoring.
2M max attempts. Measures attempts per second.

---

## Last Benchmark Results (may be affected by thermal throttling)

| Benchmark | Node.js | Python | Galerina manifest | Galerina governed | Node÷Galerina |
|---|---|---|---|---|---|
| compute-mix | 125.84M/s | 1.32M/s | 12/s | 10/s | ~12.6M× |
| arithmetic-threshold | 809.15M/s | 6.48M/s | 228/s | 222/s | ~3.6M× |
| six-digit-guess | 2.50M/s | 59.4K/s | 14/s | 13/s | ~192K× |

**Memory (RSS):** Node.js 38–46MB, Galerina 58–60MB (~20MB overhead = compiler loaded in process)
**Heap delta:** Galerina arithmetic +1.7MB per run (tree-walker allocation pressure from boxing)

---

## Why the Results Are Unreliable

### Problem 1: Galerina benchmarks measure the wrong thing

The `.spore` benchmark files use `Time.nowMs()` to control the timed loop:
```galerina
while Time.nowMs() - startedAt < targetMs {
  // ... operations ...
}
```

`Time.nowMs()` is NOT properly implemented in the Galerina stdlib interpreter. It likely returns 0 or a stub value. This means:
- The `while` condition is false immediately (0 - 0 < 30000 may evaluate incorrectly)
- The inner loop executes 0 or very few iterations
- Galerina "completes" the benchmark almost instantly
- The reported metric (`runsPerSecond`) is just `1000 / execMs` — how many times per second the interpreter can *call* the flow, not how many *benchmark operations* it performs

**Node.js and Python use wall-clock timing correctly. Galerina does not. The comparison is not apples-to-apples.**

### Problem 2: Manifest fast-path not deeply wired

Galerina (manifest) should be noticeably faster than Galerina (governed) because Phase R6 was supposed to skip ContractEnforcer and CapabilityHost setup. But the difference is tiny:
- compute-mix: 12/s vs 10/s
- arithmetic-threshold: 228/s vs 222/s

The `manifest` parameter was added to `executeFlow()` signature, but the core execution loop still traverses the same paths. The governance skip is not meaningful yet.

### Problem 3: Thermal throttling on current machine

The 30-second sustained compute-mix benchmark triggered thermal throttling. Node.js results varied slightly across runs (115M/s vs 125M/s). Results on a cooler machine will be more stable.

---

## What Needs to be Fixed

### Fix 1: Implement Time.nowMs() in stdlib

In `packages-galerina/galerina-core-compiler/src/stdlib.ts`, find the `Time` module handling and implement:

```typescript
case "Time.nowMs":
case "nowMs": {
  if (receiver === "Time") {
    return { __tag: "float", value: performance.now() };
  }
  break;
}
```

This requires importing `performance` from `node:perf_hooks` at the top of stdlib.ts:
```typescript
import { performance } from "node:perf_hooks";
```

Without this, the entire timed benchmark loop never executes in Galerina.

### Fix 2: Create fixed-iteration Galerina benchmarks

As a parallel approach that doesn't depend on Time.nowMs(), create Galerina benchmark flows that use a fixed iteration count instead of a time limit:

```galerina
pure flow runComputeMixFixed(iterations: Int) -> ComputeMixResult
contract { effects {} }
{
  mut seed: UInt32 = 123_456_789
  mut checksum: UInt32 = 0
  mut i: Int = 0
  while i < iterations {
    seed = seed * 1_664_525 + 1_013_904_223
    // ... rest of algorithm ...
    i = i + 1
  }
  return ComputeMixResult { checksum: checksum, operations: i }
}
```

This lets the benchmark runner time Galerina separately and extrapolate ops/second.

### Fix 3: Re-run on a cooler machine

Run the Node.js and Python benchmarks on a machine that isn't thermally throttled. Use shorter duration (10s instead of 30s) for the thermal run to avoid throttle onset.

### Fix 4: Deep-wire manifest fast-path

In `interpreter.ts`, when `manifest.verified === true`, genuinely skip:
- `createContractEnforcer()` call
- `createCapabilityHost()` call  
- Audit trail initialization
- All governance checks (use manifest.allowedEffects instead)

Expected result: manifest should be ~2-5× faster than governed for pure flows.

---

## Speed Improvements Already Implemented

These improvements were added in the last session and ARE working:

### Integer fast path
Pre-cached INT_POOL for values 0-255. Singleton BOOL_TRUE/BOOL_FALSE. fastIntOp() short-circuit for Int+Int operations. Effect: arithmetic-threshold improved from 130/s to 222/s (+70%).

### Pure flow contract erasure  
Pure flows with EffectCheckerFlags.EffectFree skip ContractEnforcer setup. Arithmetic governed showed 0ms CPU time (below resolution) - execution so fast the 15ms Windows CPU timer can't measure it.

### SoA NodeArena
`SoANodeArena` with parallel Int16Array/Int32Array for kinds, flags, typeIds, effectMasks. Enables future linear-scan passes instead of recursive tree walks.

### Fused single-pass compiler skeleton
`fusedCompile()` function: source → inline token recognition → inline type check → direct GIR opcode emission. Verified working: emits PURE_ENTER(0x70)/PURE_EXIT(0x71) opcodes for pure flows.

### Flat Int32Array token stream
`toFlatTokenStream()` converts Token[] to stride-4 Int32 layout for future SIMD-friendly parser passes.

---

## Recommended Action Plan

### Immediate (re-run):
1. Run on cooler machine (less thermal throttling)
2. Use `--operations N` flag instead of `--target-ms 30000` to avoid sustained CPU heat
3. Compare: `node node.mjs --operations 100000000` (Node.js), `python3 python.py --operations 100000000` (Python)

### Short term (before next benchmark):
1. Implement `Time.nowMs()` in Galerina stdlib
2. Create fixed-iteration `.spore` benchmark variants
3. Deep-wire manifest fast-path in executeFlow()

### Medium term (next phases):
1. Bytecode VM (Phase 23C) — expected 100-500× improvement over tree-walker
2. Integer slot arrays replacing Map<string, GalerinaValue> — expected 5-10×
3. WASM compilation (Phase 25) — expected 1,000-10,000× for pure flows

---

## Expected Results After Fixes

| Benchmark | Current Galerina | After Time.nowMs fix | After Bytecode VM | After WASM |
|---|---|---|---|---|
| compute-mix | ~10/s (broken) | ~500/s (real data) | ~50K/s | ~10M/s |
| arithmetic-threshold | ~225/s | ~1K/s (real) | ~100K/s | ~100M/s |
| six-digit-guess | ~13/s (broken) | ~200/s (real) | ~20K/s | ~1M/s |

---

## File Locations

```
Benchmarks:
  packages-galerina/galerina-devtools-benchmarks/
    benchmarks/compute-mix/      node.mjs, python.py, benchmark.spore, bench.cpp, bench.rs
    benchmarks/arithmetic-threshold/   same
    benchmarks/six-digit-guess/        same
    src/runner.mjs               runs all runtimes, captures memory+CPU
    src/compare.mjs              generates markdown report
    src/galerina-runner.mjs        Galerina interpreter bridge
    results/latest.json          last run results

Interpreter:
  packages-galerina/galerina-core-compiler/src/interpreter.ts
  packages-galerina/galerina-core-compiler/src/stdlib.ts        ← needs Time.nowMs()

Speed improvements (already implemented):
  src/soa-arena.ts               SoA NodeArena
  src/flat-token-stream.ts       Int32Array token layout
  src/fused-pass.ts              Single-pass compiler skeleton
```

---

## Key Principle

> The benchmark gap is not evidence Galerina is wrong. It's evidence the tree-walker
> is the bottleneck, not the governance model. When WASM compilation lands,
> pure flows (no effects, no governance overhead) should reach near-Python speeds.
> Governed flows will be slower than ungoverned — that's the cost of the audit trail.
> The question is whether that cost is acceptable. For healthcare, finance, and AI
> workloads, it almost certainly is.
