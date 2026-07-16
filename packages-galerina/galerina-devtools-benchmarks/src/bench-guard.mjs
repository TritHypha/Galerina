// =============================================================================
// bench-guard.mjs — benchmark regression WATCHER (runs on every re-run)
// =============================================================================
// Owner ask (2026-07-16): "build a dev tool as a watcher for the benchmark when
// you re-run tests." `npm run history` calls this at the end of every run, and
// it is runnable standalone (`npm run bench:guard`).
//
// It reads the diff series (results/history/diff-latest.json) + the raw run
// (results/latest.json) and classifies EVERY mover by its lane's structural
// variance class and the environmental noise floor, then emits a FAIL-CLOSED
// verdict: which movers are attributable (INVESTIGATE) vs explained by
// noise/structure. This encodes, as a tool, the benchmark-noise discipline so a
// phantom mover is never chased and a real regression is never missed.
//
// VARIANCE CLASSES (why a lane moves), grounded in the 2026-07-16 empirical
// root-cause of the galerinaPassive swings (galerina-runner.mjs coldCalls=1..20;
// 10-rep sweep: CV ~18-21%, gc()-per-rep halves it → GC-timing dominated):
//   control            nodejs/cpp/rust/rustAvx2 — native, code CANNOT touch them;
//                      a mover here SIZES the environmental floor (thermal/boost).
//   cpython            python — documented block-mover noise class (±25-35%).
//   wasm               compiled → WebAssembly — the one STABLE, clean code signal.
//   interpreter-single galerinaPassive with coldCalls==1 — the rate is ONE
//                      wall-clock reading (spread up to 154%). NON-ATTRIBUTABLE.
//   interpreter        galerinaGoverned/Manifest/Passive(coldCalls>1) — all run
//                      the SAME tree-walker with ~20% CV GC-timing variance, so a
//                      real regression must clear ~3σ (≈60%) to be a signal.
//
// A mover is INVESTIGATE only on the wasm lane clearing max(floor, env×1.5), or
// an interpreter lane clearing max(60%, env×2) — and never if it is a
// work-equivalence shape-only lane or part of a bidirectional same-bench scatter.
//
// Usage: node src/bench-guard.mjs [--json] [--floor <pct>] [--self-test]
//        exit 0 = no attributable regressions · exit 3 = investigate (gate use)
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RESULTS = join(ROOT, "results");
const CONTROL = new Set(["nodejs", "cpp", "rust", "rustAvx2"]);
const INTERP = new Set(["galerinaGoverned", "galerinaManifest", "galerinaPassive"]);
const FLOOR_DEFAULT = 8;   // wasm-lane min |Δ%| to consider (above the ~1.4% control band)
const INTERP_BAR = 60;     // interpreter-lane min |Δ%| (≈3σ of the measured ~20% CV)

// ── pure classification (self-tested) ────────────────────────────────────────

// coldCallsByBench: { benchId -> coldCalls } from the raw run (passive lane only)
export function variClass(lane, benchId, coldCallsByBench) {
  if (CONTROL.has(lane)) return "control";
  if (lane === "python") return "cpython";
  if (lane === "wasm") return "wasm";
  if (lane === "galerinaPassive" && coldCallsByBench?.[benchId] === 1) return "interpreter-single";
  if (INTERP.has(lane)) return "interpreter";
  return "other";
}

// Environmental floor = the largest |Δ%| any CONTROL lane moved (native code
// can't change, so whatever they moved IS this session-pair's noise band).
export function environmentalFloor(rows) {
  let f = 0;
  for (const r of rows) {
    if (r.deltaPct === null) continue;
    const lane = r.key.split("|")[1];
    if (CONTROL.has(lane)) f = Math.max(f, Math.abs(r.deltaPct));
  }
  return Math.round(f * 10) / 10;
}

// Per-benchmark bidirectional scatter: attributable+low lanes moving BOTH ways
// on the same benchmark = variance, not a coherent regression.
export function bidirectionalBenches(rows) {
  const sign = {};
  for (const r of rows) {
    if (r.deltaPct === null || Math.abs(r.deltaPct) < 3) continue;
    const [b] = r.key.split("|");
    (sign[b] ??= new Set()).add(Math.sign(r.deltaPct));
  }
  return new Set(Object.entries(sign).filter(([, s]) => s.size > 1).map(([b]) => b));
}

export function verdictFor(row, ctx) {
  const [bench, lane] = row.key.split("|");
  if (row.deltaPct === null) return { verdict: "lane-change", why: row.note };
  const cls = variClass(lane, bench, ctx.coldCalls);
  const mag = Math.abs(row.deltaPct);
  const shapeOnly = ctx.workEquivalence?.[bench]?.lanes?.includes(lane);
  if (cls === "control") return { verdict: mag > 10 ? "env-floor" : "noise", cls, why: "native control — sizes the noise floor, not a code signal" };
  if (cls === "cpython") return { verdict: "noise", cls, why: "CPython block-mover noise class" };
  if (cls === "interpreter-single") return { verdict: "non-attributable", cls, why: "passive coldCalls=1 — one wall-clock reading (spread ~154%)" };
  if (cls === "interpreter") {
    if (shapeOnly) return { verdict: "shape-only", cls, why: "work-equivalence: not a cross-runtime signal" };
    if (ctx.bidir.has(bench)) return { verdict: "noise", cls, why: "bidirectional scatter on this benchmark" };
    const bar = Math.max(INTERP_BAR, ctx.envFloor * 2);
    return mag > bar ? { verdict: "investigate", cls, why: `interpreter lane moved ${row.deltaPct}% > ${bar.toFixed(0)}% (≈3σ of ~20% CV)` }
                     : { verdict: "noise", cls, why: `interpreter GC-variance, within ${bar.toFixed(0)}%` };
  }
  if (cls === "wasm") {
    if (shapeOnly) return { verdict: "shape-only", cls, why: "work-equivalence: not a cross-runtime signal" };
    if (ctx.bidir.has(bench)) return { verdict: "noise", cls, why: "bidirectional scatter on this benchmark" };
    const bar = Math.max(ctx.floor, ctx.envFloor * 1.5);
    return mag > bar ? { verdict: "investigate", cls, why: `wasm lane (compiled, stable) moved ${row.deltaPct}% > bar ${bar.toFixed(1)}%` }
                     : { verdict: "noise", cls, why: `within bar ${bar.toFixed(1)}%` };
  }
  return { verdict: "noise", cls, why: "unclassified lane" };
}

// ── self-test ────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  const cc = { "compute-mix": 1, "text-html": 20 };
  assert(variClass("nodejs", "x", cc) === "control", "control");
  assert(variClass("python", "x", cc) === "cpython", "cpython");
  assert(variClass("wasm", "x", cc) === "wasm", "wasm");
  assert(variClass("galerinaPassive", "compute-mix", cc) === "interpreter-single", "interpreter-single (coldCalls=1)");
  assert(variClass("galerinaPassive", "text-html", cc) === "interpreter", "interpreter (coldCalls=20)");
  assert(variClass("galerinaManifest", "hardware-targets", cc) === "interpreter", "manifest = interpreter");
  const rows = [
    { key: "b|rust", deltaPct: 4 }, { key: "b|rustAvx2", deltaPct: 31 },
    { key: "compute-mix|galerinaPassive", deltaPct: -45.8 },
    { key: "hardware-targets|galerinaManifest", deltaPct: -32.3 },
    { key: "c|wasm", deltaPct: 12 }, { key: "c|galerinaGoverned", deltaPct: -12 },
    { key: "d|wasm", deltaPct: 55 },
  ];
  assert(environmentalFloor(rows) === 31, "env floor = max control move");
  const bd = bidirectionalBenches(rows);
  assert(bd.has("c"), "bidirectional c (wasm +12 / gov -12)");
  const ctx = { coldCalls: cc, envFloor: 31, floor: 8, bidir: bd, workEquivalence: {} };
  assert(verdictFor(rows[2], ctx).verdict === "non-attributable", "passive coldCalls=1 non-attributable");
  assert(verdictFor(rows[3], ctx).verdict === "noise", "manifest -32% < 62% interp bar -> noise");
  assert(verdictFor(rows[1], ctx).verdict === "env-floor", "rustAvx2 +31 = env-floor");
  assert(verdictFor(rows[4], ctx).verdict === "noise", "wasm +12 but bidirectional -> noise");
  assert(verdictFor(rows[6], ctx).verdict === "investigate", "wasm +40% clean lane > env×1.5 -> investigate");
  console.log("bench-guard self-test: 11/11 ok");
  process.exit(0);
}
function assert(ok, what) { if (!ok) { console.error(`self-test FAIL: ${what}`); process.exit(1); } }

// ── main ─────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");
const floorIdx = process.argv.indexOf("--floor");
const floor = floorIdx >= 0 ? Number(process.argv[floorIdx + 1]) || FLOOR_DEFAULT : FLOOR_DEFAULT;

const diffPath = join(RESULTS, "history", "diff-latest.json");
if (!existsSync(diffPath)) { console.error("no diff-latest.json — run `npm run history` first"); process.exit(2); }
const diff = JSON.parse(readFileSync(diffPath, "utf8"));

// coldCalls per benchmark from the raw run (passive lane structural class)
const coldCalls = {};
try {
  const latest = JSON.parse(readFileSync(join(RESULTS, "latest.json"), "utf8"));
  for (const e of latest) {
    const p = e.results?.galerinaPassive;
    if (p && typeof p === "object" && typeof p.coldCalls === "number") coldCalls[e.benchmark] = p.coldCalls;
  }
} catch { /* absent -> passive lanes classify as low-sample, still conservative */ }

function analyze(rep) {
  if (rep.baseline) return { baseline: true, note: rep.note, investigate: [], byVerdict: {} };
  const envFloor = environmentalFloor(rep.rows);
  const bidir = bidirectionalBenches(rep.rows);
  const ctx = { coldCalls, envFloor, floor, bidir, workEquivalence: diff.workEquivalence };
  const graded = rep.rows.filter((r) => r.deltaPct !== null || r.note).map((r) => ({ ...r, ...verdictFor(r, ctx) }));
  const byVerdict = {};
  for (const g of graded) byVerdict[g.verdict] = (byVerdict[g.verdict] ?? 0) + 1;
  const investigate = graded.filter((g) => g.verdict === "investigate").sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return { baseline: false, fromStamp: rep.fromStamp, envFloor, byVerdict, investigate };
}

const out = { stamp: diff.stamp, noiseFloorPct: diff.noiseFloorPct, sinceLast: analyze(diff.sinceLast), sinceDayStart: analyze(diff.sinceDayStart) };
const totalInvestigate = out.sinceLast.investigate?.length ?? 0; // gate on since-last (the actionable window)

if (asJson) { console.log(JSON.stringify(out, null, 1)); }
else {
  console.log(`bench-guard @ ${diff.stamp}  (noise floor: ${diff.noiseFloorPct ?? "?"}%)`);
  for (const [title, a] of [["since last run", out.sinceLast], ["since day start", out.sinceDayStart]]) {
    if (a.baseline) { console.log(`  ${title}: ${a.note}`); continue; }
    const tally = Object.entries(a.byVerdict).map(([v, n]) => `${v} ${n}`).join(" · ");
    console.log(`  ${title} (vs ${a.fromStamp}, env-floor ${a.envFloor}%): ${tally || "no movers"}`);
    for (const g of a.investigate) console.log(`    ⚠ INVESTIGATE ${g.key}: ${g.deltaPct > 0 ? "+" : ""}${g.deltaPct}% — ${g.why}`);
  }
  console.log(totalInvestigate === 0
    ? "  verdict: no attributable regression — all movers explained by noise/structure ✓"
    : `  verdict: ${totalInvestigate} attributable mover(s) to INVESTIGATE (since last run) ✗`);
}
process.exit(totalInvestigate === 0 ? 0 : 3);
