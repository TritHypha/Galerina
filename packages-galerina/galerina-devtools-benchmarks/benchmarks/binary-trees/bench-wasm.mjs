import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: minDepth 4 -> maxDepth 10 = 135,854 nodes per main() call (nodes/sec unit; matches runner.mjs)
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.fungi"), 135854);
}
