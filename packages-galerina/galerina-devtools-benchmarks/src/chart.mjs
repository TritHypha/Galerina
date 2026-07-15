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
// Usage:  node src/chart.mjs            # regenerate the chart from the latest report
//         (report.mjs calls it automatically as its last step)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtX = (v) => (v >= 10 ? Math.round(v) : v.toFixed(2)) + "×";
const fmtPct = (v) => (v >= 0 ? "+" : "") + v.toFixed(0) + "%";

// ── View 2: the "where Galerina's production path lands" chart — WASM ÷ Node, log scale ──
function ratioChart(crossLanguage) {
  const rows = crossLanguage
    .map((r) => (typeof r.wasm === "number" && typeof r.nodejs === "number" && r.nodejs > 0)
      ? { label: r.benchmark, ratio: r.wasm / r.nodejs } : null)
    .filter(Boolean)
    .sort((a, b) => b.ratio - a.ratio);
  if (!rows.length) return `<p class="empty">no WASM·Node pairs to chart</p>`;

  const W = 820, LEFT = 200, RIGHT = 60, rowH = 26, padTop = 8;
  const plotW = W - LEFT - RIGHT, H = rows.length * rowH + padTop + 28;
  const LO = 0.15, HI = 200;                                    // log domain (0.19× .. 144×)
  const lg = (v) => Math.log10(Math.max(LO, Math.min(HI, v)));
  const x = (v) => LEFT + ((lg(v) - lg(LO)) / (lg(HI) - lg(LO))) * plotW;
  const x1 = x(1);                                              // Node-parity line

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="WASM production speed divided by Node speed per benchmark, log scale; bars right of the 1x line mean WASM is faster">`;
  for (const t of [0.2, 1, 10, 100]) {                         // log gridlines + ticks
    const gx = x(t).toFixed(1);
    svg += `<line x1="${gx}" y1="${padTop}" x2="${gx}" y2="${H - 28}" class="grid"${t === 1 ? ' stroke-dasharray="4 3"' : ""}/>`;
    svg += `<text x="${gx}" y="${H - 14}" class="tick" text-anchor="middle">${t}×</text>`;
  }
  svg += `<text x="${x1.toFixed(1)}" y="${H - 2}" class="tick" text-anchor="middle">Node parity</text>`;
  rows.forEach((r, i) => {
    const y = padTop + i * rowH, bx = x(r.ratio), win = r.ratio >= 1;
    const bl = Math.min(x1, bx), bw = Math.abs(bx - x1);
    svg += `<rect x="${bl.toFixed(1)}" y="${y + 4}" width="${Math.max(1, bw).toFixed(1)}" height="${rowH - 10}" rx="3" fill="${win ? "#1baf7a" : "#8a8880"}"/>`;
    svg += `<text x="${LEFT - 8}" y="${y + rowH / 2 + 3}" class="lbl" text-anchor="end">${esc(r.label)}</text>`;
    const tx = win ? bx + 5 : bx - 5;
    svg += `<text x="${tx.toFixed(1)}" y="${y + rowH / 2 + 3}" class="val" text-anchor="${win ? "start" : "end"}">${fmtX(r.ratio)}</text>`;
  });
  svg += `</svg>`;
  const wins = rows.filter((r) => r.ratio >= 1).length;
  return { svg, caption: `WASM production path beats Node on ${wins} of ${rows.length} comparable benchmarks (teal = WASM faster · gray = Node's JIT faster · dashed = Node parity).` };
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
  const v2 = ratioChart(report.crossLanguage ?? []);
  const v1 = diffChart(report.diffFromLast ?? []);
  const style = `<style>
  .bench-chart{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:900px;margin:0 auto;padding:1rem;color:#1a1a19}
  .bench-chart h1{font-size:20px;font-weight:500;margin:0 0 4px}.bench-chart h2{font-size:16px;font-weight:500;margin:1.6rem 0 2px}
  .bench-chart .sub{font-size:13px;color:#6b6a64;margin:0 0 10px}.bench-chart .empty{color:#8a8880;font-size:13px}
  .bench-chart svg .grid{stroke:#d8d6cf;stroke-width:1}.bench-chart svg .tick{fill:#8a8880;font-size:11px}
  .bench-chart svg .lbl{fill:#3a3a37;font-size:12px}.bench-chart svg .val{fill:#6b6a64;font-size:11px;font-weight:500}
  @media (prefers-color-scheme:dark){.bench-chart{color:#e8e7e0}.bench-chart .sub{color:#a3a29a}
    .bench-chart svg .grid{stroke:#3a3a37}.bench-chart svg .lbl{fill:#c9c8c0}.bench-chart svg .val{fill:#a3a29a}}
  </style>`;
  return `<!doctype html><meta charset="utf-8"><title>Galerina benchmark chart</title>${style}
<div class="bench-chart">
  <h1>Galerina benchmark — two views</h1>
  <p class="sub">Baseline: ${esc(report.baseline ?? "none")}. Pre-rendered SVG · no external dependency · opens offline.</p>
  <h2>Where the production path lands — WASM ÷ Node</h2>
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
  const pairs = (report.crossLanguage ?? []).filter((r) => typeof r.wasm === "number" && typeof r.nodejs === "number" && r.nodejs > 0).length;
  console.log(`✅ chart: results/benchmark-chart-latest.html (${pairs} WASM·Node pairs · ${(report.diffFromLast ?? []).length} diff rows · self-contained SVG)`);
}
