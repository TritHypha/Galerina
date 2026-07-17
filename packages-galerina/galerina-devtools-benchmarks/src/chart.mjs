// =============================================================================
// chart.mjs — render the benchmark's two views to a self-contained HTML chart.
//   Reads results/benchmark-report-latest.json (the chart-ready data report.mjs
//   emits: { baseline, runtimes, diffFromLast, crossLanguage }) and writes
//   results/benchmark-chart-latest.html.
//
// Zero-trust dev tool: the chart is PRE-RENDERED SVG — no CDN, no client JS, no
// node_modules charting dep. The output is a static file that opens offline in
// any browser and adapts to light/dark. `buildChartHtml(report)` is exported so
// report.mjs can call it; running this file standalone regenerates from the JSON.
//
// View 2 is GROUPED BY METRIC CLASS (2026-07-17 restructure): cramming every
// benchmark into ONE throughput ranking produced false comparisons — a memory or
// governance benchmark has no honest throughput rank. Each metric class is now a
// labelled sub-section inside one SVG: CPU throughput / GPU / I/O rank WASM ÷ Node
// WITHIN the class; Memory reports bytes/op (NEVER a throughput ratio); Governance
// is a Galerina-internal tier ratio with NO native comparison bar.
//
// Usage:  node src/chart.mjs            # regenerate the chart from the latest report
//         (report.mjs calls it automatically as its last step)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { metricClassOf, METRIC_ORDER } from "./throughput-units.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtX = (v) => (v >= 10 ? Math.round(v) : v.toFixed(2)) + "×";
const fmtPct = (v) => (v >= 0 ? "+" : "") + v.toFixed(0) + "%";
const fmtBytes = (v) => v >= 1e9 ? (v / 1e9).toFixed(1) + "GB" : v >= 1e6 ? (v / 1e6).toFixed(1) + "MB" : v >= 1e3 ? (v / 1e3).toFixed(1) + "KB" : Math.round(v) + "B";

// Human heading per metric class. RATIO_METRICS draw a WASM÷Node bar race WITHIN the
// class; MEMORY and GOVERNANCE deliberately never draw a cross-runtime/throughput bar
// (ranking them by throughput was the false-comparison bug this restructure fixes).
const METRIC_LABEL = {
  "cpu-throughput": "CPU throughput",
  "memory": "Memory",
  "gpu": "GPU",
  "io": "I/O",
  "governance": "Governance",
};
const RATIO_METRICS = new Set(["cpu-throughput", "gpu", "io"]);

// ── View 2: results grouped by metric class — one labelled sub-section per non-empty
//    class, all rendered into ONE self-contained SVG (light/dark). CPU/GPU/IO show the
//    WASM ÷ Node ratio per benchmark (log scale; right of the dashed line = WASM faster).
//    Memory shows bytes/op if the data carries it, else a note — NEVER a throughput ratio.
//    Governance shows an internal-only note — NEVER a native comparison bar. ──
function metricChart(crossLanguage) {
  const all = Array.isArray(crossLanguage) ? crossLanguage : [];
  if (!all.length) return { svg: `<p class="empty">no benchmark data to chart</p>`, caption: "" };

  // Group rows by metric class. Prefer the additive row.metricClass (report.mjs stamps it),
  // fall back to metricClassOf(benchmark) so an older report without the field still groups.
  const groups = new Map(METRIC_ORDER.map((m) => [m, []]));
  for (const r of all) {
    const mc = (typeof r.metricClass === "string" && r.metricClass) ? r.metricClass : metricClassOf(r.benchmark);
    if (!groups.has(mc)) groups.set(mc, []);
    groups.get(mc).push(r);
  }

  const W = 820, LEFT = 210, RIGHT = 64, plotW = W - LEFT - RIGHT;
  const rowH = 24, headingH = 34, tickH = 20, groupGap = 18, padTop = 10;
  const LO = 0.15, HI = 200;                                    // log domain for the ratio classes
  const lg = (v) => Math.log10(Math.max(LO, Math.min(HI, v)));
  const x = (v) => LEFT + ((lg(v) - lg(LO)) / (lg(HI) - lg(LO))) * plotW;
  const x1 = x(1);                                              // Node-parity line

  let body = "", y = padTop, sections = 0, totalWins = 0, totalPairs = 0;

  const heading = (mc) => `<text x="0" y="${(y + 16).toFixed(1)}" class="mh">${esc(METRIC_LABEL[mc] ?? mc)}</text>`;
  const label = (text, ry) => `<text x="${LEFT - 8}" y="${(ry + rowH / 2 + 3).toFixed(1)}" class="lbl" text-anchor="end">${esc(text)}</text>`;
  const note = (text, ry) => `<text x="${LEFT + 6}" y="${(ry + rowH / 2 + 3).toFixed(1)}" class="note" text-anchor="start">${esc(text)}</text>`;

  for (const mc of METRIC_ORDER) {
    const g = groups.get(mc) || [];
    if (!g.length) continue;                                   // only non-empty metric classes get a sub-section
    sections++;
    body += heading(mc);
    const bandTop = y + headingH - 6;

    if (RATIO_METRICS.has(mc)) {
      // ── CPU / GPU / I/O: WASM ÷ Node ratio per benchmark, ranked WITHIN this class ──
      const paired = [], unpaired = [];
      for (const r of g) {
        if (typeof r.wasm === "number" && typeof r.nodejs === "number" && r.nodejs > 0)
          paired.push({ label: r.benchmark, ratio: r.wasm / r.nodejs });
        else unpaired.push({ label: r.benchmark });
      }
      paired.sort((a, b) => b.ratio - a.ratio);
      const wins = paired.filter((r) => r.ratio >= 1).length;
      totalWins += wins; totalPairs += paired.length;
      if (paired.length) body += `<text x="${W}" y="${(y + 16).toFixed(1)}" class="sum" text-anchor="end">WASM faster on ${wins} of ${paired.length}</text>`;

      const ordered = [...paired, ...unpaired];
      const bandBottom = bandTop + ordered.length * rowH;
      if (paired.length) {                                     // draw the log axis only when there is at least one bar
        for (const t of [0.2, 1, 10, 100]) {
          const gx = x(t).toFixed(1);
          body += `<line x1="${gx}" y1="${bandTop.toFixed(1)}" x2="${gx}" y2="${bandBottom.toFixed(1)}" class="grid"${t === 1 ? ' stroke-dasharray="4 3"' : ""}/>`;
          body += `<text x="${gx}" y="${(bandBottom + 13).toFixed(1)}" class="tick" text-anchor="middle">${t}×</text>`;
        }
      }
      ordered.forEach((r, i) => {
        const ry = bandTop + i * rowH;
        body += label(r.label, ry);
        if (typeof r.ratio === "number") {
          const bx = x(r.ratio), win = r.ratio >= 1;
          const bl = Math.min(x1, bx), bw = Math.max(1, Math.abs(bx - x1));
          body += `<rect x="${bl.toFixed(1)}" y="${(ry + 4).toFixed(1)}" width="${bw.toFixed(1)}" height="${rowH - 10}" rx="3" fill="${win ? "#1baf7a" : "#8a8880"}"/>`;
          const tx = win ? bx + 5 : bx - 5;
          body += `<text x="${tx.toFixed(1)}" y="${(ry + rowH / 2 + 3).toFixed(1)}" class="val" text-anchor="${win ? "start" : "end"}">${fmtX(r.ratio)}</text>`;
        } else {
          body += note("no WASM·Node pair", ry);              // benchmark in-class but no comparable pair — shown, not silently dropped
        }
      });
      y = bandBottom + (paired.length ? tickH : 0) + groupGap;
    } else if (mc === "memory") {
      // ── Memory: bytes/op is the honest metric (lower = better) — NEVER a throughput ratio. ──
      const withBytes = g.filter((r) => typeof r.bytesPerOp === "number" && r.bytesPerOp > 0);
      if (withBytes.length) {
        const maxB = Math.max(...withBytes.map((r) => r.bytesPerOp));
        const sorted = [...g].sort((a, b) => (typeof a.bytesPerOp === "number" ? a.bytesPerOp : Infinity) - (typeof b.bytesPerOp === "number" ? b.bytesPerOp : Infinity));
        sorted.forEach((r, i) => {
          const ry = bandTop + i * rowH;
          body += label(r.benchmark, ry);
          if (typeof r.bytesPerOp === "number" && r.bytesPerOp > 0) {
            const bw = Math.max(1, (r.bytesPerOp / maxB) * plotW);
            body += `<rect x="${LEFT}" y="${(ry + 4).toFixed(1)}" width="${bw.toFixed(1)}" height="${rowH - 10}" rx="3" fill="#c8963e"/>`;
            body += `<text x="${(LEFT + bw + 5).toFixed(1)}" y="${(ry + rowH / 2 + 3).toFixed(1)}" class="val" text-anchor="start">${fmtBytes(r.bytesPerOp)}/op</text>`;
          } else {
            body += note("bytes/op — see report §2", ry);
          }
        });
        y = bandTop + sorted.length * rowH + groupGap;
      } else {
        g.forEach((r, i) => {
          const ry = bandTop + i * rowH;
          body += label(r.benchmark, ry);
          body += note("memory (bytes/op) — see report §2", ry);  // no throughput ratio for a memory benchmark
        });
        y = bandTop + g.length * rowH + groupGap;
      }
    } else if (mc === "governance") {
      // ── Governance: Galerina-internal governed/manifest tier ratio ONLY. The governance table has
      //    NO native column, so a cross-runtime bar is structurally unrepresentable — never draw one. ──
      g.forEach((r, i) => {
        const ry = bandTop + i * rowH;
        body += label(r.benchmark, ry);
        body += note("internal ratio only — governed/manifest tiers (see report)", ry);
      });
      y = bandTop + g.length * rowH + groupGap;
    } else {
      // Unknown class (METRIC_ORDER is exhaustive, so this is defensive): list labels safely, no bars.
      g.forEach((r, i) => { const ry = bandTop + i * rowH; body += label(r.benchmark, ry); });
      y = bandTop + g.length * rowH + groupGap;
    }
  }

  const H = Math.round(y + 6);
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Benchmark results grouped by metric class; CPU throughput, GPU and I/O show the WASM-over-Node ratio per benchmark, while Memory (bytes/op) and Governance (internal tier ratio) carry no cross-runtime bar">${body}</svg>`;
  const comparable = totalPairs ? `WASM production path beats Node on ${totalWins} of ${totalPairs} comparable ratio-class benchmarks. ` : "";
  const caption = `${comparable}Grouped by metric — each class is ranked within itself, never across metrics. CPU throughput · GPU · I/O compare WASM ÷ Node (teal = WASM faster · gray = Node's JIT faster · dashed = Node parity); Memory reports bytes/op and Governance is a Galerina-internal tier ratio — neither carries a cross-runtime bar.`;
  return { svg, caption };
}

// ── View 1: difference from the last run — the notable movers, diverging bars ──
function diffChart(diffFromLast) {
  if (!diffFromLast || !diffFromLast.length) return { svg: `<p class="empty">no prior snapshot to diff against</p>`, caption: "" };
  const rows = diffFromLast.slice(0, 14).map((r) => ({ label: `${r.benchmark} · ${r.runtime}`, d: r.deltaPct }));
  const W = 820, MID = W / 2, rowH = 26, padTop = 8, half = 330;
  const H = rows.length * rowH + padTop + 8;
  const CAP = 30;                                              // clamp the axis to ±30%
  const x = (d) => MID + (Math.max(-CAP, Math.min(CAP, d)) / CAP) * half;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Percent change from the last run for the top movers; right of center is faster, left is slower">`;
  svg += `<line x1="${MID}" y1="${padTop}" x2="${MID}" y2="${H - 4}" class="grid"/>`;
  rows.forEach((r, i) => {
    const y = padTop + i * rowH, bx = x(r.d), faster = r.d >= 0;
    const bl = Math.min(MID, bx), bw = Math.abs(bx - MID);
    svg += `<rect x="${bl.toFixed(1)}" y="${y + 4}" width="${Math.max(1, bw).toFixed(1)}" height="${rowH - 10}" rx="3" fill="${faster ? "#1a9e75" : "#d85a30"}"/>`;
    const tx = faster ? bx + 5 : bx - 5;
    svg += `<text x="${tx.toFixed(1)}" y="${y + rowH / 2 + 3}" class="val" text-anchor="${faster ? "start" : "end"}">${fmtPct(r.d)}</text>`;
    svg += `<text x="${(faster ? MID - 5 : MID + 5).toFixed(1)}" y="${y + rowH / 2 + 3}" class="lbl" text-anchor="${faster ? "end" : "start"}">${esc(r.label)}</text>`;
  });
  svg += `</svg>`;
  return { svg, caption: "Read against the noise floor: single-run cross-session diffs are dominated by machine variance (untouched native controls routinely swing ±20–28%), not code — see the harness-standardisation note." };
}

export function buildChartHtml(report) {
  const v2 = metricChart(report.crossLanguage ?? []);
  const v1 = diffChart(report.diffFromLast ?? []);
  const style = `<style>
  .bench-chart{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:900px;margin:0 auto;padding:1rem;color:#1a1a19}
  .bench-chart h1{font-size:20px;font-weight:500;margin:0 0 4px}.bench-chart h2{font-size:16px;font-weight:500;margin:1.6rem 0 2px}
  .bench-chart .sub{font-size:13px;color:#6b6a64;margin:0 0 10px}.bench-chart .empty{color:#8a8880;font-size:13px}
  .bench-chart svg .grid{stroke:#d8d6cf;stroke-width:1}.bench-chart svg .tick{fill:#8a8880;font-size:11px}
  .bench-chart svg .lbl{fill:#3a3a37;font-size:12px}.bench-chart svg .val{fill:#6b6a64;font-size:11px;font-weight:500}
  .bench-chart svg .mh{fill:#1a1a19;font-size:14px;font-weight:600}.bench-chart svg .sum{fill:#6b6a64;font-size:11px}
  .bench-chart svg .note{fill:#8a8880;font-size:11px;font-style:italic}
  @media (prefers-color-scheme:dark){.bench-chart{color:#e8e7e0}.bench-chart .sub{color:#a3a29a}
    .bench-chart svg .grid{stroke:#3a3a37}.bench-chart svg .lbl{fill:#c9c8c0}.bench-chart svg .val{fill:#a3a29a}
    .bench-chart svg .mh{fill:#e8e7e0}.bench-chart svg .sum{fill:#a3a29a}.bench-chart svg .note{fill:#9a9992}}
  </style>`;
  return `<!doctype html><meta charset="utf-8"><title>Galerina benchmark chart</title>${style}
<div class="bench-chart">
  <h1>Galerina benchmark — two views</h1>
  <p class="sub">Baseline: ${esc(report.baseline ?? "none")}. Pre-rendered SVG · no external dependency · opens offline.</p>
  <h2>Results by metric class</h2>
  <p class="sub">${esc(v2.caption ?? "")}</p>
  ${v2.svg ?? v2}
  <h2>Difference from the last run</h2>
  <p class="sub">${esc(v1.caption ?? "")}</p>
  ${v1.svg ?? v1}
</div>`;
}

// ── standalone entry ──
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("chart.mjs")) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const reportPath = join(root, "results", "benchmark-report-latest.json");
  if (!existsSync(reportPath)) { console.error("no results/benchmark-report-latest.json — run `npm run report` first"); process.exit(2); }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const outPath = join(root, "results", "benchmark-chart-latest.html");
  writeFileSync(outPath, buildChartHtml(report));
  const cl = report.crossLanguage ?? [];
  const classes = new Set(cl.map((r) => (typeof r.metricClass === "string" && r.metricClass) ? r.metricClass : metricClassOf(r.benchmark)));
  const pairs = cl.filter((r) => typeof r.wasm === "number" && typeof r.nodejs === "number" && r.nodejs > 0).length;
  console.log(`✅ chart: results/benchmark-chart-latest.html (${classes.size} metric classes · ${pairs} WASM·Node pairs · ${(report.diffFromLast ?? []).length} diff rows · self-contained SVG)`);
}
