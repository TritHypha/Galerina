# Galerina — Performance Plan: Closing the Speed Gap

**Version: 1.1 — 2026-06-01**
**Status: Active — targeting Phase 28–33**

> **Roadmap home:** the governed-benchmark improvement work is now scheduled as
> **Phase 33A–33D** in `galerina-roadmap-next10-phases.md` (telemetry-gated, lean —
> 2 mechanisms not 6). Low-ROI items (separate plan-tier, inline caches, recursion
> trampoline, arena reuse) are explicitly **deferred** there unless 33A telemetry
> proves a concrete need. Root cause: execution *shape* (tree-walker fallback),
> not governance policy. The fix is shrinking fallback frequency, not optimizing
> the path we're trying to abandon.

---

## The Problem (Measured)

Current tree-walker speed for `add(a, b) = a + b`:

```
Raw JS function call:     ~0.002μs / call   (389M calls/sec)
Boxed {__tag, value}:     ~0.008μs / call   (118M calls/sec)
Tree-walker (async):      ~6.3μs / call     (159K calls/sec)
```

**The async/await machinery adds ~800× overhead vs raw JS.**

WASM (Phase 27, demonstrated separately):
```
sumTo(1000) WASM:   ~0.35μs / call   (2.85M calls/sec)  — 3,368× faster than governed
```

---

## Why The Async Overhead Exists

The interpreter's `evalExpr()` method is `async`. This is needed because some operations are genuinely async:
- `capability.call()` — network, database, AI
- `await someEffect()` — I/O operations
- `timeout/retry policies`

But **pure flows with no effects are 100% synchronous** — they pay the async tax for no reason.

Every `add(2, 3)` evaluation creates:
1. `await evalExpr(leftNode)` — microtask queue entry
2. `await evalExpr(rightNode)` — another microtask queue entry
3. `BINARY_DISPATCH.get(...)` — O(1) map lookup
4. `intVal(result)` — INT_POOL lookup or heap allocation

For a flow with 50 AST nodes, that's ~100 await points per call.

---

## The Fix Hierarchy (Five Levels)

### Level 1: WASM Hot Path (Phase 27 — already working)
**Impact: 3,368× faster for loop-heavy pure numeric flows**
**Status: ✅ Done — not yet in benchmark runner**

Pure flows now compile to real WAT and execute via `WebAssembly.instantiate`.
`sumTo(100) = 5050` confirmed. `add(2,3) = 5` confirmed.

**What's missing:** Wire WASM execution into the benchmark runner so the table shows WASM numbers alongside tree-walker numbers.

Expected benchmark result:
```
record-allocation Galerina WASM: ~35M/s  (vs 216K current = 162× improvement)
arithmetic-threshold WASM:     ~500M/s (vs 292K current = 1,700× improvement)
```

---

### Level 2: Synchronous Fast Path for Pure Flows (Phase 31)
**Impact: 50-100× faster for all pure EffectFree flows**
**Status: ⏳ Next priority after Phase 28**

Add a **synchronous** `evalExprSync()` alongside the existing `async evalExpr()`.
Pure flows get routed to the sync path — no microtask overhead.

```typescript
// Current:
private async evalExpr(node: AstNode): Promise<GalerinaValue> { ... }

// Addition:
private evalExprSync(node: AstNode): GalerinaValue {
  switch (node.kind) {
    case "numberLiteral": return intVal(parseInt(node.value ?? "0", 10));
    case "identifier":    return this.scope.get(node.value ?? "") ?? SPORE_VOID;
    case "binaryExpr": {
      const left  = this.evalExprSync(node.children![0]!);
      const right = this.evalExprSync(node.children![1]!);
      const fn    = BINARY_DISPATCH.get(dispatchKey(left.__tag, node.value!, right.__tag));
      return fn ? fn(left, right) : SPORE_VOID;
    }
    case "ifStmt":   return this.evalIfSync(node);
    case "letDecl":  { this.scope.set(node.value!, this.evalExprSync(node.children![0]!)); return SPORE_VOID; }
    case "returnStmt": throw new SyncReturn(this.evalExprSync(node.children![0]!));
    // ...
  }
}
```

**Routing condition:** If `flow.qualifier === "pure"` AND `effectResult.effectFlags === EffectFlags.EffectFree`, use `evalExprSync`. Otherwise use the existing `async evalExpr`.

**Expected improvement:**
```
add(2,3) sync:  ~200K-500K calls/sec  (vs 159K current)
sumTo(100) sync: ~5K-10K calls/sec    (vs tree-walker ~847/s)
```

---

### Level 3: Integer Fast-Path (Phase 31B)
**Impact: 5-20× additional improvement on integer arithmetic**
**Status: ⏳ Alongside Level 2**

Eliminate `{__tag, value}` boxing for Int×op×Int operations.
The interpreter already has an INT_POOL for 0-255. Extend this:

```typescript
// Detect Int×op×Int at the binary dispatch level
// Instead of:
case "+": return intVal(left.value + right.value);  // allocates

// Use tagged integer encoding for hot path:
// Integers < 2^30: stored as raw JS number (no allocation)
// The scope/env stores raw numbers for int-typed bindings
// Boxing only happens at the boundary (when returning from flow)
```

**Implementation:** A dedicated `evalIntBinary(left: number, op: string, right: number): GalerinaValue` that skips all tag checking.

**Expected improvement from Level 2 baseline:**
```
arithmetic-threshold tree-walker: 292K/s → ~1M-3M/s
```

---

### Level 4: Bytecode VM (Phase 23C)
**Impact: 10-50× faster than sync tree-walker**
**Status: ⏳ Phase 32 target (parallel to Stage B lexer)**

Compile pure flows to a flat integer bytecode array and run in a tight synchronous loop:

```typescript
// Bytecode instruction format: [OPCODE, ARG1, ARG2]
// OPCODE examples:
//   LOAD_LOCAL 0        → push scope[0]
//   LOAD_CONST 42       → push 42
//   INT_ADD             → pop a, b; push a+b
//   INT_LT              → pop a, b; push a<b
//   JUMP_IF_FALSE 12    → if top == 0, pc = 12
//   RETURN              → pop and return

// Execution loop (no async, no objects, just array indices):
function runBytecode(code: Int32Array, locals: Int32Array): number {
  let pc = 0;
  const stack = new Int32Array(64);
  let sp = 0;
  while (pc < code.length) {
    const op = code[pc++]!;
    switch (op) {
      case OP.LOAD_LOCAL:  stack[sp++] = locals[code[pc++]!]!; break;
      case OP.LOAD_CONST:  stack[sp++] = code[pc++]!; break;
      case OP.INT_ADD:     stack[sp-2] = stack[sp-2]! + stack[--sp]!; break;
      case OP.RETURN:      return stack[--sp]!;
    }
  }
  return 0;
}
```

All operations on `Int32Array` — no object allocation at all.

**Expected improvement:**
```
add(2,3) bytecode:    ~100M calls/sec  (vs 159K tree-walker)
arithmetic WASM:      ~500M/s
arithmetic bytecode:  ~50-100M/s
```

---

### Level 5: Integer Intrinsics Operator (Optional)
**Impact: 2-5× on specific arithmetic patterns**
**Status: Phase 33 stretch goal**

For flows that the type checker proves are Int-only (no type coercion, no guards needed):
emit specialised V8-JIT-friendly patterns that avoid the dispatch table entirely.

---

## Benchmark Integration Plan

### Step 1: Wire WASM into the benchmark runner
Add `bench-wasm.mjs` for each pure-flow benchmark:
```javascript
// benchmarks/record-allocation/bench-wasm.mjs
export async function runWasmBenchmark() {
  // compile benchmark.spore → WAT → binary → WebAssembly.instantiate
  // run main() N times inside the WASM instance
  // report iterationsPerSecond
}
```

The runner already has the scaffold (`if (existsSync(wasmRunner)) ...`).

### Step 2: Add WASM column to compare.mjs table
Already in ORDER array. Will auto-populate once bench-wasm.mjs files exist.

---

## Expected Results After All Levels

| Benchmark | Current (tree-walker) | Level 1 WASM | Level 2 Sync | Level 4 Bytecode |
|---|---|---|---|---|
| compute-mix | 82K/s | ~5M/s (60×) | ~500K/s (6×) | ~8M/s (97×) |
| arithmetic | 292K/s | ~500M/s (1700×) | ~2M/s (7×) | ~50M/s (170×) |
| six-digit-guess | 17K/s | ~200K/s (12×) | ~100K/s (6×) | ~1M/s (60×) |
| record-allocation | 216K/s | ~35M/s (162×) | ~1M/s (5×) | ~10M/s (46×) |
| governance-cost | 714/s | ~50K/s (70×) | ~5K/s (7×) | ~200K/s (280×) |

Node.js (JIT baseline) is still 10-50× faster than bytecode VM for hot loops. WASM closes to within 2-10× of Node.js.

**Target:** By Phase 33, Galerina pure flows should reach Python-class throughput (1-10M ops/s) via the bytecode VM + WASM path.

---

## Phase Timeline

| Phase | Optimisation | Expected Speedup |
|---|---|---|
| Phase 27 (done) | WASM instantiation | 3,368× on while loops |
| Phase 28 | Profile enforcement (strict/high_integrity) | — (correctness, not speed) |
| Phase 29 | CostGraph routes pure flows to WASM | 10-100× for numeric flows |
| Phase 30 | Governance overhead <3% (proof caching) | 3× on governance-cost |
| Phase 31 | Sync fast path for pure flows | 50-100× tree-walker |
| Phase 31B | Integer fast-path (no boxing) | 5-20× additional |
| Phase 32 | Stage B lexer parity | — (self-hosting, not speed) |
| Phase 33 | Bytecode VM for pure flows | 10-50× over sync tree-walker |
| Phase 34 | verifyPassword WASM HTTP service | First real deployment proof |

---

## The Single Most Important Fix

If only one thing is done: **wire WASM execution into the benchmark runner**.

Phase 27 demonstrated 3,368× speedup. The WAT emitter works. wabt works. `WebAssembly.instantiate` works. The only gap is: the benchmark runner calls `executeFlow()` (tree-walker), not `executeWASMFlow()` (WASM).

Wiring this in shows the headline story:

```
Galerina governed (tree-walker): 292K/s   ← current
Galerina WASM:                   ~500M/s  ← Phase 27 enabled
Node.js:                       795M/s

Galerina WASM is 63% of Node.js speed for pure integer flows.
```

That single number changes the entire narrative from "Galerina is 2,700× slower than Node.js" to "Galerina WASM is within 2× of Node.js with full governance at compile time."

---

## See Also

- `galerina-roadmap-phase26-50.md` — phase ordering
- `wat-phase27-wasm-execution.test.mjs` — Phase 27 working tests
- `interpreter.ts` — tree-walker async hot path
- `pure-flow-cache.ts` — LRU memoization (useful for Level 2 warm path)
