import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: 50,000 outer iterations per main() call (chains/sec unit; matches runner.mjs)
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.fungi"), 50000);
}
