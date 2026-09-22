// Pure benchmark report model and Markdown renderer.
// Filesystem access, digest checks and output publication stay in report.mjs.
import { interpretBenchmark } from "./benchmark-interpretation.mjs";
import { benchmarkSpec, metricClassOf } from "./throughput-units.mjs";

export const REPORT_RUNTIMES = Object.freeze([
  Object.freeze({ key: "rustAvx2", label: "Rust AVX2", ranked: true }),
  Object.freeze({ key: "rust", label: "Rust", ranked: true }),
  Object.freeze({ key: "cpp", label: "C++", ranked: true }),
  Object.freeze({ key: "nodejs", label: "Node.js", ranked: true }),
  Object.freeze({ key: "wasm", label: "Galerina/Wasm legacy lane", ranked: true, productionGalerina: false }),
  Object.freeze({ key: "checkedReference", label: "Checked reference - no permission", ranked: false }),
  Object.freeze({ key: "slideReference", label: "SLIDE reference - permission present", ranked: false }),
  Object.freeze({ key: "galerinaGoverned", label: "Galerina governed diagnostic", ranked: false }),
  Object.freeze({ key: "python", label: "Python", ranked: true }),
]);

export function benchmarkRate(result) {
  if (!result || result.error) return null;
  for (const value of [
    result.normThroughput,
    result.operationsPerSecond,
    result.iterationsPerSecond,
    result.additionsPerSecond,
    result.attemptsPerSecond,
    result.callsPerSecond,
    result.runsPerSecond,
  ]) if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return null;
}

export function formatRate(value) {
  if (value === null || value === undefined) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return Number(value).toFixed(0);
}

export function buildCrossLanguageRows(latest, runtimeCatalog = REPORT_RUNTIMES) {
  if (!Array.isArray(latest)) throw new TypeError("latest benchmark result must be an array");
  return latest.map((benchmark) => {
    const spec = benchmarkSpec(benchmark.benchmark);
    const metricClass = typeof benchmark.metricClass === "string" && benchmark.metricClass.length > 0
      ? benchmark.metricClass
      : metricClassOf(benchmark.benchmark);
    const comparisonScope = spec?.comparisonScope ?? "cross-runtime";
    const normalized = { ...benchmark, metricClass, comparisonScope };
    const row = {
      benchmark: benchmark.benchmark,
      metricClass,
      comparisonScope,
      aligned: benchmark.units?.comparable === true && benchmark.units?.status === "PASS",
      unit: benchmark.units?.unit ?? "per-call",
      scoreUnit: metricClass === "memory" ? "heap bytes/op" : (benchmark.units?.unit ?? "per-call"),
    };
    for (const runtime of runtimeCatalog) row[runtime.key] = benchmarkRate(benchmark.results?.[runtime.key]);
    row.interpretation = interpretBenchmark(normalized, runtimeCatalog);
    return row;
  });
}

function markdown(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function formatScore(row, runtimeKey) {
  if (row.metricClass !== "memory") return formatRate(row[runtimeKey]);
  const value = row.interpretation.memoryBytesPerOp[runtimeKey];
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 0) return `noise (${value.toFixed(2)})`;
  if (value === 0) return "0.00";
  if (value < 0.001) return "<0.001";
  if (value < 1) return value.toFixed(3);
  if (value < 1024) return value.toFixed(2);
  return `${(value / 1024).toFixed(2)} KiB`;
}

function renderTransition(transition) {
  let output = "## 3. Galerina/SLIDE versus archived Galerina/Wasm\n\n";
  output += `Status: \`${markdown(transition.status)}\`. Frozen baseline: \`${markdown(transition.archiveDirectory)}\`.\n\n`;
  if (transition.status === "DEFERRED_NO_SLIDE_LANE") {
    output += "No production `slide` lane is present. The next executable-backend run will compare its Galerina/SLIDE measurements with the frozen Galerina/Wasm archive; no old Wasm rerun will replace that evidence.\n\n";
  } else {
    output += "| Benchmark | Unit | Better | Archived Galerina/Wasm | Current Galerina/SLIDE | Improvement | Outcome |\n";
    output += "|---|---|---|---:|---:|---:|---|\n";
    for (const row of transition.rows) {
      output += `| ${markdown(row.benchmark)} | ${markdown(row.unit)} | ${markdown(row.direction)} | ${formatRate(row.baseline)} | ${formatRate(row.candidate)} | ${row.improvementFactor.toFixed(2)}x | ${markdown(row.outcome)} |\n`;
    }
    if (transition.rows.length === 0) output += "| _No admitted pairs_ | — | — | — | — | — | — |\n";
    if (transition.exclusions.length > 0) {
      output += "\nExcluded without a ratio:\n\n";
      for (const exclusion of transition.exclusions) output += `- ${markdown(exclusion.benchmark)}: ${markdown(exclusion.reason)}\n`;
    }
    output += "\n";
  }
  output += "This transition evidence compares performance only. It does not release production authority.\n";
  return output;
}

export function buildReportMarkdown({ baseline, diffFromLast, crossLanguage, slideTransition }) {
  let output = "# Benchmark report — interpreted views\n\n";
  output += `Current run: \`results/latest.json\`. Baseline (last distinct run): ${markdown(baseline ?? "none")}.\n\n`;
  output += "## How to read this report\n\n";
  output += "- **Higher is better** for admitted throughput rates such as operations, records or requests per second.\n";
  output += "- **Lower is better** for memory allocation measured as heap bytes per operation. Throughput shown on those rows is secondary and does not choose the winner.\n";
  output += "- **✅ means the workload is work-equivalent and unit-aligned for cross-runtime ranking; it does not mean Galerina won.**\n";
  output += "- A row without ✅ may show observations, but it receives no admitted winner or product place.\n";
  output += "- The production Galerina place remains unmeasured until an admitted `slide` lane exists. The legacy Wasm lane remains ranked historical evidence; neither it nor the diagnostic interpreter may claim that product place.\n\n";
  output += "- **Checked reference - no permission** and **SLIDE reference - permission present** are non-authorizing laboratory observations. They are visible for the one-million-loop comparison but cannot win or count as Galerina production.\n\n";

  output += "## 1. Difference from the last run\n\n";
  if (diffFromLast.length > 0) {
    const absolute = diffFromLast.map((row) => Math.abs(row.deltaPct)).sort((left, right) => left - right);
    const overTen = diffFromLast.filter((row) => Math.abs(row.deltaPct) > 10).length;
    const median = absolute[Math.floor(absolute.length / 2)];
    output += `${diffFromLast.length} runtime·benchmark pairs · median |Δ| ${median.toFixed(1)}% · >10%: ${overTen}. Higher throughput is better; a positive Δ means a higher measured rate, not automatically a causal improvement.\n\n`;
    output += "| Benchmark | Runtime | Last | Now | Δ% |\n|---|---|--:|--:|--:|\n";
    for (const row of diffFromLast.slice(0, 20)) {
      output += `| ${markdown(row.benchmark)} | ${markdown(row.runtime)} | ${formatRate(row.pre)} | ${formatRate(row.post)} | ${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}% |\n`;
    }
  } else output += "_No prior distinct snapshot to diff against._\n";

  output += "\n## 2. Cross-language (current run)\n\n";
  output += `| Benchmark | Unit | Better | Winner | Galerina/SLIDE production place | Comment | ${REPORT_RUNTIMES.map((runtime) => runtime.label).join(" | ")} |\n`;
  output += `|---|---|---|---|---|---|${REPORT_RUNTIMES.map(() => "--:").join("|")}|\n`;
  for (const row of crossLanguage) {
    const interpretation = row.interpretation;
    output += `| ${markdown(row.benchmark)}${row.aligned ? " ✅" : ""} | ${markdown(row.scoreUnit)} | ${markdown(interpretation.direction)} | ${markdown(interpretation.winner)} | ${markdown(interpretation.galerinaPlace)} | ${markdown(interpretation.explanation)} | ${REPORT_RUNTIMES.map((runtime) => formatScore(row, runtime.key)).join(" | ")} |\n`;
  }
  output += "\n";
  output += renderTransition(slideTransition);
  return output;
}
