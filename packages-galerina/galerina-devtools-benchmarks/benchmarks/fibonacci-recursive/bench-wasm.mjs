import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: 1 call to fib(20) per execution
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.spore"), 1);
}
