// =============================================================================
// audit-benchmark-integrity.mjs — fail-closed audit: no benchmark may PUBLISH a
// misleading number. Two failure classes, both real and both already observed:
//
//   (A) STALE report — report.md drifted from compare.mjs(results/latest.json).
//       Observed 2026-07-17: report.md was 381 commits behind latest.json (the
//       closing-cycle refreshed latest.json ~11× but never regenerated report.md),
//       so the PUBLIC report showed numbers from an old run. A generated artifact
//       that doesn't match its generator+input is a silent lie.
//
//   (B) UNCERTIFIED cross-runtime ratio — a benchmark printed with a governed/wasm
//       "N× slower/faster" vs a NATIVE runtime, without a work-equivalence
//       certificate. `throughput-units.mjs` SPECS IS that certificate: it proves
//       every runtime is normalized to ONE unit for the SAME work. A benchmark
//       that is NOT in SPECS (comparable:true) and NOT caveated as shape-only
//       (work-equivalence.mjs) is comparing amounts of work nobody verified equal.
//       Observed 2026-07-17: governance-cost published `⚫ 1,077,381× slower`
//       (governed vs Rust) — but the Rust lane runs `(1..=1000).sum()` (bare
//       arithmetic, NO governance, n=1000) while the Galerina flow runs
//       triangleNumber(100) WITH full governance per call; the benchmark's own
//       header says its metric is the INTERNAL govSpeed/manifestSpeed ratio, not
//       cross-runtime. The number is a category error, not a speed result — the
//       exact "compare non-work-equivalent measurements → catastrophic false
//       ratio" class that would also mis-fire a production monitor/gate.
//
// This encodes, as a fail-closed tool, the discipline "work-equivalence BEFORE any
// cross-runtime ratio". A ratio nobody can attribute to equal work is never citable.
//
// Usage: node src/audit-benchmark-integrity.mjs [--json] [--self-test]
//        exit 0 = clean · exit 3 = findings (gate use) · exit 2 = inputs missing
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { benchmarkSpec, isComparable } from "./throughput-units.mjs";
import { WORK_EQUIVALENCE, shapeOnlyLane } from "./work-equivalence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Native (non-Galerina, non-WASM) runtimes — the "ceiling" a cross-runtime ratio
// compares a Galerina lane against. A ratio only exists if ≥1 of these ran.
const NATIVE = new Set(["rustAvx512", "rustAvx2", "rust", "cpp", "nodejs", "python", "denoWebGpu"]);
const GALERINA = new Set(["wasm", "galerinaGoverned", "galerinaManifest", "galerinaPassive"]);
// Above this governed-vs-native slowdown, "the interpreter is just slow" stops being
// a credible explanation (the tree-walker's honest worst on work-equivalent lanes is
// ~4000×). Beyond it, non-work-equivalence is the likelier cause → CRITICAL not HIGH.
const EXTREME_SLOWER = 10000;

const tput = (r) => {
  if (!r || r.error) return null;
  if (typeof r.normThroughput === "number") return r.normThroughput;
  return r.galerinaOpsPerSecond ?? r.warmCallsPerSecond ?? r.operationsPerSecond
      ?? r.additionsPerSecond ?? r.attemptsPerSecond ?? r.iterationsPerSecond
      ?? r.callsPerSecond ?? r.runsPerSecond ?? null;
};

// ── pure classification (self-tested) ────────────────────────────────────────

/**
 * Classify one benchmark's cross-runtime comparability from its result row.
 * Returns { benchmark, shown, certified, caveated, findings[] } where findings are
 * { code, severity, detail }. A benchmark is "shown" cross-runtime iff ≥1 Galerina
 * lane AND ≥1 native lane produced throughput.
 */
export function classifyBenchmark(entry) {
  const id = entry.benchmark;
  const results = entry.results ?? {};
  const rt = {};
  for (const k of Object.keys(results)) rt[k] = tput(results[k]);

  const nativeRates = [...NATIVE].map((n) => rt[n]).filter((x) => x != null && x > 0);
  const galerinaLanes = [...GALERINA].filter((g) => rt[g] != null && rt[g] > 0);
  const shown = nativeRates.length > 0 && galerinaLanes.length > 0;

  const spec = benchmarkSpec(id);
  // Certified work-equivalent = normalized in SPECS AND not a shape-only caveat lane.
  const certified = !!spec && isComparable(id) && WORK_EQUIVALENCE[id] === undefined;
  const caveated = WORK_EQUIVALENCE[id] !== undefined; // shape-only / fused-form (handled by the report marker)

  const findings = [];
  if (shown && !certified && !caveated) {
    const bestNative = Math.max(...nativeRates);
    const gov = rt.galerinaGoverned;
    const slower = gov && gov > 0 ? bestNative / gov : null; // governed is slower → ratio > 1
    const extreme = slower != null && slower > EXTREME_SLOWER;
    findings.push({
      code: "uncertified-cross-runtime",
      severity: extreme ? "CRITICAL" : "HIGH",
      detail: `published a cross-runtime ratio but is NOT certified work-equivalent in throughput-units.mjs`
        + (spec ? " (in SPECS but flagged non-comparable)" : " (absent from SPECS — legacy whole-call rate)")
        + (slower != null ? ` — governed is ${fmtX(slower)} vs best native` : "")
        + (extreme ? ` → beyond any plausible interpreter overhead; near-certain non-work-equivalence` : ""),
    });
  }
  return { benchmark: id, shown, certified, caveated, findings };
}

function fmtX(r) {
  if (r >= 1e6) return (r / 1e6).toFixed(1) + "M×";
  if (r >= 1e3) return (r / 1e3).toFixed(1) + "K×";
  return r.toFixed(0) + "×";
}

/** Normalize text for a stale-comparison that ignores trailing whitespace / EOL. */
function normalize(s) { return s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n+$/, "\n"); }

// ── self-test ────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let ok = 0, fail = 0;
  const check = (cond, what) => { if (cond) ok++; else { fail++; console.error(`  FAIL: ${what}`); } };

  // governance-cost shape: out-of-SPECS, native fast, governed ~1M× slower → CRITICAL finding.
  const gc = classifyBenchmark({ benchmark: "governance-cost", results: {
    rust: { iterationsPerSecond: 8.9e8 }, galerinaGoverned: { normThroughput: 826 }, wasm: { normThroughput: 2.9e6 },
  }});
  check(gc.shown && !gc.certified && !gc.caveated, "governance-cost is shown + uncertified + not caveated");
  check(gc.findings.some((f) => f.code === "uncertified-cross-runtime" && f.severity === "CRITICAL"),
        "governance-cost → CRITICAL uncertified finding (governed ~1M× slower)");

  // compute-mix shape: IN SPECS (comparable), not shape-only → certified → NO finding.
  const cm = classifyBenchmark({ benchmark: "compute-mix", results: {
    nodejs: { normThroughput: 1.35e8 }, galerinaGoverned: { normThroughput: 1.67e6 }, wasm: { normThroughput: 7.7e7 },
  }});
  check(cm.shown && cm.certified && cm.findings.length === 0, "compute-mix certified in SPECS → no finding");

  // record-allocation: shape-only (in WORK_EQUIVALENCE) → caveated → NO finding (the report marks it).
  const ra = classifyBenchmark({ benchmark: "record-allocation", results: {
    rustAvx2: { normThroughput: 1.18e9 }, galerinaGoverned: { normThroughput: 2.5e6 }, wasm: { normThroughput: 5.5e8 },
  }});
  check(ra.caveated && ra.findings.length === 0, "record-allocation shape-only → caveated, no finding");

  // out-of-SPECS but PLAUSIBLE ratio (e.g. fibonacci-recursive ~40×): shown+uncertified → HIGH (not CRITICAL).
  const fib = classifyBenchmark({ benchmark: "fibonacci-recursive", results: {
    nodejs: { normThroughput: 50800 }, galerinaGoverned: { normThroughput: 1300 }, wasm: { normThroughput: 17300 },
  }});
  check(fib.findings.some((f) => f.severity === "HIGH"), "plausible-ratio out-of-SPECS lane → HIGH (uncertified, review)");

  // a benchmark with NO native lane (only Galerina) is NOT shown cross-runtime → no finding.
  const noNative = classifyBenchmark({ benchmark: "framework-pipeline", results: {
    galerinaGoverned: { normThroughput: 100 }, wasm: { normThroughput: 200 },
  }});
  check(!noNative.shown && noNative.findings.length === 0, "no native lane → not a cross-runtime claim → no finding");

  // normalize() ignores EOL + trailing ws (so staleness compares content, not Windows checkout artifacts).
  check(normalize("a \r\nb\t\n\n") === normalize("a\nb\n"), "normalize collapses EOL + trailing ws");

  console.log(fail === 0 ? `benchmark-integrity self-test: ${ok}/${ok} ok` : `benchmark-integrity self-test: ${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── main ─────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");
const latestPath = join(ROOT, "results", "latest.json");
const reportPath = join(ROOT, "report.md");

if (!existsSync(latestPath)) { console.error("no results/latest.json — run `npm run run` first"); process.exit(2); }
const data = JSON.parse(readFileSync(latestPath, "utf8"));

const findings = [];

// ── Check A: report staleness ────────────────────────────────────────────────
let staleStatus = "n/a";
if (!existsSync(reportPath)) {
  findings.push({ benchmark: "(report)", code: "report-missing", severity: "HIGH", detail: "report.md does not exist — run `node src/compare.mjs > report.md`" });
  staleStatus = "missing";
} else {
  try {
    const regen = execFileSync("node", [join(HERE, "compare.mjs")], { maxBuffer: 1e8 }).toString("utf8");
    const current = readFileSync(reportPath, "utf8");
    if (normalize(regen) !== normalize(current)) {
      findings.push({ benchmark: "(report)", code: "report-stale", severity: "HIGH",
        detail: "report.md does NOT match compare.mjs(results/latest.json) — the published report is out of date; regenerate: node src/compare.mjs > report.md" });
      staleStatus = "STALE";
    } else staleStatus = "fresh";
  } catch (e) {
    findings.push({ benchmark: "(report)", code: "report-regen-failed", severity: "HIGH", detail: `could not regenerate report to compare: ${e.message}` });
    staleStatus = "error";
  }
}

// ── Check B: uncertified cross-runtime ratios ────────────────────────────────
const perBench = [];
for (const entry of data) {
  const c = classifyBenchmark(entry);
  perBench.push(c);
  for (const f of c.findings) findings.push({ benchmark: c.benchmark, ...f });
}

const critical = findings.filter((f) => f.severity === "CRITICAL");
const rank = { CRITICAL: 0, HIGH: 1 };
findings.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

if (asJson) {
  console.log(JSON.stringify({ staleStatus, findings, shownUncertified: perBench.filter((b) => b.shown && !b.certified && !b.caveated).map((b) => b.benchmark) }, null, 1));
} else {
  console.log(`benchmark-integrity audit  (report: ${staleStatus})`);
  const shownCertified = perBench.filter((b) => b.shown && b.certified).length;
  const shownCaveated = perBench.filter((b) => b.shown && b.caveated).length;
  const shownUncertified = perBench.filter((b) => b.shown && !b.certified && !b.caveated);
  console.log(`  cross-runtime benchmarks: ${shownCertified} certified · ${shownCaveated} shape-only caveated · ${shownUncertified.length} UNCERTIFIED`);
  for (const f of findings) console.log(`    ${f.severity === "CRITICAL" ? "⛔" : "⚠"} ${f.severity} ${f.benchmark}: ${f.detail}`);
  console.log(findings.length === 0
    ? "  verdict: clean — report fresh, every cross-runtime ratio certified work-equivalent ✓"
    : `  verdict: ${findings.length} finding(s), ${critical.length} CRITICAL — a published number is not work-equivalent or the report is stale ✗`);
}
process.exit(findings.length === 0 ? 0 : 3);
