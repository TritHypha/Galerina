// =============================================================================
// history.mjs — recurring benchmark snapshots + deltas (since-last · day-start)
// =============================================================================
// Owner ask (2026-07-16): every benchmark run should be able to show its diff
// since the LAST run and since the START of the day, automatically — without
// the manual `npm run snapshot -- <label>` archive workflow (which stays the
// deliberate-baseline mechanism; this is the always-on series).
//
// Each run:
//   1. copies results/latest.json -> results/history/run-<stamp>.json,
//   2. seeds the series from any pre-existing results/full-suite-*.json
//      (stamped from file mtime) so today's earlier runs count as day-start,
//   3. prints + writes results/history/diff-latest.json with per
//      benchmark×runtime normThroughput deltas vs (a) the previous entry and
//      (b) the first entry of the same local day.
//
// Reading discipline (benchmark-noise-floor): judge movers against the
// control band (noise-gate-latest.json control spread); a single-run diff is
// attribution-GRADE only when it clears the noise floor by a wide margin.
//
// WORK-EQUIVALENCE tags: lanes whose .fungi body preserves the loop SHAPE but
// elides the workload's defining operation (heap allocation) are tagged so a
// ">100% of native" reading is never cited as an allocation win. Verified
// against the benchmark sources 2026-07-16.
//
// Usage:  node src/history.mjs [--self-test]     (npm run history)
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RESULTS = join(ROOT, "results");
const HIST = join(RESULTS, "history");

// Lanes where the .fungi source preserves recursion/loop shape but elides the
// heap allocation the benchmark family is named for (see each benchmark.fungi
// header). Cross-runtime throughput for these lanes is shape-parity data, NOT
// an allocation comparison.
export const WORK_EQUIVALENCE = {
  // `kind` distinguishes WHY a lane is not a cross-runtime signal (RD-0446):
  //  - "elided": the WASM/fungi lane does LESS work than node/rust (allocation elided → scalar binds / count-only).
  //    The flow-local bump-arena (RD-0446 §a) makes it work-equivalent, after which its shape-only tag drops.
  //  - "fused-vs-materialised": a REAL optimisation difference (fusion vs materialisation), NOT elided work. Kept +
  //    labelled as such (RD-0446 §b reframe), never cited as a raw ratio; the true work-equivalent number needs a
  //    materialised variant (recommended follow-on).
  "record-allocation": { kind: "elided", lanes: ["wasm", "galerinaGoverned", "galerinaManifest", "galerinaPassive"], note: "fungi lane binds scalars (WASM: register locals) — node/rust allocate real records" },
  "binary-trees": { kind: "elided", lanes: ["wasm", "galerinaGoverned", "galerinaManifest", "galerinaPassive"], note: "COUNT-ONLY form (documented in-corpus) — heap node elided, recursion shape + checksum preserved" },
  "collection-pipeline": { kind: "fused-vs-materialised", lanes: ["wasm", "galerinaGoverned", "galerinaManifest", "galerinaPassive"], note: "fused while-loop (documented in-corpus) — node materializes filter/map arrays; a REAL optimisation, not elided work" },
};

// canonical throughput extractor — same chain as report.mjs/compare.mjs
export const tput = (r) => r ? (r.normThroughput ?? r.operationsPerSecond ?? r.iterationsPerSecond ?? r.additionsPerSecond ?? r.attemptsPerSecond ?? r.callsPerSecond ?? r.runsPerSecond ?? null) : null;

// ── pure helpers (self-tested) ───────────────────────────────────────────────

// results-array -> { "benchmark|runtime" -> throughput }
export function flatten(arr) {
  const flat = {};
  for (const e of arr ?? []) {
    for (const [rt, v] of Object.entries(e.results ?? {})) {
      if (!v || typeof v !== "object") continue;
      const t = tput(v);
      if (t !== null && Number.isFinite(t)) flat[`${e.benchmark}|${rt}`] = t;
    }
  }
  return flat;
}

// % deltas between two flat maps
export function diffFlat(from, to) {
  const keys = [...new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})])].sort();
  const rows = [];
  for (const k of keys) {
    const a = from?.[k];
    const b = to?.[k];
    if (a === undefined || b === undefined) {
      rows.push({ key: k, from: a ?? null, to: b ?? null, deltaPct: null, note: a === undefined ? "new lane" : "lane missing" });
    } else if (a === 0) {
      rows.push({ key: k, from: a, to: b, deltaPct: null, note: "zero baseline" });
    } else {
      rows.push({ key: k, from: a, to: b, deltaPct: Math.round(((b - a) / a) * 1000) / 10 });
    }
  }
  return rows;
}

export function localDay(stamp) { return stamp.slice(0, 10); }
function stampOf(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// ── self-test ────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  const arr = [{ benchmark: "b1", results: { nodejs: { normThroughput: 100 }, wasm: { iterationsPerSecond: 50 }, broken: null } }];
  const f = flatten(arr);
  assert(f["b1|nodejs"] === 100 && f["b1|wasm"] === 50 && !("b1|broken" in f), "flatten");
  const d = diffFlat({ "b1|nodejs": 100, "gone|x": 5 }, { "b1|nodejs": 110, "new|y": 1 });
  const m = Object.fromEntries(d.map((r) => [r.key, r]));
  assert(m["b1|nodejs"].deltaPct === 10, "delta pct");
  assert(m["gone|x"].note === "lane missing" && m["new|y"].note === "new lane", "lane add/remove");
  assert(localDay("2026-07-16T16-02-11") === "2026-07-16", "localDay");
  console.log("bench-history self-test: 4/4 ok");
  process.exit(0);
}
function assert(ok, what) { if (!ok) { console.error(`self-test FAIL: ${what}`); process.exit(1); } }

// ── main ─────────────────────────────────────────────────────────────────────
const latestPath = join(RESULTS, "latest.json");
if (!existsSync(latestPath)) { console.error("no results/latest.json — run `npm run run` first"); process.exit(2); }
mkdirSync(HIST, { recursive: true });

// 1. seed: import any full-suite-*.json not yet in history (stamped by mtime)
const seeded = [];
for (const f of readdirSync(RESULTS).filter((f) => /^full-suite-.*\.json$/.test(f))) {
  const src = join(RESULTS, f);
  const stamp = stampOf(statSync(src).mtime);
  const dest = join(HIST, `run-${stamp}.json`);
  if (!existsSync(dest)) { copyFileSync(src, dest); seeded.push(`${f} -> run-${stamp}.json`); }
}

// 2. snapshot the current run (stamped by latest.json's own mtime — the run time, not now)
const runStamp = stampOf(statSync(latestPath).mtime);
const runDest = join(HIST, `run-${runStamp}.json`);
if (!existsSync(runDest)) copyFileSync(latestPath, runDest);

// 3. load the series
const entries = readdirSync(HIST)
  .filter((f) => /^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .map((f) => ({ stamp: f.slice(4, -5), flat: flatten(JSON.parse(readFileSync(join(HIST, f), "utf8"))) }));

const cur = entries.find((e) => e.stamp === runStamp);
const before = entries.filter((e) => e.stamp < runStamp);
const last = before.length > 0 ? before[before.length - 1] : null;
const dayFirst = before.find((e) => localDay(e.stamp) === localDay(runStamp)) ?? null;

// noise floor from the last noise-gate run, if present
let noisePct = null;
try {
  const ng = JSON.parse(readFileSync(join(RESULTS, "noise-gate-latest.json"), "utf8"));
  noisePct = ng.controlSpreadPct ?? ng.spreadPct ?? null;
} catch { /* absent is fine — stated in output */ }

function report(label, from) {
  if (!from) return { baseline: true, note: `no prior run — this run seeds the ${label} baseline`, rows: [] };
  return { baseline: false, fromStamp: from.stamp, rows: diffFlat(from.flat, cur.flat) };
}
const out = {
  stamp: runStamp,
  noiseFloorPct: noisePct,
  workEquivalence: WORK_EQUIVALENCE,
  sinceLast: report("series", last),
  sinceDayStart: report("day", dayFirst),
};
writeFileSync(join(HIST, "diff-latest.json"), JSON.stringify(out, null, 1) + "\n");

// terminal summary — top movers by |Δ%|, flagged vs the noise floor
if (seeded.length) console.log(`seeded ${seeded.length} pre-existing archive(s) into history/`);
console.log(`bench snapshot: run-${runStamp}.json  (noise floor: ${noisePct !== null ? noisePct + "%" : "unknown — run noise-gate"})`);
for (const [title, rep] of [["since last run", out.sinceLast], ["since day start", out.sinceDayStart]]) {
  if (rep.baseline) { console.log(`  ${title}: ${rep.note}`); continue; }
  const movers = rep.rows.filter((r) => r.deltaPct !== null).sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct)).slice(0, 12);
  console.log(`  ${title} (vs ${rep.fromStamp}):`);
  for (const r of movers) {
    const [bench, lane] = r.key.split("|");
    const we = WORK_EQUIVALENCE[bench]?.lanes.includes(lane) ? " [shape-only lane]" : "";
    const sig = noisePct !== null && Math.abs(r.deltaPct) <= noisePct * 2 ? " (within noise)" : "";
    console.log(`    ${r.key}: ${(r.deltaPct > 0 ? "+" : "") + r.deltaPct}%${sig}${we}`);
  }
  const changed = rep.rows.filter((r) => r.note).length;
  if (changed) console.log(`    (+${changed} lane add/remove — see diff-latest.json)`);
}
console.log(`  -> results/history/diff-latest.json`);

// Auto-run the watcher on every re-run (owner ask): classify movers + verdict.
console.log("");
try {
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, [join(ROOT, "src", "bench-guard.mjs")], { stdio: "inherit" });
} catch (e) {
  // exit 3 = "investigate" (a real signal, not a tool failure) — surface, don't crash the run
  if (e?.status !== 3) console.error("bench-guard: " + (e?.message ?? e));
}
