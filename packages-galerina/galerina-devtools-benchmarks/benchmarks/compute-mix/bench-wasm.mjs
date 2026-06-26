import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: main() runs exactly 50,000 iterations per call
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.spore"), 50000);
}
