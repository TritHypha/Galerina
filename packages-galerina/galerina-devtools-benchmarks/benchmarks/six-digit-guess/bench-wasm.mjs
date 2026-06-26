import { runWASMBenchmark } from "../../src/wasm-runner.mjs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
// opsPerRun: auto-extract from result value (number of attempts = 42069)
export async function runWasmBenchmark() {
  const r = await runWASMBenchmark(join(__dir, "benchmark.spore"), null);
  if (!r.error && r.result?.__tag === "int") {
    const opsPerRun = r.result.value;
    r.iterationsPerSecond = r.callsPerSecond * opsPerRun;
  }
  return r;
}
