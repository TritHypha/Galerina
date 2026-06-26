/**
 * intelligence-search benchmark — BM25 hybrid code search throughput.
 */
import { performance } from "node:perf_hooks";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProgram } from "../../../galerina-core-compiler/dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(__dir, "../../../../examples/auth-service");
const files = readdirSync(corpusDir).filter(f => f.endsWith(".spore"));
const sources = files.map(f => ({ name: f, src: readFileSync(join(corpusDir, f), "utf8") }));

// Build a simple in-memory BM25 index from compiler flow metadata
// (k1=1.5, b=0.75 — standard BM25 parameters)
const K1 = 1.5, B = 0.75;
function tokenize(text) {
  return text.toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(t => t.length > 1);
}

const t0 = performance.now();
const allFlows = [];
for (const { src, name } of sources) {
  const p = parseProgram(src, name);
  for (const f of p.flows) {
    allFlows.push({
      flowName: f.name, qualifier: f.qualifier, file: name,
      effects: f.declaredEffects ?? [],
      tokens: tokenize(`${f.name} ${f.qualifier} ${(f.declaredEffects??[]).join(' ')}`),
      tokenLen: 0
    });
  }
}
const avgLen = allFlows.reduce((s, f) => s + f.tokens.length, 0) / allFlows.length;
allFlows.forEach(f => f.tokenLen = f.tokens.length);

// Inverted index
const idf = new Map();
for (const f of allFlows)
  for (const t of new Set(f.tokens))
    idf.set(t, (idf.get(t) ?? 0) + 1);

function bm25(query, flows) {
  const qTokens = tokenize(query);
  return flows.map(f => {
    let score = 0;
    for (const qt of qTokens) {
      const df = idf.get(qt) ?? 0;
      if (!df) continue;
      const idfVal = Math.log((flows.length - df + 0.5) / (df + 0.5) + 1);
      const tf = f.tokens.filter(t => t === qt).length;
      const tfNorm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * f.tokenLen / avgLen));
      score += idfVal * tfNorm;
    }
    return { flowName: f.flowName, score };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}
const buildMs = performance.now() - t0;

const queries = ["verify password","audit log","database read","governance","route dispatch",
  "manifest capability","economics cost","authentication","rate limit","session token"];

// Warmup
for (const q of queries) bm25(q, allFlows);

// Benchmark
const ITERS = 5000;
const t1 = performance.now();
for (let i = 0; i < ITERS; i++) bm25(queries[i % queries.length], allFlows);
const elapsed = performance.now() - t1;

const qps = Math.round(ITERS / (elapsed / 1000));
const top = bm25("verify password", allFlows)[0]?.flowName ?? "none";

console.log(JSON.stringify({
  benchmark: "intelligence-search", runtime: "node",
  description: "BM25 code search over auth-service flows (in-memory)",
  indexBuildMs: Math.round(buildMs), indexedFlows: allFlows.length,
  searchIterations: ITERS, queriesPerSecond: qps,
  msPerQuery: parseFloat((elapsed / ITERS).toFixed(3)),
  topResultFor_verifyPassword: top, elapsedMs: Math.round(elapsed),
  notes: [`${allFlows.length} flows indexed`, `${qps} queries/sec`, `Top "verify password": ${top}`]
}, null, 2));
