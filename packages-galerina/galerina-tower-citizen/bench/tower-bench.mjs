// tower-bench.mjs — "with and without governance" A/B for the Governed Inference Tower.
//
// Answers: what does the Tower's governance/audit lifecycle COST over the raw
// ternary compute it wraps? Runs the SAME ternary work three ways:
//
//   1. RAW        — TPLSimulator.tmacVector in a tight loop. No Tower, no
//                   governance, no audit. The bare-metal ternary floor.
//   2. GOVERNED   — HybridInferenceEngine.infer() with the default STUB bridge
//      (stub)       registry: full Load→Plan→Exec→Audit→Erase + ai{} checks.
//   3. GOVERNED   — same, but the bridge registry comes from galerina-ext-bridge-cpp
//      (cpp)        (the BitNet CPU bridge / Brawn). Determinism oracle path.
//
// Usage:
//   node bench/tower-bench.mjs               # all three
//   node bench/tower-bench.mjs --raw         # only the raw simulator floor
//   node bench/tower-bench.mjs --governed    # only the two governed paths
//   node bench/tower-bench.mjs --json        # machine-readable
//
// NOTE: raw T-MAC ops and governed inference passes are DIFFERENT units of work
// (a T-MAC is one dot product; an infer() routes a whole 6-op transformer plan
// through the lifecycle). The point is not "X is N× Y" but to show the governed
// path's absolute throughput and the audit-events-per-pass it produces.

import { TPLSimulator, GovernanceEnforcer, AuditLogger, createHybridEngine } from "../dist/index.js";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const onlyRaw = args.has("--raw");
const onlyGov = args.has("--governed");

// Try to load the cpp bridge registry (the Brawn). Absent → skip path 3.
let createCppBridgeRegistry = null;
try {
  ({ createCppBridgeRegistry } = await import("@galerina/ext-bridge-cpp"));
} catch {
  try { ({ createCppBridgeRegistry } = await import("../../galerina-ext-bridge-cpp/dist/index.js")); }
  catch { /* cpp bridge not built — path 3 skipped */ }
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M/s";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K/s";
  return Math.round(n) + "/s";
}

// ── 1. RAW ternary T-MAC floor ───────────────────────────────────────────────
function benchRaw(tritCount = 256, iterations = 200_000) {
  // In-memory audit (logDir=null): tmacVector emits one audit event per call, so a
  // disk-backed logger here would make the "raw" floor disk-bound, not compute-bound.
  const sim = new TPLSimulator(new AuditLogger(null), new GovernanceEnforcer(), tritCount);
  const weights = Array.from({ length: tritCount }, (_, i) => ((i * 7) % 3) - 1); // {-1,0,+1}
  sim.loadWeights(weights);
  sim.setScale(1);
  const acts = Int32Array.from({ length: tritCount }, (_, i) => ((i * 5) % 7) - 3);

  // warm
  for (let i = 0; i < 1000; i++) sim.tmacVector(acts, 0, tritCount, "warm");
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < iterations; i++) acc ^= sim.tmacVector(acts, 0, tritCount, "raw");
  const sec = Number(process.hrtime.bigint() - t0) / 1e9;
  return { label: "raw T-MAC (no governance)", unit: "T-MAC ops", count: iterations, sec, opsPerSec: iterations / sec, checksum: acc };
}

// ── 2/3/4. GOVERNED hybrid inference passes ──────────────────────────────────
async function benchGoverned(label, { bridges, auditInMemory = true, passes = 2000, warm = 50 } = {}) {
  const engine = createHybridEngine({ airGapped: true, governanceTier: 1, auditInMemory, ...(bridges ? { bridges } : {}) });
  for (let i = 0; i < warm; i++) await engine.infer({ prompt: "warm", correlationId: `warm-${label}-${i}` });
  const t0 = process.hrtime.bigint();
  let bridgesUsed = [];
  for (let i = 0; i < passes; i++) {
    const r = await engine.infer({ prompt: "doc", correlationId: `gov-${label}-${i}` });
    if (i === 0) bridgesUsed = r.bridgesUsed;
  }
  const sec = Number(process.hrtime.bigint() - t0) / 1e9;
  const events = engine.getAudit().query({ correlationId: `gov-${label}-0` }).length;
  return { label, unit: "infer() passes", count: passes, sec, opsPerSec: passes / sec, bridgesUsed, eventsPerPass: events };
}

const results = [];
if (!onlyGov) results.push(benchRaw());
if (!onlyRaw) {
  // Governance LOGIC cost (in-memory audit — isolates compute from disk I/O):
  results.push(await benchGoverned("governed (in-mem audit)", { auditInMemory: true }));
  // Governance + PERSISTENT disk audit ledger (the real production write cost).
  // Fewer passes — synchronous appendFileSync per event is slow on Windows.
  results.push(await benchGoverned("governed (DISK audit ledger)", { auditInMemory: false, passes: 20, warm: 2 }));
}

if (asJson) {
  console.log(JSON.stringify({ machine: { node: process.version, arch: process.arch }, results }, null, 2));
} else {
  console.log("\n  Governed Inference Tower — with / without governance");
  console.log("  ════════════════════════════════════════════════════════════════");
  const best = Math.max(...results.map(r => r.opsPerSec));
  for (const r of results) {
    const win = r.opsPerSec === best ? " 🚀" : "";
    console.log(`  ${(r.label).padEnd(30)} ${fmt(r.opsPerSec).padStart(10)}  (${r.count.toLocaleString()} ${r.unit} in ${r.sec.toFixed(2)}s)${win}`);
    if (r.bridgesUsed) console.log(`  ${"".padEnd(30)}   bridge: ${r.bridgesUsed.join(", ") || "(none)"} · ${r.eventsPerPass} audit events/pass`);
  }
  console.log("  ────────────────────────────────────────────────────────────────");
  console.log("  RAW = bare ternary T-MAC (the floor). GOVERNED = full Tower lifecycle");
  console.log("  (Load→Plan→Exec→Audit→Erase + ai{} checks) per inference pass.");
  console.log("  🚀 = fastest throughput in its unit.\n");
}
