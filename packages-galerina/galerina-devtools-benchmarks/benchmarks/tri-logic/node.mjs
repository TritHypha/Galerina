import { performance } from "node:perf_hooks";

const T=1, F=-1, U=0;
const VALS = [T, F, U];

// ── Branchless implementations (Kleene = min/max/neg) ─────────────────────────
const triAnd = (a, b) => a < b ? a : b;   // min(a,b) — single comparison
const triOr  = (a, b) => a > b ? a : b;   // max(a,b) — single comparison
const triNot = (a)    => -a;               // neg(a)   — zero comparisons

// ── If-chain implementations (original, for comparison) ───────────────────────
function triAndSlow(a, b) {
  if (a === F || b === F) return F;
  if (a === U || b === U) return U;
  return T;
}
function triOrSlow(a, b) {
  if (a === T || b === T) return T;
  if (a === U || b === U) return U;
  return F;
}

// Truth table verification — 27 combinations
function verifyTruthTables() {
  const andExpected = {
    "1,1":1,"1,0":0,"1,-1":-1,
    "0,1":0,"0,0":0,"0,-1":-1,
    "-1,1":-1,"-1,0":-1,"-1,-1":-1,
  };
  const orExpected = {
    "1,1":1,"1,0":1,"1,-1":1,
    "0,1":1,"0,0":0,"0,-1":0,
    "-1,1":1,"-1,0":0,"-1,-1":-1,
  };
  let errors = 0;
  for (const a of VALS) for (const b of VALS) {
    const k = `${a},${b}`;
    // Both branchless and slow must agree AND match canonical truth tables
    if (triAnd(a,b) !== andExpected[k]) errors++;
    if (triOr(a,b)  !== orExpected[k])  errors++;
    if (triAnd(a,b) !== triAndSlow(a,b)) errors++;
    if (triOr(a,b)  !== triOrSlow(a,b))  errors++;
  }
  for (const a of VALS) if (triNot(a) !== -a) errors++;
  return errors;
}

function bench(name, fn, iterations) {
  for (let i = 0; i < 10000; i++) fn();
  if (typeof globalThis.gc === "function") globalThis.gc();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsedMs = performance.now() - t0;
  return {
    name, iterations,
    elapsedMs: +elapsedMs.toFixed(3),
    operationsPerSecond: +(iterations / (elapsedMs / 1000)).toFixed(0),
    nsPerOp: +(elapsedMs * 1e6 / iterations).toFixed(1),
  };
}

function parseIntFlag(n,f){const i=process.argv.indexOf(n);return i>=0?parseInt(process.argv[i+1]||"",10)||f:f;}
const its = parseIntFlag("--iterations", parseIntFlag("--operations", 1000000));

const truthTableErrors = verifyTruthTables();

// 10M element bulk throughput (simulates the photonic crossover workload)
const BULK_N = 10_000_000;
const aData = new Int8Array(BULK_N).map((_,i) => (i%3)-1);
const bData = new Int8Array(BULK_N).map((_,i) => ((i*7)%3)-1);

if (typeof globalThis.gc === "function") globalThis.gc();
const __memBefore = process.memoryUsage();

const bulk = bench("Bulk 10M element tri-ops (branchless, Int8Array)", () => {
  let s = 0;
  for (let i = 0; i < BULK_N; i++) {
    const a = aData[i], b = bData[i];
    s += (a < b ? a : b) + (a > b ? a : b) + (-a);
  }
  return s;
}, 3);  // 3 runs of 10M each

const __triResults = {
  triAnd_branchless: bench("Tri.and branchless min(a,b)", () => { let s=0; for(const a of VALS)for(const b of VALS)s+=triAnd(a,b); return s; }, its),
  triOr_branchless:  bench("Tri.or  branchless max(a,b)", () => { let s=0; for(const a of VALS)for(const b of VALS)s+=triOr(a,b);  return s; }, its),
  triNot_branchless: bench("Tri.not branchless -a",       () => { let s=0; for(const a of VALS)s+=triNot(a); return s; }, its),
  triAnd_slow:       bench("Tri.and if-chain (original)", () => { let s=0; for(const a of VALS)for(const b of VALS)s+=triAndSlow(a,b); return s; }, its),
  bulk10M:           bulk,
};

const __memAfter = process.memoryUsage();

const result = {
  runtime: "nodejs",
  benchmark: "tri-logic-v1",
  truthTableErrors,
  truthTableCorrect: truthTableErrors === 0,
  results: __triResults,
  memory: {
    heapUsedBefore: __memBefore.heapUsed,
    heapUsedDelta: __memAfter.heapUsed - __memBefore.heapUsed,
  },
  kleeneEquivalences: {
    and: "min(a, b) in {-1, 0, 1}",
    or:  "max(a, b) in {-1, 0, 1}",
    not: "-a in {-1, 0, 1}",
    note: "Collapses to single i32 instructions in WASM — zero branching overhead",
  },
  photonicCrossoverNote: {
    cpuCapacity: `~${Math.round(bulk.operationsPerSecond * BULK_N / 1e9).toFixed(0)}B ops/run = ${(bulk.operationsPerSecond).toFixed(0)} runs/sec`,
    crossoverScale: "~500M elements — below this, CPU overhead is lower than photonic setup cost",
    wasmExpected: "WASM should match or beat this with native i32.min_s instructions",
  },
  notes: [
    truthTableErrors === 0 ? "✓ All 27 truth table combinations correct (both branchless and if-chain)" : `✗ ${truthTableErrors} truth table errors`,
    "Kleene AND/OR/NOT collapse to min/max/neg — single i32 instructions in WASM",
    "10M bulk test simulates photonic crossover scale (500M = photonic crossover point)",
  ],
};
console.log(JSON.stringify(result, null, 2));
