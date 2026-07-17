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
import { benchmarkSpec, isComparable, metricClassOf } from "./throughput-units.mjs";
import { WORK_EQUIVALENCE } from "./work-equivalence.mjs";

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
 * Classify one benchmark by the per-metric-table design (R&D co-design 2026-07-17).
 * Returns { benchmark, shown, category, metricClass, findings[] }. Only cpu-throughput / gpu lanes CAN
 * publish a cross-runtime ratio; governance (no native column), memory (bytes/op) and io (own units)
 * are structurally rendered without one. So an uncertified cpu/gpu lane is shown as UNCERTIFIED (no
 * ratio) — an INFO certification backlog, not a published defect (the blocking checks are staleness +
 * the structural asserts). A benchmark is "shown" cross-runtime iff ≥1 Galerina AND ≥1 native lane ran.
 *   category ∈ certified | shape-only(memory) | internal-ratio(governance) | own-units(io) | uncertified | not-shown
 */
export function classifyBenchmark(entry) {
  const id = entry.benchmark;
  const results = entry.results ?? {};
  const rt = {};
  for (const k of Object.keys(results)) rt[k] = tput(results[k]);

  const nativeRates = [...NATIVE].map((n) => rt[n]).filter((x) => x != null && x > 0);
  const galerinaLanes = [...GALERINA].filter((g) => rt[g] != null && rt[g] > 0);
  const shown = nativeRates.length > 0 && galerinaLanes.length > 0;

  const mc = metricClassOf(id);
  const spec = benchmarkSpec(id);
  const certified = !!spec && isComparable(id) && WORK_EQUIVALENCE[id] === undefined && (mc === "cpu-throughput" || mc === "gpu");

  let category;
  if (!shown) category = "not-shown";
  else if (mc === "governance") category = "internal-ratio";        // no native column in the report
  else if (mc === "memory" || WORK_EQUIVALENCE[id] !== undefined) category = "shape-only"; // bytes/op table
  else if (mc === "io") category = "own-units";                      // own-unit table, no cross-runtime ratio
  else if (certified) category = "certified";
  else category = "uncertified";                                     // cpu/gpu, shown, not yet certified

  const findings = [];
  if (shown && category === "uncertified") {
    const bestNative = Math.max(...nativeRates);
    const gov = rt.galerinaGoverned;
    const slower = gov && gov > 0 ? bestNative / gov : null;
    findings.push({
      code: "uncertified-cpu-lane",
      severity: "INFO",     // the reshape shows it as UNCERTIFIED (no ratio); this is a backlog, not a block
      detail: `${id} (${mc}) is not work-equivalence-certified — shown as UNCERTIFIED (no ratio) pending inner-op + N alignment`
        + (slower != null ? ` [governed ${fmtX(slower)} vs best native — do NOT publish as a ratio]` : ""),
    });
  }
  return { benchmark: id, shown, category, metricClass: mc, findings };
}

function fmtX(r) {
  if (r >= 1e6) return (r / 1e6).toFixed(1) + "M×";
  if (r >= 1e3) return (r / 1e3).toFixed(1) + "K×";
  return r.toFixed(0) + "×";
}

/** Normalize text for a stale-comparison that ignores trailing whitespace / EOL. */
function normalize(s) { return s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n+$/, "\n"); }

/**
 * Structural asserts on the reshaped per-metric report (R&D co-design 2026-07-17). These make the
 * layout invariants a regression guard: an edit that reintroduces a native column into the Governance
 * table (the ⚫1M× vector) or ranks the Memory table by throughput fails closed.
 *   (a) the Governance table has NO native (rust/node/python/cpp) column.
 *   (b) the Memory table is ranked by bytes/op.
 * Pure over the report text (self-tested). Sections only asserted when present (an empty run is fine).
 */
export function structuralFindings(reportText) {
  const out = [];
  const lines = reportText.split("\n");
  const sectionOf = (name) => {
    const re = new RegExp(`^#{2,3}\\s+${name}\\b`);
    let start = lines.findIndex((l) => re.test(l));
    if (start < 0) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) { if (/^#{2,3}\s/.test(lines[i])) { end = i; break; } }
    return lines.slice(start, end).join("\n");
  };
  const headerRow = (sec) => (sec.split("\n").find((l) => l.trim().startsWith("|")) || "");
  const gov = sectionOf("Governance");
  if (gov && /\b(Rust|Node\.js|Python|C\+\+|AVX-?\d)\b/.test(headerRow(gov))) {
    out.push({ scope: "(governance)", code: "governance-has-native-column", severity: "CRITICAL",
      detail: "the Governance table has a native runtime column — a cross-runtime ratio must be structurally impossible there (this is the ⚫1M× artifact vector)" });
  }
  const mem = sectionOf("Memory");
  if (mem && !/bytes?\s*\/\s*op|B\/op/i.test(mem)) {
    out.push({ scope: "(memory)", code: "memory-not-bytes-per-op", severity: "HIGH",
      detail: "the Memory table is not ranked by bytes/op — a memory benchmark ranked by throughput is the cross-metric bug the restructure removes" });
  }
  return out;
}

// ── self-test ────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let ok = 0, fail = 0;
  const check = (cond, what) => { if (cond) ok++; else { fail++; console.error(`  FAIL: ${what}`); } };

  // governance-cost: metricClass governance → the report's governance table has NO native column, so a
  // cross-runtime ratio is structurally impossible → category internal-ratio, NOT flagged (was the ⚫1M×).
  const gc = classifyBenchmark({ benchmark: "governance-cost", results: {
    rust: { iterationsPerSecond: 8.9e8 }, galerinaGoverned: { normThroughput: 826 }, wasm: { normThroughput: 2.9e6 },
  }});
  check(gc.category === "internal-ratio" && gc.findings.length === 0, "governance-cost → internal-ratio, NOT flagged (no native column)");

  // compute-mix: IN SPECS + cpu-throughput → certified → NO finding.
  const cm = classifyBenchmark({ benchmark: "compute-mix", results: {
    nodejs: { normThroughput: 1.35e8 }, galerinaGoverned: { normThroughput: 1.67e6 }, wasm: { normThroughput: 7.7e7 },
  }});
  check(cm.category === "certified" && cm.findings.length === 0, "compute-mix certified → no finding");

  // record-allocation: metricClass memory (+ shape-only) → Memory table by bytes/op → NOT flagged.
  const ra = classifyBenchmark({ benchmark: "record-allocation", results: {
    rustAvx2: { normThroughput: 1.18e9 }, galerinaGoverned: { normThroughput: 2.5e6 }, wasm: { normThroughput: 5.5e8 },
  }});
  check(ra.category === "shape-only" && ra.findings.length === 0, "record-allocation → memory(shape-only), no finding");

  // fibonacci-recursive: cpu-throughput but NOT in SPECS → uncertified → INFO backlog (shown UNCERTIFIED, no ratio).
  const fib = classifyBenchmark({ benchmark: "fibonacci-recursive", results: {
    nodejs: { normThroughput: 50800 }, galerinaGoverned: { normThroughput: 1300 }, wasm: { normThroughput: 17300 },
  }});
  check(fib.category === "uncertified" && fib.findings.every((f) => f.severity === "INFO"),
        "fibonacci-recursive → uncertified cpu lane = INFO backlog (not blocking)");

  // a benchmark with NO native lane (only Galerina) is NOT shown cross-runtime → no finding.
  const noNative = classifyBenchmark({ benchmark: "framework-pipeline", results: {
    galerinaGoverned: { normThroughput: 100 }, wasm: { normThroughput: 200 },
  }});
  check(!noNative.shown && noNative.findings.length === 0, "no native lane → not-shown → no finding");

  // normalize() ignores EOL + trailing ws (so staleness compares content, not Windows checkout artifacts).
  check(normalize("a \r\nb\t\n\n") === normalize("a\nb\n"), "normalize collapses EOL + trailing ws");

  // structuralFindings — the reshaped-report regression guard (governance no-native-col, memory bytes/op).
  check(structuralFindings("### Governance\n| Benchmark | Rust | governed |\n| x | 1 | 2 |\n")
    .some((f) => f.code === "governance-has-native-column"), "governance table WITH a native column fires CRITICAL");
  check(structuralFindings("### Governance — tiers only\n| Benchmark | governed | manifest | ratio |\n| x | 1 | 2 | 0.5× |\n### Memory\n> ranked by bytes/op (lower is better)\n").length === 0,
    "governance tiers-only + memory bytes/op → clean");
  check(structuralFindings("### Memory\n| Benchmark | throughput |\n| x | 9M/s |\n")
    .some((f) => f.code === "memory-not-bytes-per-op"), "memory table WITHOUT bytes/op fires");

  console.log(fail === 0 ? `benchmark-integrity self-test: ${ok}/${ok} ok` : `benchmark-integrity self-test: ${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── main ─────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");
// --stale-only runs Check A alone (report freshness). Wired into phase-close NOW (R&D 2026-07-17): a
// report behind its data is a pure integrity defect and must block, whereas the Check-B ratio/admission
// gate waits until the per-metric-table restructure lands (so it doesn't red-gate mid-adjudication).
const staleOnly = process.argv.includes("--stale-only");
const latestPath = join(ROOT, "results", "latest.json");
const reportPath = join(ROOT, "report.md");

if (!existsSync(latestPath)) { console.error("no results/latest.json — run `npm run run` first"); process.exit(2); }
const data = JSON.parse(readFileSync(latestPath, "utf8"));

const findings = [];

// ── Check A: report staleness ────────────────────────────────────────────────
let staleStatus = "n/a";
let regenReport = null;  // regenerated report text, reused by Check C (structural asserts)
if (!existsSync(reportPath)) {
  findings.push({ benchmark: "(report)", code: "report-missing", severity: "HIGH", detail: "report.md does not exist — run `node src/compare.mjs > report.md`" });
  staleStatus = "missing";
} else {
  try {
    regenReport = execFileSync("node", [join(HERE, "compare.mjs")], { maxBuffer: 1e8 }).toString("utf8");
    const current = readFileSync(reportPath, "utf8");
    if (normalize(regenReport) !== normalize(current)) {
      findings.push({ benchmark: "(report)", code: "report-stale", severity: "HIGH",
        detail: "report.md does NOT match compare.mjs(results/latest.json) — the published report is out of date; regenerate: node src/compare.mjs > report.md" });
      staleStatus = "STALE";
    } else staleStatus = "fresh";
  } catch (e) {
    findings.push({ benchmark: "(report)", code: "report-regen-failed", severity: "HIGH", detail: `could not regenerate report to compare: ${e.message}` });
    staleStatus = "error";
  }
}

// --stale-only: gate on report freshness alone (Check A), skip the ratio/admission gate for now.
if (staleOnly) {
  const stale = findings.filter((f) => f.benchmark === "(report)");
  if (asJson) console.log(JSON.stringify({ staleStatus, findings: stale }, null, 1));
  else console.log(stale.length
    ? `benchmark report STALE (${staleStatus}) — regenerate: node src/compare.mjs > report.md`
    : "benchmark report fresh ✓");
  process.exit(stale.length ? 3 : 0);
}

// ── Check C: structural asserts on the reshaped per-metric report ────────────
if (regenReport) {
  for (const f of structuralFindings(regenReport)) findings.push({ benchmark: f.scope, code: f.code, severity: f.severity, detail: f.detail });
}

// ── Check B: uncertified cross-runtime ratios ────────────────────────────────
const perBench = [];
for (const entry of data) {
  const c = classifyBenchmark(entry);
  perBench.push(c);
  for (const f of c.findings) findings.push({ benchmark: c.benchmark, ...f });
}

// The gate BLOCKS on staleness + structural violations (CRITICAL/HIGH). Uncertified cpu/gpu lanes are
// INFO — a certification backlog shown as UNCERTIFIED in the report, NOT a published defect. Green states
// the per-category surface (R&D 2026-07-17) so the certification story is visible.
const cat = { certified: 0, "shape-only": 0, "internal-ratio": 0, "own-units": 0, uncertified: 0 };
for (const b of perBench) if (b.shown && cat[b.category] !== undefined) cat[b.category]++;
const blocking = findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
const rank = { CRITICAL: 0, HIGH: 1, INFO: 2 };
findings.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
const surface = `${cat.certified} certified · ${cat["shape-only"]} shape-only(→Memory) · ${cat["internal-ratio"]} internal-ratio(Governance) · ${cat["own-units"]} own-units(I/O) · ${cat.uncertified} uncertified`;

if (asJson) {
  console.log(JSON.stringify({ staleStatus, surface: cat, blocking, findings }, null, 1));
} else {
  console.log(`benchmark-integrity audit  (report: ${staleStatus})`);
  console.log(`  categories: ${surface}`);
  for (const f of findings) console.log(`    ${f.severity === "CRITICAL" ? "⛔" : f.severity === "HIGH" ? "⚠" : "·"} ${f.severity} ${f.benchmark}: ${f.detail}`);
  console.log(blocking.length === 0
    ? "  verdict: clean — report fresh · governance has no native column · memory ranked by bytes/op · no uncertified ratio published ✓"
    : `  verdict: ${blocking.length} blocking finding(s) — the report is stale or a per-metric structural invariant is violated ✗`);
}
process.exit(blocking.length === 0 ? 0 : 3);
