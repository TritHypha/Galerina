import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.spore"));
}
