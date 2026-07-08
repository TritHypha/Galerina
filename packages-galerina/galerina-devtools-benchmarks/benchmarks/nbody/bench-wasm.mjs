import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: 32,768 force evaluations per main() call (force-evals/sec unit; matches runner.mjs)
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.fungi"), 32768);
}
