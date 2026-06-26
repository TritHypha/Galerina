/**
 * gpu-compute WASM benchmark — Galerina pure flow → WAT → WebAssembly.
 *
 * This is Galerina's REAL result on this workload today: the map-reduce kernel
 * compiled to WASM and run on the CPU. It is the honest Galerina data point.
 *
 * Galerina GPU execution is NOT benchmarked here because it does not exist yet —
 * gpu-plan.ts emits a WGSL skeleton string but has no dispatch path (Phase 38).
 */
import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));

export async function runWasmBenchmark() {
  // opsPerRun: mapReduce(100000) does 100000 per-element kernel evaluations
  const base = await runWASMBenchmark(join(__dir, "benchmark.spore"), 100000);
  if (base.error) return base;
  return {
    ...base,
    device: "cpu (wasm)",
    notes: [
      ...(base.notes ?? []),
      "Galerina real result: map-reduce compiled to WASM, executed on CPU.",
      "Galerina GPU execution pending Phase 38 — no GPU number is shown (gpu-plan.ts is a stub).",
    ],
  };
}
