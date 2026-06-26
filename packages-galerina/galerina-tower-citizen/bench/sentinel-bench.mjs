// sentinel-bench.mjs — the cost of the "Triple-Lock" trusted-ingestion path.
//
// Measures one ternary T-MAC op three ways, to price the Sentinel layers:
//   1. BARE          — bridge.execute on pre-packed weights. No staging, no checks.
//   2. LSM-staged    — weights staged through an LSM pooled, aligned TPL buffer.
//   3. LSM + LSIO    — staged AND integrity-gated (SHA-256 per op) + zero-copy map.
//                      i.e. the full Hardened-Border ingestion before every op.
//
// The gap (1 → 3) is the trusted-ingestion tax: what you pay per op for
// "no weight reaches the Brawn without being aligned, segmented, and hash-verified".

import { StubTernaryBridge, AuditLogger } from "../dist/index.js";
import { StaticMemoryPool, TPLStateBuffer } from "../../galerina-core-sentinel-memory/dist/index.js";
import { buildManifest, IntegrityMonitor, ZeroCopyMapper } from "../../galerina-core-sentinel-io/dist/index.js";

const asJson = process.argv.includes("--json");
const TRITS = 256;
const ITER = 20_000;

function makeTrits(n) {
  const out = []; let r = 0x9e3779b9 >>> 0;
  for (let i = 0; i < n; i++) { r ^= (r << 13); r >>>= 0; r ^= (r >>> 17); r ^= (r << 5); r >>>= 0; out.push((r % 3) - 1); }
  return out;
}
function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + "M/s" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K/s" : Math.round(n) + "/s"; }

const trits = makeTrits(TRITS);
const acts = Int32Array.from({ length: TRITS }, (_, i) => ((i * 5) % 7) - 3);
// In-memory audit (null logDir): the bridge emits one audit event per T-MAC; a
// disk logger would make this benchmark disk-I/O-bound, not ingestion-bound.
const bridge = new StubTernaryBridge(new AuditLogger(null));

// Pre-stage a reusable LSM buffer (the pool is allocated once at boot — deterministic).
const pool = new StaticMemoryPool({ totalBytes: 8192, blockBytes: 64 });
const tpl = new TPLStateBuffer(pool, TRITS);
tpl.loadTrits(trits);
const packed = pool.u8(tpl.block).slice(0, Math.ceil(TRITS / 16) * 4);
const stagedI32 = pool.i32(tpl.block);
const manifest = buildManifest("w", [{ id: "w0", bytes: packed }]);
const monitor = new IntegrityMonitor();

function time(label, fn, iter = ITER) {
  for (let i = 0; i < 500; i++) fn(i); // warm
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < iter; i++) acc ^= fn(i) | 0;
  const sec = Number(process.hrtime.bigint() - t0) / 1e9;
  return { label, iter, sec, opsPerSec: iter / sec, _acc: acc };
}

// 1. BARE — pre-packed weights straight to the Brawn.
const bare = time("bare T-MAC (no sentinels)", () =>
  bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: "b", weights: stagedI32, activations: acts, count: TRITS, scale: 1, offset: 0 }).value);

// 2. LSM-staged — re-stage trits into the pooled aligned buffer each op, then run.
const lsm = time("LSM-staged (aligned pool)", () => {
  tpl.loadTrits(trits);
  return bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: "l", weights: pool.i32(tpl.block), activations: acts, count: TRITS, scale: 1, offset: 0 }).value;
});

// 3. LSM + LSIO — full trusted ingestion: integrity-gate + zero-copy map every op.
const mapper = new ZeroCopyMapper();
const full = time("LSM+LSIO (integrity-gated)", () => {
  const [m] = mapper.map(manifest, packed, monitor); // SHA-256 verify per op
  return bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: "f", weights: m.i32(), activations: acts, count: TRITS, scale: 1, offset: 0 }).value;
});

const results = [bare, lsm, full];
if (asJson) { console.log(JSON.stringify({ trits: TRITS, results: results.map(({ _acc, ...r }) => r) }, null, 2)); }
else {
  console.log("\n  Sentinel trusted-ingestion cost — per ternary op");
  console.log("  ════════════════════════════════════════════════════════════════");
  const best = Math.max(...results.map(r => r.opsPerSec));
  for (const r of results) {
    const win = r.opsPerSec === best ? " 🚀" : ` (${(best / r.opsPerSec).toFixed(1)}× vs bare)`;
    console.log(`  ${r.label.padEnd(30)} ${fmt(r.opsPerSec).padStart(10)}  (${r.iter.toLocaleString()} ops in ${r.sec.toFixed(2)}s)${win}`);
  }
  console.log("  ────────────────────────────────────────────────────────────────");
  console.log("  BARE = weights → Brawn. LSM = + pooled aligned staging.");
  console.log("  LSM+LSIO = + per-op SHA-256 integrity gate (the Hardened Border tax).\n");
}
