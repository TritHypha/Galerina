import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: 128x128 grid = 16,384 pixels per main() call (pixels/sec unit; matches runner.mjs)
export async function runWasmBenchmark() {
  return runWASMBenchmark(join(__dir, "benchmark.fungi"), 16384);
}
