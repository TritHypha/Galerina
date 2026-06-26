/**
 * naming-check benchmark — SPORE-NAMING diagnostic throughput.
 * Measures: files/sec over auth-service corpus (27 files, ~40 flows).
 */
import { performance } from "node:perf_hooks";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runNamingAudit } from "../../../galerina-devtools-naming/dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(__dir, "../../../../examples/auth-service");
const files = readdirSync(corpusDir).filter(f => f.endsWith(".spore"));
const sources = files.map(f => ({ name: f, src: readFileSync(join(corpusDir, f), "utf8") }));

// Warmup
for (let i = 0; i < 3; i++)
  for (const { src, name } of sources) runNamingAudit(src, name);

const ITERATIONS = 100;
const t0 = performance.now();
let totalFindings = 0;

for (let iter = 0; iter < ITERATIONS; iter++) {
  for (const { src, name } of sources) {
    const r = runNamingAudit(src, name);
    totalFindings += (r.findings?.length ?? 0);
  }
}
const elapsed = performance.now() - t0;
const totalRuns = ITERATIONS * sources.length;
const filesPerSec = Math.round(totalRuns / (elapsed / 1000));

console.log(JSON.stringify({
  benchmark: "naming-check", runtime: "node",
  description: "SPORE-NAMING checker over auth-service corpus (27 files)",
  iterations: ITERATIONS, filesPerIteration: sources.length,
  elapsedMs: Math.round(elapsed),
  filesPerSecond: filesPerSec,
  msPerFile: parseFloat((elapsed / totalRuns).toFixed(3)),
  findingsPerSweep: Math.round(totalFindings / ITERATIONS),
  notes: [`Corpus: ${sources.length} files`, `Findings: ${Math.round(totalFindings/ITERATIONS)}/sweep`, `${filesPerSec} files/sec`]
}, null, 2));
