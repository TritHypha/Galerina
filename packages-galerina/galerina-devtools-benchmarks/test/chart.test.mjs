// chart.test.mjs — guards the benchmark chart generator (src/chart.mjs). Synthetic (no benchmark
// execution), fast, deterministic. Run via `npm test`. Exits non-zero on any failure (CI gate).
//
// View 2 is GROUPED BY METRIC CLASS (2026-07-17 restructure): CPU throughput / GPU / I/O rank WASM ÷ Node
// WITHIN the class; Memory reports bytes/op (NEVER a throughput ratio) and Governance is a Galerina-internal
// tier ratio (NO native comparison bar). The invariants that matter for a ZERO-TRUST dev tool: the chart is
// a SELF-CONTAINED artifact (no CDN, no <script>, no external fetch — opens offline), the two views each
// render as SVG, the "WASM beats Node" counts are DERIVED from the data (not hardcoded), a memory/governance
// benchmark is never crowned with a bogus cross-runtime bar, labels are HTML-escaped (no injection from a
// benchmark id), and missing/partial data degrades gracefully instead of throwing.
import { buildChartHtml } from "../src/chart.mjs";

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) fails++; };

// One benchmark per metric class (metricClass is stamped by report.mjs now; metricClassOf is the fallback).
// CPU carries two so the derived win-count is non-trivial. binary-trees supplies a WASM·Node PAIR under
// `memory` on purpose — the chart must still refuse to draw it a throughput ratio.
const fixture = {
  baseline: "2026-07-12_test",
  runtimes: ["Node.js", "WASM prod", "Galerina gov"],
  diffFromLast: [
    { benchmark: "compute-mix", runtime: "Python", pre: 1e6, post: 7.2e5, deltaPct: -28 },
    { benchmark: "six-digit-guess", runtime: "Rust", pre: 6e7, post: 7.7e7, deltaPct: 28 },
  ],
  crossLanguage: [
    { benchmark: "compute-mix", metricClass: "cpu-throughput", nodejs: 100e6, wasm: 200e6 },   // WASM 2× (win)
    { benchmark: "call-chain", metricClass: "cpu-throughput", nodejs: 300e6, wasm: 60e6 },      // Node faster
    { benchmark: "binary-trees", metricClass: "memory", nodejs: 83.1e6, wasm: 619.3e6 },        // MEMORY — must NOT get a ratio bar despite the pair
    { benchmark: "gpu-compute", metricClass: "gpu", nodejs: 50e6, wasm: 150e6 },                // WASM 3× (win)
    { benchmark: "json-parse", metricClass: "io", nodejs: 40e6, wasm: 20e6 },                   // Node faster
    { benchmark: "governance-cost", metricClass: "governance", galerinaGoverned: 5e6 },         // GOVERNANCE — internal only, no native bar
  ],
};

const html = buildChartHtml(fixture);

ok(typeof html === "string" && html.length > 500, "produces a non-trivial HTML string");
ok((html.match(/<svg/g) || []).length === 3, "renders THREE views as SVG (WASM-relative + metric-grouped + diff)");
ok((html.match(/<rect/g) || []).length >= 6, "renders bars (>=6 <rect>) for the fixture rows");

// VIEW 0 (owner-requested 2026-07-19): every runtime RELATIVE TO WASM — WASM is the 0 line, a runtime
// faster than WASM is a teal (+) bar to the RIGHT, slower is an orange (−) bar to the LEFT, and each
// test sits in its own tramlined lane. The +/− must be DERIVED from the data, never hardcoded.
ok(html.includes("WASM = 0 baseline"), "WASM-relative view renders the WASM=0 axis heading");
ok(html.includes('class="tram"'), "WASM-relative view draws per-test tramlines");
ok(/fill="#1a9e75"/.test(html) && /fill="#d06a35"/.test(html), "WASM-relative bars show BOTH faster (+, teal) and slower (−, orange), derived from the fixture (call-chain faster, compute-mix slower)");

// SELF-CONTAINED: the zero-trust point — no external dependency of any kind.
ok(!/https?:\/\//.test(html), "no external URL (no CDN / no remote fetch)");
ok(!/<script/i.test(html), "no <script> — pre-rendered SVG, nothing executes");

// GROUPED BY METRIC: one labelled sub-section per non-empty metric class.
for (const h of ["CPU throughput", "Memory", "GPU", "I/O", "Governance"])
  ok(html.includes(h), `renders a "${h}" metric sub-section heading`);

// DERIVED, not hardcoded: exactly the WASM·Node pairs in RATIO classes (cpu 2 + gpu 1 + io 1 = 4) draw a
// ratio bar; the memory pair must NOT. Ratio bars use the teal (win) / gray (lose) fills; diff bars and
// bytes/op bars use other fills, so counting these two proves memory/governance drew no ratio bar.
const ratioBars = (html.match(/fill="#1baf7a"|fill="#8a8880"/g) || []).length;
ok(ratioBars === 4, `only ratio-class WASM·Node pairs draw a ratio bar (expect 4 = cpu 2 + gpu 1 + io 1), got ${ratioBars}`);
ok(html.includes("WASM faster on 1 of 2"), "CPU win-count derived from the data (1 of 2), not hardcoded");

// MEMORY draws NO throughput/native ratio — only a bytes/op note here (no bytes/op data supplied).
ok(html.includes("bytes/op"), "memory class shows a bytes/op note, not a throughput ratio");

// GOVERNANCE draws NO native comparison bar — internal-only note.
ok(html.includes("internal ratio only"), "governance class shows an internal-only note, no native bar");

// Injection safety: a hostile benchmark id must be escaped, never emitted raw.
const evil = buildChartHtml({ crossLanguage: [{ benchmark: "<script>x</script>", nodejs: 10, wasm: 20 }], diffFromLast: [] });
ok(!evil.includes("<script>x"), "escapes a hostile benchmark label (no raw HTML injection)");
ok(!/<script/i.test(evil), "hostile label does not introduce a <script> tag");

// Graceful degradation: empty / missing data must not throw and must still be self-contained.
let threw = false;
try {
  const empty = buildChartHtml({ crossLanguage: [], diffFromLast: [] });
  ok(empty.includes("no benchmark") || empty.includes("empty"), "empty cross-language → a graceful 'no data' note");
  ok(!/https?:\/\//.test(empty), "empty chart is still self-contained");
} catch { threw = true; }
ok(!threw, "empty/missing data does not throw");

console.log(fails === 0 ? "\nchart.test: all invariants hold ✅" : `\nchart.test: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
