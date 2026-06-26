/**
 * tri-logic WASM benchmark — Kleene ternary logic via WASM compilation.
 *
 * Tri.and = min(a,b), Tri.or = max(a,b), Tri.not = -a
 * In -1/0/+1 encoding these become single i32 comparison instructions.
 * Expected: WASM should match or beat Node.js branchless implementation.
 */
import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));

export async function runWasmBenchmark() {
  // runBulkTri(100000) = 100K iterations of triAnd+triOr+triNot per call
  const base = await runWASMBenchmark(join(__dir, "benchmark.spore"), 100000);
  if (base.error) return base;
  return {
    ...base,
    kleeneNote: "WASM compiles Tri.and=min, Tri.or=max, Tri.not=neg to single i32 instructions",
    notes: [
      ...(base.notes ?? []),
      "Kleene AND = i32.min_s, OR = i32.max_s, NOT = i32.sub(0,a) in WAT",
      "Zero branching overhead — should match or beat branchless Node.js",
    ],
  };
}
