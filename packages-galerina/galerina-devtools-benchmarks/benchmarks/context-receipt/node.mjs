/**
 * context-receipt benchmark — measures Context Receipt generation throughput.
 * Key metrics: receipts/sec, average token reduction %.
 */
import { performance } from "node:perf_hooks";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateReceipts } from "../../../galerina-devtools-context/dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(__dir, "../../../../examples/auth-service");

const files = readdirSync(corpusDir).filter(f => f.endsWith(".spore"));
const sources = files.map(f => ({
  name: f,
  src: readFileSync(join(corpusDir, f), "utf8"),
  path: join(corpusDir, f)
}));

// Warmup
for (let i = 0; i < 3; i++) {
  for (const { src, path } of sources) generateReceipts(src, path);
}

// Benchmark
const ITERATIONS = 50;
const t0 = performance.now();
let totalReceipts = 0;
let totalReduction = 0;
let reductionCount = 0;

for (let iter = 0; iter < ITERATIONS; iter++) {
  for (const { src, path } of sources) {
    const result = generateReceipts(src, path);
    const receipts = Array.isArray(result) ? result : (result?.receipts ?? []);
    totalReceipts += receipts.length;
    for (const r of receipts) {
      const pct = r?.tokenEstimate?.reductionPct ?? 0;
      if (pct > 0) { totalReduction += pct; reductionCount++; }
    }
  }
}
const elapsed = performance.now() - t0;

const totalRuns = ITERATIONS * sources.length;
const receiptsPerSec = Math.round((totalReceipts) / (elapsed / 1000));
const avgReduction = reductionCount > 0 ? (totalReduction / reductionCount).toFixed(1) : "0";

console.log(JSON.stringify({
  benchmark: "context-receipt",
  runtime: "node",
  description: "Context Receipt generation over auth-service corpus (27 files)",
  iterations: ITERATIONS,
  filesPerIteration: sources.length,
  receiptsPerIteration: Math.round(totalReceipts / ITERATIONS),
  elapsedMs: Math.round(elapsed),
  receiptsPerSecond: receiptsPerSec,
  msPerFile: parseFloat((elapsed / totalRuns).toFixed(3)),
  avgTokenReductionPct: parseFloat(avgReduction),
  notes: [
    `Corpus: ${sources.length} files, ${Math.round(totalReceipts / ITERATIONS)} flows`,
    `Avg token reduction: ${avgReduction}%`,
    `Receipt throughput: ${receiptsPerSec} receipts/sec`
  ]
}, null, 2));
