/**
 * low-memory WASM benchmark — measures heap allocation per operation.
 *
 * WASM execution uses Int32Array (no JS object allocation).
 * Expected bytes/op: ~0 (the key comparison point vs tree-walker).
 */
import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));

export async function runWasmBenchmark() {
  // opsPerRun: processStream(10000) does 10000 inner iterations per call
  const base = await runWASMBenchmark(join(__dir, "benchmark.spore"), 10000);
  if (base.error) return base;

  // Add bytes-per-operation metric — WASM should be ~0
  const totalOps = (base.calls ?? 1) * 10000;
  const heapDelta = base.memory?.heapUsedDelta ?? 0;
  const bytesPerOp = totalOps > 0 ? heapDelta / totalOps : 0;

  return {
    ...base,
    memory: {
      ...base.memory,
      bytesPerOperation: Number(bytesPerOp.toFixed(2)),
    },
    notes: [
      ...(base.notes ?? []),
      `Bytes/op: ${bytesPerOp.toFixed(2)} (target: ~0 — WASM Int32Array, no JS object boxing)`,
    ],
  };
}
