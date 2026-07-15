// chart.test.mjs — guards the benchmark chart generator (src/chart.mjs). Synthetic (no benchmark
// execution), fast, deterministic. Run via `npm test`. Exits non-zero on any failure (CI gate).
//
// The invariants that matter for a ZERO-TRUST dev tool: the chart is a SELF-CONTAINED artifact
// (no CDN, no <script>, no external fetch — opens offline), the "WASM beats Node" count is derived
// correctly from the data (not hardcoded), labels are HTML-escaped (no injection from a benchmark id),
// and missing/partial data degrades gracefully instead of throwing.
import { buildChartHtml } from "../src/chart.mjs";

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) fails++; };

const fixture = {
  baseline: "2026-07-12_test",
  runtimes: ["Node.js", "WASM prod", "Galerina gov"],
  diffFromLast: [
    { benchmark: "compute-mix", runtime: "Python", pre: 1e6, post: 7.2e5, deltaPct: -28 },
    { benchmark: "six-digit-guess", runtime: "Rust", pre: 6e7, post: 7.7e7, deltaPct: 28 },
  ],
  crossLanguage: [
    { benchmark: "record-allocation", nodejs: 58.6e6, wasm: 578.4e6 },  // WASM wins ~9.9x
    { benchmark: "binary-trees", nodejs: 83.1e6, wasm: 619.3e6 },       // WASM wins ~7.5x
    { benchmark: "compute-mix", nodejs: 143e6, wasm: 81.8e6 },          // Node wins
    { benchmark: "call-chain", nodejs: 293.8e6, wasm: 57.2e6 },         // Node wins
    { benchmark: "spectral-norm", nodejs: 245.3e6, wasm: null },        // no pair — skipped
  ],
};

const html = buildChartHtml(fixture);

ok(typeof html === "string" && html.length > 500, "produces a non-trivial HTML string");
ok((html.match(/<svg/g) || []).length === 2, "renders both views as SVG (2 <svg> blocks)");
ok((html.match(/<rect/g) || []).length >= 6, "renders bars (>=6 <rect>) for the fixture rows");

// SELF-CONTAINED: the zero-trust point — no external dependency of any kind.
ok(!/https?:\/\//.test(html), "no external URL (no CDN / no remote fetch)");
ok(!/<script/i.test(html), "no <script> — pre-rendered SVG, nothing executes");

// Derived, not hardcoded: 2 of the 4 WASM·Node pairs win (record-allocation, binary-trees).
ok(html.includes("beats Node on 2 of 4"), "WASM-wins count derived from the data (2 of 4 pairs)");
ok(html.includes("9.9×") || html.includes("10×"), "labels the record-allocation ratio (~9.9x)");

// Injection safety: a hostile benchmark id must be escaped, never emitted raw.
const evil = buildChartHtml({ crossLanguage: [{ benchmark: "<script>x</script>", nodejs: 10, wasm: 20 }], diffFromLast: [] });
ok(!evil.includes("<script>x"), "escapes a hostile benchmark label (no raw HTML injection)");

// Graceful degradation: empty / missing data must not throw and must still be self-contained.
let threw = false;
try {
  const empty = buildChartHtml({ crossLanguage: [], diffFromLast: [] });
  ok(empty.includes("no WASM") || empty.includes("empty"), "empty cross-language → a graceful 'no data' note");
  ok(!/https?:\/\//.test(empty), "empty chart is still self-contained");
} catch { threw = true; }
ok(!threw, "empty/missing data does not throw");

console.log(fails === 0 ? "\nchart.test: all invariants hold ✅" : `\nchart.test: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
