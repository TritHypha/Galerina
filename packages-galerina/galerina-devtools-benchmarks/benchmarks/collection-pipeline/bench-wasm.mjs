import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: 10,000 pipeline elements per main() call
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.spore"), 10000);
}
