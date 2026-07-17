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
//   passive-unmeasured galerinaPassive — its cold rate is single-shot per cold
//                      call (coldCalls 1..20, cache-clear folded in) → below any
//                      trustworthy sample floor. NON-ATTRIBUTABLE until the #63
//                      median rig lands (R&D: report "not-measured", not a rate).
//   interpreter        galerinaGoverned/Manifest — the tree-walker lanes that run
//                      real work N times. Bar is DATA-DERIVED (p85 of the run
//                      series' own spread), so it auto-shrinks when the rig lands.
//
// A mover is INVESTIGATE only on the wasm lane clearing max(floor, env×1.5), or
// an interpreter lane clearing max(dataDerivedBar, env×2) — and never if it is a
// work-equivalence shape-only lane or part of a bidirectional same-bench scatter.
//
// Usage: node src/bench-guard.mjs [--json] [--floor <pct>] [--self-test]
//        exit 0 = no attributable regressions · exit 3 = investigate (gate use)
// =============================================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RESULTS = join(ROOT, "results");
const CONTROL = new Set(["nodejs", "cpp", "rust", "rustAvx2"]);
const INTERP = new Set(["galerinaGoverned", "galerinaManifest"]); // attributable interpreter lanes (band derived from these)
const FLOOR_DEFAULT = 8;   // wasm-lane min |Δ%| to consider (above the ~1.4% control band)
const INTERP_BAR = 60;     // conservative fallback only when history is too thin to derive a bar

// ── pure classification (self-tested) ────────────────────────────────────────

// The passive lane is non-attributable regardless of coldCalls (its cold rate is
// single-shot per call until the #63 median rig). coldCallsByBench is retained
// for callers/telemetry but does not change the class.
export function variClass(lane, _benchId, _coldCallsByBench) {
  if (CONTROL.has(lane)) return "control";
  if (lane === "python") return "cpython";
  if (lane === "wasm") return "wasm";
  if (lane === "galerinaPassive") return "passive-unmeasured";
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

// DATA-DERIVED interpreter-lane noise band (R&D 2026-07-16: derive thresholds
// from measured spread, not folklore constants — and it must auto-shrink when
// the median rig lands). entries = [{stamp, flat}] sorted; we take the p85 of
// run-to-run |Δ%| across every interpreter lane. Because it is recomputed from
// the live series each run, it tightens automatically the moment a median rig
// reduces the lanes' variance — a hand-set 60% could not. Returns null (→ the
// documented conservative constant) when there is too little history to trust.
export function deriveInterpBand(entries, laneSet = INTERP) {
  const deltas = [];
  for (let i = 1; i < entries.length; i++) {
    const from = entries[i - 1].flat, to = entries[i].flat;
    for (const key of Object.keys(to)) {
      if (!laneSet.has(key.split("|")[1])) continue;
      const a = from[key], b = to[key];
      if (a > 0 && b > 0) deltas.push(Math.abs(((b - a) / a) * 100));
    }
  }
  if (deltas.length < 8) return null;
  deltas.sort((x, y) => x - y);
  const p85 = deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.85))];
  return Math.round(p85 * 10) / 10;
}

export function verdictFor(row, ctx) {
  const [bench, lane] = row.key.split("|");
  if (row.deltaPct === null) return { verdict: "lane-change", why: row.note };
  const cls = variClass(lane, bench, ctx.coldCalls);
  const mag = Math.abs(row.deltaPct);
  const weLane = ctx.workEquivalence?.[bench]?.lanes?.includes(lane);
  const weKind = weLane ? (ctx.workEquivalence[bench].kind ?? "elided") : null;
  // Work-equivalence verdict (RD-0446): "elided" lanes do LESS work (the flow-local bump-arena §a will make
  // them equivalent → citable, then their tag drops); "fused-vs-materialised" is a REAL optimisation difference
  // (§b reframe) — shown + explicitly labelled, never cited as a raw cross-runtime ratio.
  const weVerdict = (c) => weKind === "fused-vs-materialised"
    ? { verdict: "fused-vs-materialised", cls: c, why: "real optimisation difference (fusion vs materialisation) — shown, never cited as a raw ratio (RD-0446 §b)" }
    : { verdict: "shape-only", cls: c, why: "work-equivalence: allocation elided, not a cross-runtime signal (bump-arena pending, RD-0446 §a)" };
  if (cls === "control") return { verdict: mag > 10 ? "env-floor" : "noise", cls, why: "native control — sizes the noise floor, not a code signal" };
  if (cls === "cpython") return { verdict: "noise", cls, why: "CPython block-mover noise class" };
  if (cls === "passive-unmeasured") return { verdict: "non-attributable", cls, why: "passive cold rate is single-shot per call — not-measured until the #63 median rig" };
  if (cls === "interpreter") {
    if (weLane) return weVerdict(cls);
    if (ctx.bidir.has(bench)) return { verdict: "noise", cls, why: "bidirectional scatter on this benchmark" };
    const bar = Math.max(ctx.interpBar, ctx.envFloor * 2);
    return mag > bar ? { verdict: "investigate", cls, why: `interpreter lane moved ${row.deltaPct}% > ${bar.toFixed(0)}% (${ctx.interpBasis})` }
                     : { verdict: "noise", cls, why: `interpreter variance, within ${bar.toFixed(0)}% (${ctx.interpBasis})` };
  }
  if (cls === "wasm") {
    if (weLane) return weVerdict(cls);
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
  assert(variClass("galerinaPassive", "compute-mix", cc) === "passive-unmeasured", "passive coldCalls=1 unmeasured");
  assert(variClass("galerinaPassive", "text-html", cc) === "passive-unmeasured", "passive coldCalls=20 unmeasured");
  assert(variClass("galerinaGoverned", "x", cc) === "interpreter", "governed = interpreter");
  assert(variClass("galerinaManifest", "hardware-targets", cc) === "interpreter", "manifest = interpreter");
  const rows = [
    { key: "b|rust", deltaPct: 4 }, { key: "b|rustAvx2", deltaPct: 31 },
    { key: "compute-mix|galerinaPassive", deltaPct: -45.8 },
    { key: "hardware-targets|galerinaManifest", deltaPct: -32.3 },
    { key: "c|wasm", deltaPct: 12 }, { key: "c|galerinaGoverned", deltaPct: -12 },
    { key: "d|wasm", deltaPct: 55 }, { key: "e|galerinaGoverned", deltaPct: 90 },
  ];
  assert(environmentalFloor(rows) === 31, "env floor = max control move");
  const bd = bidirectionalBenches(rows);
  assert(bd.has("c"), "bidirectional c (wasm +12 / gov -12)");
  const ctx = { coldCalls: cc, envFloor: 31, floor: 8, bidir: bd, workEquivalence: {}, interpBar: 25, interpBasis: "test" };
  assert(verdictFor(rows[2], ctx).verdict === "non-attributable", "passive lane non-attributable");
  assert(verdictFor(rows[3], ctx).verdict === "noise", "manifest -32% < max(25,62)=62 interp bar -> noise");
  assert(verdictFor(rows[1], ctx).verdict === "env-floor", "rustAvx2 +31 = env-floor");
  assert(verdictFor(rows[4], ctx).verdict === "noise", "wasm +12 but bidirectional -> noise");
  assert(verdictFor(rows[6], ctx).verdict === "investigate", "wasm +55% clean lane > env×1.5 -> investigate");
  assert(verdictFor(rows[7], ctx).verdict === "investigate", "governed +90% > max(25,62)=62 -> investigate");
  // RD-0446 work-equivalence verdicts: "elided" → shape-only (bump-arena §a will fix); "fused-vs-materialised" →
  // a distinct label (§b reframe) — both non-cited, but the reframe says WHY (real optimisation, not elided work).
  const weCtx = { ...ctx, workEquivalence: { "record-allocation": { kind: "elided", lanes: ["wasm"] }, "collection-pipeline": { kind: "fused-vs-materialised", lanes: ["wasm"] } } };
  assert(verdictFor({ key: "record-allocation|wasm", deltaPct: 300 }, weCtx).verdict === "shape-only", "elided alloc lane -> shape-only");
  assert(verdictFor({ key: "collection-pipeline|wasm", deltaPct: 300 }, weCtx).verdict === "fused-vs-materialised", "collection-pipeline -> fused-vs-materialised (RD-0446 reframe, non-vacuous)");
  const weDefault = { ...ctx, workEquivalence: { "x": { lanes: ["wasm"] } } };
  assert(verdictFor({ key: "x|wasm", deltaPct: 300 }, weDefault).verdict === "shape-only", "work-equivalence lane with no kind defaults to shape-only (elided)");
  // data-derived interpreter band: null on thin history (→ constant fallback), numeric with enough
  assert(deriveInterpBand([{ stamp: "a", flat: { "x|galerinaGoverned": 100 } }, { stamp: "b", flat: { "x|galerinaGoverned": 110 } }]) === null, "thin history -> null (constant fallback)");
  const many = [];
  for (let i = 0; i <= 10; i++) many.push({ stamp: String(i), flat: { "a|galerinaGoverned": 100 + (i % 2) * 20, "b|galerinaManifest": 100 + (i % 2) * 20 } });
  const band = deriveInterpBand(many);
  assert(typeof band === "number" && band > 0, "sufficient history -> numeric data-derived band");
  console.log("bench-guard self-test: 17/17 ok");
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

// DATA-DERIVED interpreter bar from the history run-series (R&D: not a folklore
// constant; auto-shrinks when the median rig lands). Falls back to the
// documented conservative constant only when history is too thin to trust.
let interpBar = INTERP_BAR, interpBasis = `${INTERP_BAR}% constant (thin history)`;
try {
  const HDIR = join(RESULTS, "history");
  const entries = readdirSync(HDIR)
    .filter((f) => /^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => {
      const arr = JSON.parse(readFileSync(join(HDIR, f), "utf8"));
      const flat = {};
      for (const e of arr) for (const [rt, v] of Object.entries(e.results ?? {})) {
        if (!v || typeof v !== "object") continue;
        const t = v.normThroughput ?? v.iterationsPerSecond ?? v.operationsPerSecond ?? v.runsPerSecond ?? null;
        if (t !== null && Number.isFinite(t)) flat[`${e.benchmark}|${rt}`] = t;
      }
      return { stamp: f.slice(4, -5), flat };
    });
  const derived = deriveInterpBand(entries);
  if (derived !== null) { interpBar = derived; interpBasis = `${derived}% data-derived (p85 of ${entries.length}-run interpreter spread)`; }
} catch { /* history absent -> constant fallback, already conservative */ }

function analyze(rep) {
  if (rep.baseline) return { baseline: true, note: rep.note, investigate: [], byVerdict: {} };
  const envFloor = environmentalFloor(rep.rows);
  const bidir = bidirectionalBenches(rep.rows);
  const ctx = { coldCalls, envFloor, floor, bidir, workEquivalence: diff.workEquivalence, interpBar, interpBasis };
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
  console.log(`bench-guard @ ${diff.stamp}  (noise floor: ${diff.noiseFloorPct ?? "?"}% · interpreter bar: ${interpBasis})`);
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
