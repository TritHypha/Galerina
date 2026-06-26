// GateCache micro-benchmark (#194).
//
// Measures the standalone win GateCache provides: compiling the same ai{} governance
// policy COLD (recompile every time) vs CACHED (compile once, then HIT).
//
// ⚠️ GateCache is an OPT-IN utility — createHybridEngine deliberately does NOT use it: the engine
// compiles via the branchless `compilePolicy` (#140), because GateCache's content-hash key was
// ~38× slower (measured, reverted). This bench measures GateCache's own cold-vs-cached delta, NOT
// the engine's hot path.
//
// This is a CONSTRUCTION-TIME optimisation for the "many engines, one policy"
// pattern (per-request engines / warm pools). It does NOT cache the allow/deny
// DECISION — that is recomputed fresh per request (semantic-drift-safe).
//
// Run: node packages-galerina/galerina-devtools-benchmarks/benchmarks/gate-cache/bench.mjs
import { performance } from "node:perf_hooks";
import {
  compilePolicy, compilePolicyCached, GateCache,
} from "../../../galerina-tower-citizen/dist/index.js";

const gov = {
  approvedModels: ["gpt-x", "claude-y", "llama-z"],
  maxModelCalls: 10, maxNewTokens: 512, maxTokenCost: "GBP0.10",
  denyHostNativeFallback: true,
};
const N = 200_000;

function timeIt(fn) {
  fn(); // warm
  const t0 = performance.now();
  for (let i = 0; i < N; i++) fn();
  const ms = performance.now() - t0;
  return { ms: Number(ms.toFixed(2)), opsPerSec: Math.round(N / (ms / 1000)) };
}

// COLD: recompile the policy on every call (pre-GateCache behaviour).
const cold = timeIt(() => compilePolicy(gov, false));
// CACHED: GateCache — 1 miss then HITs (the opt-in utility; NOT what createHybridEngine uses).
const cache = new GateCache();
const cached = timeIt(() => cache.compile(gov, false));
// Module-level default cache (opt-in; not wired into the engine).
const wired = timeIt(() => compilePolicyCached(gov, false));

const speedup = cached.opsPerSec / cold.opsPerSec;
const result = {
  benchmark: "gate-cache",
  description: "Compiled ai{} governance policy: COLD recompile vs GateCache HIT (#194). The DECISION is never cached.",
  iterations: N,
  results: { cold, cached, wired_default_cache: wired },
  speedup: Number(speedup.toFixed(1)),
  cacheStats: cache.stats(),
  notes: [
    `COLD recompile:    ${cold.opsPerSec.toLocaleString()} compiles/sec`,
    `GateCache HIT:     ${cached.opsPerSec.toLocaleString()} lookups/sec`,
    `GateCache is ~${speedup.toFixed(1)}x faster for repeated same-policy compilation`,
    `Decision is NOT cached — recomputed fresh per request`,
    `Win applies to the "many engines / one policy" pattern (per-request engines, warm pools)`,
  ],
};
console.log(JSON.stringify(result, null, 2));
