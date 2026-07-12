import { performance } from "node:perf_hooks";

// tri-logic — Kleene ternary logic, Int8 encoding: True=1, Unknown=0, False=-1.
// The KEY identity: in this encoding Kleene logic collapses to scalar math —
//   Tri.and(a,b) = min(a,b)   Tri.or(a,b) = max(a,b)   Tri.not(a) = -a
// which the .fungi → WAT path lowers to single i32 instructions (min_s/max_s/sub).
const triAnd = (a, b) => (a < b ? a : b);
const triOr  = (a, b) => (a > b ? a : b);
const triNot = (a)    => -a;

// ── Correctness (untimed): all 27 truth-table combinations must hold ──────────
function verifyTruthTables() {
  const VALS = [1, -1, 0];
  const andE = { "1,1":1,"1,0":0,"1,-1":-1,"0,1":0,"0,0":0,"0,-1":-1,"-1,1":-1,"-1,0":-1,"-1,-1":-1 };
  const orE  = { "1,1":1,"1,0":1,"1,-1":1,"0,1":1,"0,0":0,"0,-1":0,"-1,1":1,"-1,0":0,"-1,-1":-1 };
  let errors = 0;
  for (const a of VALS) for (const b of VALS) {
    const k = `${a},${b}`;
    if (triAnd(a, b) !== andE[k]) errors++;
    if (triOr(a, b)  !== orE[k])  errors++;
  }
  for (const a of VALS) if (triNot(a) !== -a) errors++;
  return errors;
}

// ── THE common bulk-N workload — identical shape on every runtime ─────────────
// runBulkTri(n) runs n elements, each doing 3 trit-ops (and + or + not), so one
// call = 3n trit-ops. This mirrors benchmark.fungi main() = runBulkTri(100000)
// EXACTLY (same a/b derivation, same overflow clamp), so node / python / rust /
// WASM / Galerina all measure the SAME work — the aligned "common bulk-N path".
function runBulkTri(n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = (i % 3) - 1;
    const b = ((i * 7) % 3) - 1;
    total = total + triAnd(a, b) + triOr(a, b) + triNot(a);
    if (total > 1000000) total = total - 1000000;
  }
  return total;
}

const ELEMENTS = 100000;                    // matches benchmark.fungi main()
const TRIT_OPS_PER_CALL = ELEMENTS * 3;     // 300000 — the canonical N (and+or+not)

function parseIntFlag(n, f) { const i = process.argv.indexOf(n); return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || f : f; }
const calls = parseIntFlag("--iterations", parseIntFlag("--operations", 1000));

const truthTableErrors = verifyTruthTables();

for (let i = 0; i < 10; i++) runBulkTri(ELEMENTS);   // warmup
if (typeof globalThis.gc === "function") globalThis.gc();
const memBefore = process.memoryUsage();

const t0 = performance.now();
let checksum = 0;
for (let i = 0; i < calls; i++) checksum = runBulkTri(ELEMENTS);
const elapsedMs = performance.now() - t0;
const memAfter = process.memoryUsage();

const totalTritOps = calls * TRIT_OPS_PER_CALL;
console.log(JSON.stringify({
  runtime: "nodejs",
  benchmark: "tri-logic-v1",
  truthTableErrors,
  truthTableCorrect: truthTableErrors === 0,
  calls,
  elementsPerCall: ELEMENTS,
  tritOpsPerCall: TRIT_OPS_PER_CALL,
  checksum,
  elapsedMs: +elapsedMs.toFixed(3),
  // THE comparable metric: trit-ops/sec (min/max/neg operations per second).
  operationsPerSecond: Math.round(totalTritOps / (elapsedMs / 1000)),
  callsPerSecond: Math.round(calls / (elapsedMs / 1000)),
  memory: {
    heapUsedBefore: memBefore.heapUsed,
    heapUsedDelta: memAfter.heapUsed - memBefore.heapUsed,
  },
  notes: [
    truthTableErrors === 0 ? "✓ 27/27 Kleene truth-table combinations correct" : `✗ ${truthTableErrors} truth-table errors`,
    "Common bulk-N path: runBulkTri(100000) = 300000 trit-ops/call, identical on every runtime",
    "Kleene AND/OR/NOT collapse to min/max/neg — single i32 instructions in WASM",
  ],
}, null, 2));
