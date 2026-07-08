import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: hanoi(16) = 2^16 - 1 = 65,535 moves per main() call (matches runner.mjs galerinaOpsPerRun)
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.fungi"), 65535);
}
