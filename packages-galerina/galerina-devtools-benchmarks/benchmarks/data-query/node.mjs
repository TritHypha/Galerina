import { performance } from "node:perf_hooks";

// data-query — SQL-like filter + group-by over a synthetic record stream.
//
// THE common bulk-N workload — identical shape on every runtime. scanRecords(n)
// does ONE pass over n records; each record is a WHERE test (amount > threshold)
// plus a GROUP BY category count, so one call = n record-scans. This mirrors
// benchmark.fungi main() = scanRecords(10000, 3000) EXACTLY (same arithmetic
// derivation of amount/category), so node / python / Galerina all measure the
// SAME work — the aligned "common bulk-N path".
//
// The integer core here is the WASM/interp-COMPARABLE throughput; in real
// Galerina every query input is Tainted<String> until validated, and the
// governance layer (the taint checker + value-state gates) is the value-add ON
// TOP of this scan — it is a compile-time cost, not a per-record runtime cost.
function scanRecords(n, threshold) {
  let matching = 0, c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  for (let i = 0; i < n; i++) {
    const amount = (i * 50) % 10000;              // 0..9999, deterministic (WHERE amount > threshold)
    if (amount > threshold) matching++;
    const cat = (i * 7) % 4;                       // 0..3 (GROUP BY category)
    if (cat === 0) c0++; else if (cat === 1) c1++; else if (cat === 2) c2++; else c3++;
  }
  return matching + c0 + c1 + c2 + c3;
}

const N = 10000;                    // records scanned per call — matches benchmark.fungi main()
const THRESHOLD = 3000;
const RECORD_SCANS_PER_CALL = N;    // the canonical N

function parseIntFlag(name, f) { const i = process.argv.indexOf(name); return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || f : f; }
const calls = parseIntFlag("--iterations", parseIntFlag("--operations", 5000));

for (let i = 0; i < 20; i++) scanRecords(N, THRESHOLD);   // warmup
if (typeof globalThis.gc === "function") globalThis.gc();
const memBefore = process.memoryUsage();

const t0 = performance.now();
let checksum = 0;
for (let i = 0; i < calls; i++) checksum = scanRecords(N, THRESHOLD);
const elapsedMs = performance.now() - t0;
const memAfter = process.memoryUsage();

const totalScans = calls * RECORD_SCANS_PER_CALL;
console.log(JSON.stringify({
  runtime: "nodejs",
  benchmark: "data-query-v1",
  datasetSize: N,
  calls,
  recordScansPerCall: RECORD_SCANS_PER_CALL,
  checksum,
  elapsedMs: +elapsedMs.toFixed(3),
  // THE comparable metric: record-scans/sec (one filter+group test per record).
  operationsPerSecond: Math.round(totalScans / (elapsedMs / 1000)),
  callsPerSecond: Math.round(calls / (elapsedMs / 1000)),
  memory: {
    heapUsedBefore: memBefore.heapUsed,
    heapUsedDelta: memAfter.heapUsed - memBefore.heapUsed,
  },
  notes: [
    "Common bulk-N path: scanRecords(10000) = 10000 record-scans/call (filter + group-by), identical on every runtime",
    "Integer core = the WASM/interp-comparable throughput; Galerina's taint checker governs the real Tainted<String> query path at compile time",
  ],
}, null, 2));
