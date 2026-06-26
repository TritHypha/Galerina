/**
 * provenance-trace benchmark — measures data lineage analysis throughput.
 * Key metrics: files/sec, flows analyzed/sec, risk detection latency.
 */
import { performance } from "node:perf_hooks";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFile, buildProvenanceGraph } from "../../../galerina-devtools-provenance/dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(__dir, "../../../../examples/auth-service");

const files = readdirSync(corpusDir).filter(f => f.endsWith(".spore"));
const sources = files.map(f => ({
  name: f,
  src: readFileSync(join(corpusDir, f), "utf8"),
  path: join(corpusDir, f)
}));

function analyze(src, path) {
  try { return analyzeFile ? analyzeFile(src, path) : buildProvenanceGraph(src, path); }
  catch { return buildProvenanceGraph(src, path); }
}

// Warmup
for (let i = 0; i < 3; i++) {
  for (const { src, path } of sources) analyze(src, path);
}

// Benchmark
const ITERATIONS = 50;
const t0 = performance.now();
let totalNodes = 0;
let totalEdges = 0;
let totalRiskFlows = 0;
let totalFlows = 0;

for (let iter = 0; iter < ITERATIONS; iter++) {
  for (const { src, path } of sources) {
    const graph = analyze(src, path);
    totalNodes += graph?.nodes?.length ?? 0;
    totalEdges += graph?.edges?.length ?? 0;
    totalRiskFlows += graph?.riskFlows?.length ?? 0;
    totalFlows += graph?.summary?.totalFlows ?? 0;
  }
}
const elapsed = performance.now() - t0;

const totalRuns = ITERATIONS * sources.length;
const filesPerSec = Math.round(totalRuns / (elapsed / 1000));
const nodesPerIter = Math.round(totalNodes / ITERATIONS);
const edgesPerIter = Math.round(totalEdges / ITERATIONS);

console.log(JSON.stringify({
  benchmark: "provenance-trace",
  runtime: "node",
  description: "Data lineage analysis over auth-service corpus (27 files)",
  iterations: ITERATIONS,
  filesPerIteration: sources.length,
  elapsedMs: Math.round(elapsed),
  filesPerSecond: filesPerSec,
  msPerFile: parseFloat((elapsed / totalRuns).toFixed(3)),
  avgNodesPerSweep: nodesPerIter,
  avgEdgesPerSweep: edgesPerIter,
  totalFlowsPerIter: Math.round(totalFlows / ITERATIONS),
  riskFlowsDetectedPerIter: Math.round(totalRiskFlows / ITERATIONS),
  notes: [
    `Corpus: ${sources.length} files, ${Math.round(totalFlows / ITERATIONS)} flows`,
    `Graph: ${nodesPerIter} nodes, ${edgesPerIter} edges per sweep`,
    `Risk flows detected: ${Math.round(totalRiskFlows / ITERATIONS)}`,
    `Throughput: ${filesPerSec} files/sec`
  ]
}, null, 2));
