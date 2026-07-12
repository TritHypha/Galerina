// =============================================================================
// report.mjs — the benchmark's TWO comparison views, from one command:
//   1. DIFF from the last time — current run vs the most recent DIFFERENT archive
//      snapshot (auto-found), per runtime·benchmark, sorted by |Δ%|.
//   2. Cross-LANGUAGE — every runtime's throughput per benchmark, current run.
//
// Writes a human report (results/benchmark-report-latest.md) AND chart-ready data
// (results/benchmark-report-latest.json: { diffFromLast, crossLanguage }) so the
// two charts can be rendered without re-deriving. Prints a terminal summary.
//
// Workflow: `npm run run` (→ results/latest.json) → `npm run report` (this) →
//           `npm run snapshot -- <label>` (archive the current run as the next baseline).
// Usage: npm run report [-- --baseline <archive-dir-name>]
// =============================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const resultsDir = join(root, "results");
const latestPath = join(resultsDir, "latest.json");
if (!existsSync(latestPath)) { console.error("no results/latest.json — run `npm run run` (full) first"); process.exit(2); }
const latestRaw = readFileSync(latestPath, "utf8");
const latest = JSON.parse(latestRaw);

// throughput extractor (same canonical order as compare.mjs)
const tput = (r) => r ? (r.normThroughput ?? r.operationsPerSecond ?? r.iterationsPerSecond ?? r.additionsPerSecond ?? r.attemptsPerSecond ?? r.callsPerSecond ?? r.runsPerSecond ?? null) : null;
const RT = [["rustAvx2", "Rust AVX2"], ["rust", "Rust"], ["cpp", "C++"], ["nodejs", "Node.js"], ["wasm", "WASM prod"], ["galerinaGoverned", "Galerina gov"], ["python", "Python"]];
const fmt = (v) => v == null ? "—" : v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0);

// ── find the "last time" baseline: the most recent archive snapshot whose bytes DIFFER from the current
//    run (snapshot.mjs copies latest.json byte-for-byte, so the current run's own snapshot is skipped). ──
const archiveDir = join(resultsDir, "archive");
const argBase = process.argv.indexOf("--baseline");
let baseline = null, baselineLabel = null;
if (argBase !== -1 && process.argv[argBase + 1]) {
  const p = join(archiveDir, process.argv[argBase + 1], "results.json");
  if (existsSync(p)) { baseline = JSON.parse(readFileSync(p, "utf8")); baselineLabel = process.argv[argBase + 1]; }
} else if (existsSync(archiveDir)) {
  const snaps = readdirSync(archiveDir).filter((d) => existsSync(join(archiveDir, d, "results.json"))).sort().reverse();
  for (const s of snaps) {
    const raw = readFileSync(join(archiveDir, s, "results.json"), "utf8");
    if (raw !== latestRaw) { baseline = JSON.parse(raw); baselineLabel = s; break; }
  }
}

// ── view 1: diff from last ──
const diffFromLast = [];
if (baseline) {
  const preMap = new Map(baseline.map((b) => [b.benchmark, b.results]));
  for (const b of latest) {
    const pr = preMap.get(b.benchmark); if (!pr) continue;
    for (const [k, label] of RT) {
      const a = tput(pr[k]), c = tput(b.results[k]);
      if (typeof a === "number" && typeof c === "number" && a > 0) diffFromLast.push({ benchmark: b.benchmark, runtime: label, pre: a, post: c, deltaPct: ((c - a) / a) * 100 });
    }
  }
  diffFromLast.sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct));
}

// ── view 2: cross-language ──
const crossLanguage = latest.map((b) => {
  const row = { benchmark: b.benchmark, aligned: b.units ? b.units.comparable !== false : false, unit: b.units?.unit ?? "per-call" };
  for (const [k] of RT) row[k] = tput(b.results[k]);
  return row;
});

// ── write the human report ──
let md = `# Benchmark report — two views\n\n`;
md += `Current run: results/latest.json. Baseline ("last time"): ${baselineLabel ?? "none (first run — no diff)"}.\n\n`;
md += `## 1. Difference from the last run\n\n`;
if (diffFromLast.length) {
  const gt10 = diffFromLast.filter((r) => Math.abs(r.deltaPct) > 10).length;
  const med = diffFromLast.map((r) => Math.abs(r.deltaPct)).sort((a, b) => a - b)[Math.floor(diffFromLast.length / 2)];
  md += `${diffFromLast.length} runtime·benchmark pairs · median |Δ| ${med.toFixed(1)}% · >10%: ${gt10}.\n\n| Benchmark | Runtime | last | now | Δ% |\n|---|---|--:|--:|--:|\n`;
  for (const r of diffFromLast.slice(0, 20)) md += `| ${r.benchmark} | ${r.runtime} | ${fmt(r.pre)} | ${fmt(r.post)} | ${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}% |\n`;
} else md += `_No prior distinct snapshot to diff against._\n`;
md += `\n## 2. Cross-language (current run)\n\n| Benchmark | unit | ${RT.map((r) => r[1]).join(" | ")} |\n|---|---|${RT.map(() => "--:").join("|")}|\n`;
for (const r of crossLanguage) md += `| ${r.benchmark}${r.aligned ? " ✅" : ""} | ${r.unit} | ${RT.map(([k]) => fmt(r[k])).join(" | ")} |\n`;
writeFileSync(join(resultsDir, "benchmark-report-latest.md"), md);
writeFileSync(join(resultsDir, "benchmark-report-latest.json"), JSON.stringify({ baseline: baselineLabel, runtimes: RT.map((r) => r[1]), diffFromLast, crossLanguage }, null, 2));

console.log(`✅ report: results/benchmark-report-latest.{md,json}`);
console.log(`   view 1 — diff vs "${baselineLabel ?? "none"}": ${diffFromLast.length} pairs${diffFromLast.length ? ` (top: ${diffFromLast[0].benchmark}/${diffFromLast[0].runtime} ${diffFromLast[0].deltaPct >= 0 ? "+" : ""}${diffFromLast[0].deltaPct.toFixed(0)}%)` : ""}`);
console.log(`   view 2 — cross-language: ${crossLanguage.filter((r) => r.aligned).length} aligned benchmarks × ${RT.length} runtimes`);
