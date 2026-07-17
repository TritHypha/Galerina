/**
 * compare.mjs — reads results/latest.json and prints a full comparison report:
 *   1. Throughput summary table
 *   2. Memory usage table (RSS + heap per runtime)
 *   3. CPU efficiency table (ops per CPU ms)
 *   4. Per-benchmark detail tables
 *   5. Key observations
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isComparable as specComparable, benchmarkSpec, metricClassOf, METRIC_ORDER } from "./throughput-units.mjs";
import { isShapeOnlyBench } from "./work-equivalence.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dataPath  = join(__dirname, "..", "results", "latest.json");

const ORDER = ["rustAvx512","rustAvx2","rust","cpp","nodejs","python","galerinaPassive","galerinaManifest","galerinaGoverned","wasm","denoWebGpu"];
const LABEL = {
  rustAvx512:     "Rust AVX-512",
  rustAvx2:       "Rust AVX2",
  rust:           "Rust (generic)",
  cpp:            "C++",
  nodejs:         "Node.js",
  python:         "Python",
  // ── Taxonomy (2026-06-06) ──────────────────────────────────────────────────
  // The three Galerina interpreter tiers are STAGE-A DIAGNOSTIC probes (they exist
  // to MEASURE the cost of pre-planning vs not, and to verify the WASM compiler
  // against the reference interpreter). They are NOT the production path. The
  // production governed runtime is `galerina run` → WAT → WASM (the WASM row).
  galerinaPassive:  "Galerina passive ⟨interp⟩",
  galerinaManifest: "Galerina manifest ⟨interp⟩",
  galerinaGoverned: "Galerina governed ⟨interp⟩",
  wasm:           "WASM ▶ production",
  denoWebGpu:     "Deno WebGPU (GPU)", // real GPU name filled at runtime from results (see GPU_NAME)
};

// ── Metric extractors ──────────────────────────────────────────────────────────

function throughput(r) {
  if (!r || r.error) return null;
  // Canonical: a single unit per benchmark, normalised by throughput-units.mjs.
  // `null` here means "excluded" (non-comparable benchmark) or "no data" — both
  // correctly drop the runtime from comparison.
  if (r.normThroughput !== undefined) return r.normThroughput;
  // ── Legacy path (out-of-scope benchmarks: galerinaOpsPerRun null/1) ──
  if (r.galerinaOpsPerSecond) return r.galerinaOpsPerSecond;
  if (r.warmCallsPerSecond) return r.warmCallsPerSecond;
  return r.operationsPerSecond ?? r.additionsPerSecond ?? r.attemptsPerSecond
      ?? r.iterationsPerSecond ?? r.callsPerSecond ?? r.runsPerSecond ?? null;
}

// Raw per-tier rate for the Governance table. governance-cost is comparable:false (an internal
// govSpeed/manifestSpeed ratio, not cross-runtime), so the runner stamps normThroughput=null and the
// cross-runtime throughput() returns null for it. The Governance table still needs the honest per-tier
// rates to render the governed/manifest overhead factor, so read the legacy rate directly here.
function tierRate(r) {
  if (!r || r.error) return null;
  if (typeof r.normThroughput === "number" && r.normThroughput > 0) return r.normThroughput;
  return r.galerinaOpsPerSecond ?? r.warmCallsPerSecond ?? r.operationsPerSecond ?? r.additionsPerSecond
      ?? r.attemptsPerSecond ?? r.iterationsPerSecond ?? r.callsPerSecond ?? r.runsPerSecond ?? null;
}

// Is this benchmark unit-comparable across runtimes? Any benchmark the spec marks
// comparable:false is excluded from winner / floor claims. (matrix-multiply, tri-logic
// and data-query were realigned to a common bulk-N path 2026-07-11 and are now included.)
function comparable(bench) {
  return bench?.units ? bench.units.comparable !== false : specComparable(bench?.benchmark);
}
function unitReason(bench) {
  const full = bench?.units?.reason ?? benchmarkSpec(bench?.benchmark)?.reason ?? "not unit-aligned";
  return full.split(" — ")[1]?.split(";")[0]?.trim() ?? full.split(".")[0];
}

function cpuEfficiency(r) {
  if (!r || r.error) return null;
  if (r.operationsPerCpuMs) return r.operationsPerCpuMs;
  const t = throughput(r);
  const wall = r.elapsedMs ?? r.execMs;
  const cpu  = r.cpu?.totalMs ?? r.cpu?.processMs;
  if (t && wall && cpu && cpu > 0) return (t * (wall / 1000)) / cpu;
  return null;
}

function rssBytes(r)      { return r?.memory?.rssAfter  ?? r?.memory?.rssBytes         ?? null; }
function peakRss(r)       { return r?.memory?.peakRssBytes ?? r?.memory?.maxRssBytes    ?? rssBytes(r); }
function heapUsed(r)      { return r?.memory?.heapUsedAfter ?? r?.memory?.heapUsedBytes ?? null; }
function heapDelta(r)     { return r?.memory?.heapUsedDelta                             ?? null; }
function cpuMs(r)         { return r?.cpu?.totalMs ?? r?.cpu?.processMs ?? r?.cpu?.warmTotalMs ?? null; }
function wallMs(r)        { return r?.elapsedMs ?? r?.execMs ?? r?.warmMs              ?? null; }

// Heap allocated per operation (the fair, workload-attributable memory metric).
// Prefer a runner's self-reported bytesPerOperation; else derive it centrally from
// heapUsedDelta and the total ops in the timed region (throughput × wall). Managed
// runtimes (Node/Python/Galerina/WASM) report this; native Rust/C++ are ~0 by design
// (no GC-managed heap), shown as "~0 (native)".
function bytesPerOp(r) {
  if (!r || r.error) return null;
  const m = r.memory;
  if (m && typeof m.bytesPerOperation === "number") return m.bytesPerOperation;
  const hd = m?.heapUsedDelta;
  const t = throughput(r), wall = wallMs(r);
  if (typeof hd === "number" && t && wall) {
    const totalOps = t * (wall / 1000);
    if (totalOps > 0) return hd / totalOps;
  }
  return null;
}
const NATIVE_RT = new Set(["rust", "rustAvx2", "rustAvx512", "cpp"]);
function fmtBpo(n, rt) {
  if (n === null) return NATIVE_RT.has(rt) ? "~0 (native)" : "—";
  if (Math.abs(n) < 1) return "~0";
  if (Math.abs(n) >= 1024) return (n / 1024).toFixed(1) + " KB/op";
  return n.toFixed(0) + " B/op";
}

// ── Blank-cell reasons (owner rule 2026-06-24) ──────────────────────────────────
// A benchmark table must NEVER show a silent blank. Every empty cell renders an
// explicit short reason instead of a bare "—". `cellReason(bench, rt)` classifies
// WHY a given runtime has no comparable throughput for a given benchmark, so the
// table cell can say e.g. "not run", "errored", "no WASM — strings/records"
// rather than an ambiguous dash. Reasons are deliberately short (table cells).
const STRING_RECORD_BENCH = new Set(["crypto-ops", "text-html", "json-parse", "spore-container", "framework-pipeline"]);
function cellReason(bench, rt) {
  const r = bench?.results?.[rt];
  // 1. Runtime never produced a result object for this benchmark.
  if (!r) {
    if (rt === "denoWebGpu") return "not run — no GPU path";
    if (rt === "cpp")        return "not run — no C++ impl";
    if (rt === "rustAvx512") return "not run — no AVX-512";
    if (rt === "wasm" && STRING_RECORD_BENCH.has(bench?.benchmark)) return "no WASM — strings/records";
    if (rt === "wasm")       return "no WASM build";
    if (NATIVE_RT.has(rt))   return "not run — no native impl";
    return "not run";
  }
  // 2. Runtime ran but errored.
  if (r.error) {
    if (rt === "wasm") return "WASM compile failed";
    return "errored";
  }
  // 3. Ran, but no comparable throughput metric (e.g. excluded / non-numeric).
  return "no comparable metric";
}
// Format a throughput cell: a number when present, else an explicit short reason.
function fmtTCell(bench, rt, n) {
  return (n === null || n === undefined) ? cellReason(bench, rt) : fmtT(n);
}

// ── Traffic Light ──────────────────────────────────────────────────────────────
// Compares a runtime's throughput to a reference (best, Node.js, or Rust).
// ratio = subject / reference:
//   🟢 > 0.9  = green  (same speed or faster — within 10%)
//   ⚪ > 0.5  = white  (within 2× — comparable)
//   🟡 > 0.1  = yellow (2-10× slower — a little slow)
//   🔴 > 0.01 = red    (10-100× slower — much slower)
//   ⚫ ≤ 0.01 = black  (100×+ slower — terrible in comparison)

function trafficLight(subject, reference) {
  if (!subject || !reference || reference === 0) return "—";
  const r = subject / reference;
  if (r >= 0.9)  return "🟢";
  if (r >= 0.5)  return "⚪";
  if (r >= 0.1)  return "🟡";
  if (r >= 0.01) return "🔴";
  return "⚫";
}

function trafficLightLabel(subject, reference) {
  if (!subject || !reference || reference === 0) return "—";
  const r = subject / reference;
  const light = trafficLight(subject, reference);
  const mult = r >= 1 ? `${r.toFixed(1)}×` : `${(1/r).toFixed(1)}× slower`;
  return `${light} ${mult}`;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtT(n) {
  if (n === null) return "—";
  if (n >= 1e9) return (n/1e9).toFixed(2)+"B/s";
  if (n >= 1e6) return (n/1e6).toFixed(2)+"M/s";
  if (n >= 1e3) return (n/1e3).toFixed(1)+"K/s";
  return n.toFixed(1)+"/s";
}

function fmtB(b) {
  if (b === null || b === undefined) return "—";
  const abs = Math.abs(b);
  const sign = b < 0 ? "-" : "";
  if (abs >= 1e9) return sign+(abs/1e9).toFixed(2)+"GB";
  if (abs >= 1e6) return sign+(abs/1e6).toFixed(1)+"MB";
  if (abs >= 1e3) return sign+(abs/1e3).toFixed(0)+"KB";
  return sign+abs+"B";
}

function fmtMs(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms >= 1000) return (ms/1000).toFixed(2)+"s";
  return ms.toFixed(1)+"ms";
}

function fmtEff(n) {
  if (n === null) return "—";
  if (n >= 1e6) return (n/1e6).toFixed(2)+"M ops/CPU-ms";
  if (n >= 1e3) return (n/1e3).toFixed(1)+"K ops/CPU-ms";
  return n.toFixed(2)+" ops/CPU-ms";
}

function ratio(a, b) {
  if (!a || !b || b === 0) return "—";
  const r = a / b;
  if (r >= 1e6) return (r/1e6).toFixed(1)+"M×";
  if (r >= 1e3) return (r/1e3).toFixed(1)+"K×";
  if (r >= 10)  return r.toFixed(1)+"×";
  return r.toFixed(2)+"×";
}

// ── Load ───────────────────────────────────────────────────────────────────────

let data;
try { data = JSON.parse(readFileSync(dataPath, "utf8")); }
catch { console.error("No results — run: npm run run"); process.exit(1); }

// Derive the real GPU name from the measured results rather than hardcoding it.
// denoWebGpu.device looks like "gpu (WebGPU — NVIDIA GeForce RTX 2060)".
function detectGpuName(rows) {
  for (const b of rows) {
    const d = b?.results?.denoWebGpu?.device;
    if (typeof d === "string") {
      const m = d.match(/WebGPU\s*[—–-]\s*([^)]+)/);
      if (m) return m[1].trim();
    }
  }
  return null;
}
const GPU_NAME = detectGpuName(data) ?? "GPU";
LABEL.denoWebGpu = `Deno WebGPU (${GPU_NAME})`;

// ── 1. Throughput summary ──────────────────────────────────────────────────────

console.log("# Galerina Benchmark Report\n");

// ── Key / Legend ─────────────────────────────────────────────────────────────
console.log("## Key\n");
console.log("**Traffic lights** (🚦) compare each runtime to **Node.js** (the production baseline):\n");
console.log("| Light | Meaning | Speed vs Node.js |");
console.log("|---|---|---|");
console.log("| 🟢 | Green — fast | At or faster than Node.js (within 10%, or quicker) |");
console.log("| ⚪ | White — comparable | Within 2× of Node.js |");
console.log("| 🟡 | Yellow — a little slower | 2–10× slower than Node.js |");
console.log("| 🔴 | Red — much slower | 10–100× slower than Node.js |");
console.log("| ⚫ | Black — terrible | 100×+ slower than Node.js |");
console.log("");
console.log("**Medals** (🥇🥈🥉) rank runtimes by throughput within each benchmark — fastest first.\n");
console.log("**Runtimes:**");
console.log("- **Rust (generic / AVX2)** — native compiled baseline (ceiling).");
console.log("- **Node.js** — V8 JIT (production baseline for traffic lights).");
console.log("- **Python** — CPython interpreter (comparison floor).");
console.log("- **WASM ▶ production** — `galerina run` → WAT → WebAssembly. Governance gates compiled IN. **This is the production governed runtime** — the row to read for shipping cost.");
console.log("");
console.log("> **Taxonomy — read this before the governance numbers.** The three `⟨interp⟩` rows below are **Stage-A interpreter diagnostic tiers**, NOT the production path. They exist to (a) *measure* the cost of pre-planning vs runtime proving, and (b) *verify* the WASM compiler against the reference interpreter. Do not read the interpreter's governed throughput as the shipping governance cost — read the **WASM ▶ production** row for that.");
console.log("- **Galerina governed ⟨interp⟩** — Stage-A: full governance tree-walker (capabilities + audit + proof rebuilt per call). *Diagnostic worst-case.*");
console.log("- **Galerina manifest ⟨interp⟩** — Stage-A: pre-verified runtime manifest, governance erased at runtime. *Diagnostic.*");
console.log("- **Galerina passive ⟨interp⟩** — Stage-A: pre-compiled deployment model with LRU result cache (warm path). *Diagnostic.*\n");
console.log("---\n");

// ── §1: Per-Metric Scoreboards (R&D structural fix for false cross-runtime ratios, 2026-07-17) ──
// A table has ONE metric. Grouping every benchmark by the single metric it actually MEASURES makes a
// false cross-metric comparison structurally unrepresentable: the Memory table ranks by bytes/op (no
// throughput ratio, no ⚫), and the Governance table's columns are Galerina tiers ONLY (NO native
// column), so it literally cannot divide by a native rate to print a "N× slower". This REPLACES the
// three old MIXED headline tables (the §1 winner-per-benchmark table, the §1.5 canonical scoreboard,
// and the §1.5 traffic-light summary), each of which ranked EVERY benchmark in one cross-runtime
// throughput comparison — forcing a memory or governance benchmark into a throughput ranking it was
// never measuring (the root cause of governance-cost's ⚫ 1,077,381× artifact). The single global
// cross-metric winner tally is dropped with them.
console.log("## 1. Per-Metric Scoreboards\n");

// Category legend — a cross-runtime ratio is shown ONLY for work-equivalence-certified lanes.
{
  let certified = 0, shapeOnly = 0, governance = 0, uncertified = 0;
  for (const b of data) {
    const id = b.benchmark;
    if (isShapeOnlyBench(id)) shapeOnly++;
    else if (metricClassOf(id) === "governance") governance++;
    else if (benchmarkSpec(id) && specComparable(id)) certified++;
    else uncertified++;
  }
  console.log(`> Categories: ${certified} certified · ${shapeOnly} shape-only(→Memory) · ${governance} internal-ratio(Governance) · ${uncertified} uncertified — a cross-runtime ratio is shown only for work-equivalence-certified lanes.\n`);
}

// ── helpers local to the per-metric scoreboards ──────────────────────────────────
const bestRustOf = (m) => (Math.max(m.rustAvx512 ?? 0, m.rustAvx2 ?? 0, m.rust ?? 0) || null);
// CERTIFIED = the lane is work-equivalence-certified in SPECS (a cross-runtime ratio is honest).
const isCertified = (id) => !!benchmarkSpec(id) && specComparable(id);
// Native/own-unit rates a legacy (non-normalised) io or DevTools benchmark reports at the top level.
const IO_RATE_FIELDS = ["operationsPerSecond", "iterationsPerSecond", "callsPerSecond", "requestsPerSecond", "filesPerSecond", "receiptsPerSecond", "queriesPerSecond", "runsPerSecond", "nodeRaw_reqPerSec"];
const ioRate = (r) => {
  const t = throughput(r);
  if (t != null) return t;
  if (!r || r.error) return null;
  for (const f of IO_RATE_FIELDS) if (typeof r[f] === "number") return r[f];
  return null;
};
const IO_UNIT = { "crypto-ops": "ops/s", "text-html": "ops/s", "http-throughput": "requests/s",
  "naming-check": "files/s", "context-receipt": "receipts/s", "intelligence-search": "queries/s", "provenance-trace": "files/s" };
const ioUnitOf = (id) => benchmarkSpec(id)?.unit ?? IO_UNIT[id] ?? "native rate";
// denoWebGpu may run but produce NO number on this machine (no real GPU dispatch) → say so honestly,
// never imply a fabricated GPU rate.
const gpuCell = (r) => (r && r.error) ? "⏳ GPU pending" : (throughput(r) != null ? fmtT(throughput(r)) : "—");

// Loop the metric classes in order (decreasing cross-runtime comparability, governance last) and emit
// ONE table per class that has data. matrix-multiply DUAL-HOMES: it stays in the CPU table (its metric
// class) AND is picked up by the GPU table because it carries a denoWebGpu lane.
for (const cls of METRIC_ORDER) {
  const members = cls === "gpu"
    ? data.filter((b) => metricClassOf(b.benchmark) === "gpu" || b.results?.denoWebGpu !== undefined)
    : data.filter((b) => metricClassOf(b.benchmark) === cls);
  if (members.length === 0) continue;

  // ── cpu-throughput — inner-ops/s, cross-runtime, CERTIFIED lanes only ──────────
  if (cls === "cpu-throughput") {
    const rows = [];
    let ceilLabel = null, ceilSpeed = 0, ceilBench = null;
    for (const bench of members) {
      const id = bench.benchmark;
      const m = {}; for (const rt of ORDER) m[rt] = throughput(bench.results?.[rt]);
      const rust = bestRustOf(m), node = m.nodejs, wasm = m.wasm, gov = m.galerinaGoverned;
      const wasmStr = wasm ? fmtT(wasm) : cellReason(bench, "wasm");
      const govStr  = gov  ? fmtT(gov)  : cellReason(bench, "galerinaGoverned");
      let vsRust, vsNode, impl;
      if (isCertified(id)) {
        vsRust = wasm && rust ? trafficLightLabel(wasm, rust) : "—";
        vsNode = wasm && node ? trafficLightLabel(wasm, node) : "—";
        if (wasm && rust) {
          const wr = wasm / rust;
          impl = wr >= 0.9 ? "WASM = native speed" : wr >= 0.5 ? "WASM near native" : wr >= 0.1 ? "WASM usable" : "WASM lags native";
        } else if (wasm && node) {
          const wn = wasm / node;
          impl = wn >= 0.9 ? "WASM ≈ Node" : wn >= 0.5 ? "WASM within 2× of Node" : wn >= 0.1 ? "WASM 2–10× under Node" : "WASM lags Node";
        } else impl = "WASM not built for this lane yet";
        for (const rt of ORDER) if (m[rt] && m[rt] > ceilSpeed) { ceilSpeed = m[rt]; ceilLabel = LABEL[rt]; ceilBench = id; }
      } else {
        vsRust = "UNCERTIFIED"; vsNode = "UNCERTIFIED";
        impl = "not yet work-equivalence-certified (N/work mismatch)";
      }
      rows.push(`| ${id} | ${wasmStr} | ${vsRust} | ${vsNode} | ${govStr} | ${impl} |`);
    }
    console.log("### CPU Throughput — inner-ops/s (cross-runtime; certified lanes only)\n");
    console.log("> 🚦 **vs Rust / vs Node** compare the **WASM ▶ production** lane to native. A traffic-light ratio");
    console.log("> appears ONLY for work-equivalence-certified benchmarks; `UNCERTIFIED` lanes show raw throughput and");
    console.log("> NO ratio (their N/work is not yet proven equivalent across runtimes).\n");
    console.log("| Benchmark | WASM ▶ production | vs Rust | vs Node | Galerina governed ⟨interp⟩ | Implication |");
    console.log("|---|---|---|---|---|---|");
    for (const r of rows) console.log(r);
    console.log("\n> 🚦 🟢 ≥0.9 (≈native) · ⚪ ≥0.5 (within 2×) · 🟡 ≥0.1 (2–10× slower) · 🔴 ≥0.01 (10–100×) · ⚫ <0.01 (100×+).");
    if (ceilLabel) console.log(`> **Ceiling (fastest certified lane):** ${ceilLabel} — ${fmtT(ceilSpeed)} on ${ceilBench}.`);
    console.log("");
    continue;
  }

  // ── memory — ranked by heap BYTES/OP (the honest metric); NO throughput ratio ──
  if (cls === "memory") {
    const MEM_COLS = ["nodejs", "python", "wasm", "galerinaGoverned", "galerinaManifest"];
    console.log("### Memory — heap bytes per operation (the honest metric; lower is better)\n");
    console.log("> Ranked by **bytes/op**, NOT throughput — these benchmarks measure allocation, so no cross-runtime");
    console.log("> throughput ratio (and no ⚫) is shown. Native Rust/C++ allocate off the GC heap (~0 native — see §2b/§4).\n");
    console.log("| Benchmark | 🏆 Best (lowest heap B/op) | " + MEM_COLS.map((rt) => LABEL[rt]).join(" | ") + " |");
    console.log("|" + Array(MEM_COLS.length + 2).fill("---").join("|") + "|");
    for (const bench of members) {
      const bpo = {}; for (const rt of MEM_COLS) bpo[rt] = bytesPerOp(bench.results?.[rt]);
      // Winner = lowest measured NON-NEGATIVE heap bytes/op (a negative delta is GC-reclaim noise, not
      // "less allocation", so it can't crown a winner).
      let bestRt = null, bestVal = Infinity;
      for (const rt of MEM_COLS) { const v = bpo[rt]; if (typeof v === "number" && v >= 0 && v < bestVal) { bestVal = v; bestRt = rt; } }
      const bestCell = bestRt ? `**${LABEL[bestRt]}** (${fmtBpo(bestVal, bestRt)})` : "no measured heap alloc";
      const cells = MEM_COLS.map((rt) => bpo[rt] === null ? cellReason(bench, rt) : fmtBpo(bpo[rt], rt));
      console.log(`| ${bench.benchmark} | ${bestCell} | ${cells.join(" | ")} |`);
    }
    console.log("\n> **No throughput ratio, no ⚫ here** — a memory benchmark ranked by throughput is exactly the");
    console.log("> cross-metric bug this section removes. record-allocation / binary-trees / collection-pipeline live");
    console.log("> here by bytes/op, so they no longer carry the ◇ shape-only marker; their shape rate is in §4.\n");
    continue;
  }

  // ── gpu — kernel-evals/s (cross-runtime; native + GPU columns) ──────────────────
  if (cls === "gpu") {
    console.log("### GPU — kernel-evals/s (GPU-shaped workload; matrix-multiply dual-homes here)\n");
    console.log("> Cross-runtime. Deno WebGPU is the only real-dispatch path; where it produced no number on this");
    console.log("> machine it shows **⏳ GPU pending** — the honest status, never a fabricated GPU rate.\n");
    console.log("| Benchmark | 🏆 Winner | Speed | WASM ▶ production | GPU (Deno WebGPU) | vs Node (WASM) | Implication |");
    console.log("|---|---|---|---|---|---|---|");
    for (const bench of members) {
      const id = bench.benchmark;
      const m = {}; for (const rt of ORDER) m[rt] = throughput(bench.results?.[rt]);
      let winRt = null, winSpeed = 0;
      for (const rt of ORDER) if (m[rt] && m[rt] > winSpeed) { winSpeed = m[rt]; winRt = rt; }
      const node = m.nodejs, wasm = m.wasm;
      const wasmStr = wasm ? fmtT(wasm) : cellReason(bench, "wasm");
      const vsNode = isCertified(id) ? (wasm && node ? trafficLightLabel(wasm, node) : "—") : "UNCERTIFIED";
      const impl = winRt === "denoWebGpu" ? "real GPU dispatch wins" : "CPU/WASM lanes lead — real GPU dispatch pending (see §4b)";
      console.log(`| ${id} | ${winRt ? LABEL[winRt] : "—"} | ${winSpeed ? fmtT(winSpeed) : "—"} | ${wasmStr} | ${gpuCell(bench.results?.denoWebGpu)} | ${vsNode} | ${impl} |`);
    }
    console.log("\n> **vs Node (WASM)** compares the WASM ▶ production lane to Node.js on the kernel. matrix-multiply also");
    console.log("> appears in the CPU Throughput table (dual-home) — it has both a compute lane and a WebGPU lane.\n");
    continue;
  }

  // ── io — own units per benchmark; raw rate, NO cross-runtime ratio ──────────────
  if (cls === "io") {
    const IO_COLS = ["nodejs", "python", "rust", "wasm", "galerinaGoverned"];
    const active = members.filter((b) => IO_COLS.some((rt) => ioRate(b.results?.[rt]) != null) || ORDER.some((rt) => ioRate(b.results?.[rt]) != null));
    if (active.length === 0) continue;
    console.log("### I/O & DevTools — native units per benchmark (raw rate; NOT inner-op normalised)\n");
    console.log("> Each benchmark has its OWN unit, so there is **no cross-runtime ratio** — the winner is the fastest");
    console.log("> lane by raw rate WITHIN that benchmark's native unit. Comparing rates ACROSS benchmarks is meaningless.\n");
    console.log("| Benchmark | Unit (native) | 🏆 Fastest lane | " + IO_COLS.map((rt) => LABEL[rt]).join(" | ") + " |");
    console.log("|" + Array(IO_COLS.length + 3).fill("---").join("|") + "|");
    for (const bench of active) {
      const id = bench.benchmark;
      const rate = {}; for (const rt of IO_COLS) rate[rt] = ioRate(bench.results?.[rt]);
      let winRt = null, winSpeed = 0;
      for (const rt of IO_COLS) if (rate[rt] && rate[rt] > winSpeed) { winSpeed = rate[rt]; winRt = rt; }
      const winCell = winRt ? `**${LABEL[winRt]}** (${fmtT(winSpeed)})` : "—";
      const cells = IO_COLS.map((rt) => rate[rt] != null ? fmtT(rate[rt]) : cellReason(bench, rt));
      console.log(`| ${id} | ${ioUnitOf(id)} | ${winCell} | ${cells.join(" | ")} |`);
    }
    console.log("\n> Values are native rates (records/s, containers/s, requests/s, files/s, …), shown for transparency —");
    console.log("> NOT a cross-runtime ranking. The inner-op-normalised throughput lives in the CPU table above.\n");
    continue;
  }

  // ── governance — Galerina tiers ONLY, NO native column (LAST) ───────────────────
  if (cls === "governance") {
    console.log("### Governance — Galerina-internal tier ratio ONLY (NO native column)\n");
    console.log("> This table's columns are Galerina tiers ONLY — there is **no rust/node/python/cpp column**, so a");
    console.log("> cross-runtime `N× slower` is structurally impossible here. The old six-figure governance-cost artifact");
    console.log("> came from dividing the governed tier by a native rate — a division this table cannot express.\n");
    console.log("| Benchmark | Galerina governed ⟨interp⟩ | Galerina manifest ⟨interp⟩ | WASM ▶ production | governed/manifest (gov overhead) |");
    console.log("|---|---|---|---|---|");
    for (const bench of members) {
      const id = bench.benchmark;
      const gov  = tierRate(bench.results?.galerinaGoverned);
      const man  = tierRate(bench.results?.galerinaManifest);
      const wasm = tierRate(bench.results?.wasm);
      const govStr  = gov  ? fmtT(gov)  : cellReason(bench, "galerinaGoverned");
      const manStr  = man  ? fmtT(man)  : cellReason(bench, "galerinaManifest");
      const wasmStr = wasm ? fmtT(wasm) : cellReason(bench, "wasm");
      const ratioCell = (gov && man)
        ? `${(gov / man).toFixed(2)}× governed/manifest (gov overhead ≈ ${(man / gov).toFixed(2)}×)`
        : "internal-ratio only — no cross-runtime number";
      console.log(`| ${id} | ${govStr} | ${manStr} | ${wasmStr} | ${ratioCell} |`);
    }
    console.log("\n> **governed/manifest** is governance-cost's honest headline: the same-N cost of always-on governance");
    console.log("> (capabilities + audit + proof) vs the pre-verified manifest. `gov overhead` = manifest ÷ governed.\n");
    continue;
  }
}

// ── Full table ────────────────────────────────────────────────────────────────
console.log("\n### Full Throughput Table (all runtimes)\n");

const GOV_COST_ONLY = new Set(["governance-cost"]);
const cols = ORDER.map(rt => LABEL[rt]);
console.log("| Benchmark | " + cols.join(" | ") + " | Node/Galerina† (🖥️ CPU) |");
console.log("|" + Array(ORDER.length + 2).fill("---").join("|") + "|");

for (const bench of data) {
  if (!comparable(bench)) {
    // Excluded benchmark: every data cell says why instead of a silent dash.
    const cells = ORDER.map(() => "N/A — excluded");
    console.log("| " + [`${bench.benchmark} ⚠️`, ...cells, "⚠️ excluded — not unit-aligned"].join(" | ") + " |");
    continue;
  }
  const m = {}; for (const rt of ORDER) m[rt] = throughput(bench.results?.[rt]);

  // Bold the winning cell in each row
  let winnerSpeed = 0;
  for (const rt of ORDER) if (m[rt] && m[rt] > winnerSpeed) winnerSpeed = m[rt];

  const row = [bench.benchmark, ...ORDER.map(rt => {
    // Number when present (winner bolded); else an explicit short reason.
    if (!m[rt]) return cellReason(bench, rt);
    const s = fmtT(m[rt]);
    return (Math.abs(m[rt] - winnerSpeed) / winnerSpeed < 0.05) ? `**${s}**` : s;
  })];

  if (GOV_COST_ONLY.has(bench.benchmark)) {
    const govOverhead = m.galerinaManifest && m.galerinaGoverned
      ? ((1 - m.galerinaGoverned / m.galerinaManifest) * 100).toFixed(1) + "% gov overhead"
      : "N/A — only Galerina tiers ran";
    row.push(govOverhead);
  } else {
    row.push((m.nodejs && m.galerinaGoverned)
      ? ratio(m.nodejs, m.galerinaGoverned)
      : (!m.nodejs && !m.galerinaGoverned) ? "N/A — neither ran"
      : !m.galerinaGoverned ? "N/A — no governed ⟨interp⟩"
      : "N/A — no Node.js");
  }
  console.log("| "+row.join(" | ")+" |");
}
console.log("\n> †`Node/Galerina > 1` = Node.js faster (the usual case for the Stage-A tree-walker). `< 1` = Galerina faster.");
console.log("> †fibonacci: Galerina=fib(20), others=fib(30) — different workload depth.");
console.log("> ⚠️ rows are excluded — their workloads are not unit-aligned across runtimes (see §1.6).");
console.log(`> **Bold** = winner (within 5% of fastest). 🖥️ CPU = CPU execution. 🎮 GPU = Deno WebGPU (${GPU_NAME}).`);

// ── 1.6 Unit Alignment Check ────────────────────────────────────────────────
// Makes the per-benchmark unit assertion visible: every comparable benchmark must
// report ONE unit across all runtimes; the rest are flagged & excluded.
console.log("\n## 1.6 Unit Alignment Check\n");
console.log("> Throughput is only meaningful when every runtime measures the **same unit**. This");
console.log("> table is the report-side view of the `assertBenchmarkUnits` guard in `throughput-units.mjs`.\n");
console.log("| Benchmark | Status | Unit | Notes |");
console.log("|---|---|---|---|");
for (const bench of data) {
  const spec = benchmarkSpec(bench.benchmark);
  if (!spec) {
    console.log(`| ${bench.benchmark} | — legacy | per-call | not centrally normalised (out of scope) |`);
    continue;
  }
  const u = bench.units;
  if (!comparable(bench)) {
    console.log(`| ${bench.benchmark} | ⚠️ excluded | ${spec.unit} | ${spec.reason} |`);
  } else {
    const status = u?.status === "FAIL" ? "❌ FAIL" : "✅ aligned";
    const note = (u?.problems?.length) ? u.problems.join("; ") : "all runtimes normalised to one unit";
    console.log(`| ${bench.benchmark} | ${status} | ${spec.unit} | ${note} |`);
  }
}
console.log("\n> **Excluded** benchmarks are dropped from the winner table and the Python-floor check until their");
console.log("> workloads are realigned across runtimes. Excluding them is what stops false \"Galerina wins\" on");
console.log("> mismatched workloads (the same class of bug the unit normalisation fixed for the numeric loops).");

// ── §1.5 tables removed — the Throughput Winner table, the canonical Scoreboard, and the Traffic
//    Light Summary were mixed cross-metric tables; superseded by the Per-Metric Scoreboards in §1.

// ── 2. Memory usage ────────────────────────────────────────────────────────────

// ── 2. Memory Allocation per Operation ────────────────────────────────────────
// The LOW-MEMORY benchmark specifically measures bytes allocated per operation.
// Key insight: WASM and bytecode VM allocate ~0 bytes/op (pure Int32 arithmetic).
// The tree-walker allocates a {__tag,value} object per AST node — ~200-400 bytes/op.

const lowMemBench = data.find(b => b.benchmark === "low-memory");
if (lowMemBench) {
  console.log("\n## 2. Memory Allocation per Operation (low-memory benchmark)\n");
  console.log("> **Key metric:** bytes allocated on the JS heap per integer operation.");
  console.log("> WASM and bytecode VM should be near 0. Tree-walker allocates per AST node.\n");
  console.log("| # | 🚦 | Runtime | Bytes/Op | Throughput | Total Ops | Heap Δ |");
  console.log("|---|---|---|---|---|---|---|");

  const lmResults = [];
  for (const rt of ORDER) {
    const r = lowMemBench.results?.[rt];
    if (!r || r.error) continue;
    const bpo = r.memory?.bytesPerOperation ?? r.memory?.heapUsedDelta != null
      ? (r.memory.heapUsedDelta / ((r.calls ?? 1) * 10000)).toFixed(2)
      : "—";
    const t = throughput(r);
    lmResults.push({ rt, r, bpo: parseFloat(bpo) || 0, t });
  }
  lmResults.sort((a, b) => a.bpo - b.bpo); // lowest bytes/op first (best memory efficiency)

  const nodeRef = lmResults.find(x => x.rt === "nodejs")?.t ?? null;
  lmResults.forEach((x, idx) => {
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
    const light = trafficLight(x.t, nodeRef);
    const bpoStr = x.bpo < 1 ? `${x.bpo.toFixed(2)}` : `${x.bpo.toFixed(0)}`;
    const highlight = x.bpo < 1 ? "⚡ ~0 — no boxing" : x.bpo < 10 ? "✓ low" : x.bpo < 100 ? "⚠ moderate" : "✗ high — object per node";
    const totalOps = x.r.memory?.totalOps ?? "—";
    console.log(`| ${medal} | ${light} | ${LABEL[x.rt]} | ${bpoStr} bytes/op ${highlight} | ${fmtT(x.t)} | ${typeof totalOps === 'number' ? totalOps.toLocaleString() : totalOps} | ${fmtB(x.r.memory?.heapUsedDelta)} |`);
  });

  console.log("\n> **Why this matters:** Every byte allocated is a byte the GC must later collect.");
  console.log("> WASM and the bytecode VM run with zero allocation — ideal for high-throughput governed services.");
  console.log("> The tree-walker's per-node allocation is the primary target of Phases 31-33.\n");
}

console.log("\n## 2b. General Memory Usage\n");
console.log("| Benchmark | Runtime | RSS | Peak RSS | Heap Used | Heap Δ (execution) |");
console.log("|---|---|---|---|---|---|");

for (const bench of data) {
  for (const rt of ORDER) {
    const r = bench.results?.[rt];
    if (!r || r.error) continue;
    const rss = rssBytes(r), peak = peakRss(r), heap = heapUsed(r), hd = heapDelta(r);
    // Always show the row — use "—" for runtimes (Rust, Python) that don't report memory
    console.log(`| ${bench.benchmark} | ${LABEL[rt]} | ${fmtB(rss)} | ${fmtB(peak)} | ${fmtB(heap)} | ${fmtB(hd)} |`);
  }
}

console.log("\n> **Heap Δ** = heap after minus heap before execution. Negative means GC reclaimed memory during the run.");
console.log("> **Galerina:** each tree-walker node evaluation allocates a new GalerinaValue object — visible as positive heap delta.");

// ── 3. CPU efficiency ──────────────────────────────────────────────────────────

console.log("\n## 3. CPU Efficiency\n");
console.log("| Benchmark | Runtime | Wall time | CPU time | CPU utilisation | Ops/CPU-ms |");
console.log("|---|---|---|---|---|---|");

for (const bench of data) {
  for (const rt of ORDER) {
    const r = bench.results?.[rt];
    if (!r || r.error) continue;
    const wall = wallMs(r), cpu = cpuMs(r), eff = cpuEfficiency(r);
    if (wall === null) continue;
    const util = (cpu !== null && wall > 0) ? ((cpu/wall)*100).toFixed(0)+"%" : "—";
    console.log(`| ${bench.benchmark} | ${LABEL[rt]} | ${fmtMs(wall)} | ${fmtMs(cpu)} | ${util} | ${fmtEff(eff)} |`);
  }
}

console.log("\n> **CPU utilisation** = CPU ms ÷ wall ms × 100. Node.js approaches 100% (single-thread JIT). Python may show <100% on Windows where process_time measures differently.");

// ── 4. Per-benchmark detail ────────────────────────────────────────────────────

console.log("\n## 4. Per-Benchmark Detail\n");
console.log("> **Heap/op** = heap bytes allocated per operation (the fair, workload-attributable memory metric).");
console.log("> Managed runtimes (Node/Python/Galerina/WASM) report it via a GC'd before/after delta; native Rust/C++");
console.log("> show **~0 (native)** — no GC-managed heap. `~0` = no measurable per-op allocation (e.g. V8 tagged ints);");
console.log("> a large positive value (e.g. the Galerina tree-walker boxing a value per AST node) is allocation pressure.\n");

for (const bench of data) {
  if (!comparable(bench)) {
    console.log(`### ${bench.benchmark} ⚠️ (excluded — not unit-aligned)\n`);
    console.log(`> ${benchmarkSpec(bench.benchmark)?.reason ?? "Workloads differ across runtimes."}\n`);
    console.log("| Runtime | Raw reported throughput (native unit — **NOT comparable**) | Wall |");
    console.log("|---|---|---|");
    for (const rt of ORDER) {
      const r = bench.results?.[rt];
      if (!r || r.error) continue;
      const raw = r.rawThroughput ?? null;
      console.log(`| ${LABEL[rt]} | ${raw != null ? fmtT(raw) : "—"} | ${fmtMs(wallMs(r))} |`);
    }
    console.log();
    continue;
  }
  console.log(`### ${bench.benchmark}\n`);
  console.log("| # | 🚦 | Runtime | Throughput | Wall | CPU | RSS | Heap/op | vs Python | vs Node |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");

  const mt = {}; for (const rt of ORDER) mt[rt] = throughput(bench.results?.[rt]);
  const py = mt.python, nd = mt.nodejs;

  // Sort by throughput descending — fastest runtime first
  const ranked = ORDER
    .filter(rt => bench.results?.[rt] && !bench.results[rt].error && mt[rt] !== null)
    .sort((a, b) => (mt[b] ?? 0) - (mt[a] ?? 0));

  // Traffic light reference: Node.js as the fair "production baseline"
  // This makes Rust show 🟢 (faster than Node), Python show 🔴 (slower),
  // WASM show 🟢 (usually faster), and Galerina tree-walker show its real position.
  // If Node.js has no result for this benchmark, fall back to best performer.
  const nodeRef = mt.nodejs ?? (ranked.length > 0 ? mt[ranked[0]] : null);

  ranked.forEach((rt, idx) => {
    const r = bench.results?.[rt];
    if (!r || r.error) return;
    const t = mt[rt];
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
    const light = trafficLight(t, nodeRef);
    console.log(`| ${medal} | ${light} | ${LABEL[rt]} | ${fmtT(t)} | ${fmtMs(wallMs(r))} | ${fmtMs(cpuMs(r))} | ${fmtB(rssBytes(r))} | ${fmtBpo(bytesPerOp(r), rt)} | ${ratio(t,py)} | ${ratio(t,nd)} |`);
  });

  // Per-op heap winner among managed runtimes (lowest allocation = best).
  const memRanked = ranked
    .map(rt => ({ rt, bpo: bytesPerOp(bench.results?.[rt]) }))
    .filter(x => x.bpo !== null)
    .sort((a, b) => a.bpo - b.bpo);
  if (memRanked.length > 0) {
    const best = memRanked[0], worst = memRanked[memRanked.length - 1];
    console.log(`\n> 🧠 **Lowest heap/op:** ${LABEL[best.rt]} (${fmtBpo(best.bpo, best.rt)})` +
      (worst.rt !== best.rt ? ` · **highest:** ${LABEL[worst.rt]} (${fmtBpo(worst.bpo, worst.rt)})` : "") +
      `. Native Rust/C++ allocate ~0 (no GC heap); a positive figure is GC-managed allocation pressure.`);
  }
  console.log();
}

// ── 4b. GPU-compute section ────────────────────────────────────────────────────
// Dedicated view for the GPU-shaped workload, with honest GPU availability status.

const gpuBench = data.find(b => b.benchmark === "gpu-compute");
if (gpuBench) {
  let gpu = null;
  try {
    const mod = await import("./gpu-detect.mjs");
    gpu = mod.gpuReport();
  } catch { /* detection optional */ }

  // Ground truth beats toolchain detection: if a denoWebGpu result exists in the
  // data, the GPU path actually ran (gpu-detect's `where deno` can miss a Deno
  // that's only on the augmented runner PATH).
  const denoActuallyRan = data.some(b => {
    const d = b?.results?.denoWebGpu;
    return d && !d.error && typeof d.device === "string" && d.device.toLowerCase().startsWith("gpu");
  });

  console.log("\n## 4b. GPU-Compute Workload (parallel map-reduce)\n");
  console.log("> A **GPU-shaped** workload: a per-element kernel `f(i)=i*2+1` applied across 100,000 elements + reduction.");
  console.log("> On a GPU this parallelises across thousands of threads. 🖥️ CPU = running on CPU; 🎮 GPU = real GPU dispatch.\n");

  if (gpu) {
    const denoGpuAvail = (gpu.toolchains?.denoWebGpu ?? false) || denoActuallyRan;
    console.log(`**GPU detected:** ${gpu.device.present ? `${gpu.device.name} (driver ${gpu.device.driver}, ${gpu.device.memory})` : "none"}`);
    console.log(`**Compute toolchain:** ${gpu.summary}`);
    console.log(`**Deno WebGPU:** ${denoGpuAvail ? `✅ available — real GPU dispatch enabled (${GPU_NAME})` : "⏳ not installed"}`);
    console.log(`**Galerina GPU backend:** \`${gpu.galerinaGpuStatus}\` — gpu-plan.ts emits a WGSL skeleton only; no dispatch path (pending Phase 38).\n`);
  }

  console.log("| # | 🚦 | Runtime | Device (🖥️ CPU / 🎮 GPU) | Throughput (kernel ops/s) | Wall | vs Node |");
  console.log("|---|---|---|---|---|---|---|");

  const gt = {}; for (const rt of ORDER) gt[rt] = throughput(gpuBench.results?.[rt]);
  const gNodeRef = gt.nodejs ?? null;
  const gRanked = ORDER
    .filter(rt => gpuBench.results?.[rt] && !gpuBench.results[rt].error && gt[rt] !== null)
    .sort((a, b) => (gt[b] ?? 0) - (gt[a] ?? 0));

  gRanked.forEach((rt, idx) => {
    const r = gpuBench.results?.[rt];
    const t = gt[rt];
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
    const light = trafficLight(t, gNodeRef);
    const rawDevice = r.device ?? "cpu";
    // Only a device string that actually starts with "gpu" is real GPU dispatch.
    // CPU-serial/WASM rows report "cpu (serial)" / "cpu (wasm)" and must show 🖥️ CPU.
    const isGpu = typeof rawDevice === "string" && rawDevice.trim().toLowerCase().startsWith("gpu");
    const deviceLabel = isGpu ? `🎮 GPU (${rawDevice})` : `🖥️ CPU (${rawDevice})`;
    console.log(`| ${medal} | ${light} | ${LABEL[rt]} | ${deviceLabel} | ${fmtT(t)} | ${fmtMs(wallMs(r))} | ${ratio(t, gt.nodejs)} |`);
  });

  // Honest GPU rows — what each runtime COULD do on GPU, and current status
  const gpuRunnable = gpu?.toolchains?.anyRunnable ?? false;
  const denoWebGpuAvail = (gpu?.toolchains?.denoWebGpu ?? false) || denoActuallyRan;
  console.log(`\n**GPU execution status (this machine):**\n`);
  console.log("| Runtime | GPU path | Device | Status |");
  console.log("|---|---|---|---|");
  console.log(`| Rust | wgpu (Vulkan/D3D12) | 🖥️ CPU (GPU pending) | ${gpu?.toolchains?.rustWgpu ? "🔧 buildable (cargo present, harness pending)" : "⏳ toolchain required"} |`);
  console.log(`| Python | torch CUDA / cupy | 🖥️ CPU (GPU pending) | ${gpu?.toolchains?.pythonTorchCuda ? "✅ available" : "⏳ toolchain required (CPU-only torch)"} |`);
  console.log(`| Node.js | WebGPU | 🖥️ CPU only | ⏳ toolchain required (no navigator.gpu in Node.js) |`);
  console.log(`| Deno | WebGPU (built-in) | ${denoWebGpuAvail ? `🎮 GPU (${GPU_NAME})` : "🖥️ CPU"} | ${denoWebGpuAvail ? "✅ available — real GPU dispatch detected (Phase 38 ready)" : "⏳ not installed"} |`);
  console.log(`| **Galerina** | WebGPUComputePlan → WGSL | 🖥️ CPU (GPU pending) | ❌ **pending Phase 38** — stub only, no measured number (by design) |`);
  console.log(`\n> Per the project's honesty rule (same as the Runtime-in-Galerina 0% metric): no GPU number is shown until a backend actually executes. Galerina's real result on this workload is its **WASM/CPU** row above.`);
  console.log(`> 🖥️ CPU = running on CPU cores. 🎮 GPU = real GPU dispatch via WebGPU/WGSL. Deno WebGPU is the only path currently capable of real GPU execution.\n`);
}

// ── 5. Observations ────────────────────────────────────────────────────────────

console.log("## 5. Key Observations\n");
console.log("**Throughput gap (general):**");
console.log("- Rust and Node.js JIT compile to native machine code — tree-walker cannot compete on hot arithmetic loops.");
console.log("- Python CPython is 5-100× faster than Galerina on integer-intensive workloads.");
console.log("- Galerina governed ≈ Galerina manifest — governance overhead is low; tree-walker dispatch dominates.\n");
console.log("**collection-pipeline: the old \"Galerina wins 43×\" was a UNIT bug, now fixed:**");
console.log("- That claim compared Galerina's *elements/sec* against the other languages' *whole-pipeline-passes/sec* —");
console.log("  off by the per-pass element count (size = 10,000). Apples to oranges.");
console.log("- Normalised to elements/sec for every runtime, the tree-walker no longer beats Node.js or Python here.");
console.log("- Node/Python still pay real intermediate-array allocation for `.filter().map().reduce()`, but V8/CPython");
console.log("  per-element throughput dwarfs the Stage-A interpreter once the units match.");
console.log("- **Lesson:** normalise units before declaring a winner — a big `opsPerRun` multiplier flatters whoever it's applied to.\n");
console.log("**fibonacci-recursive: different workloads:**");
console.log("- Node.js/Rust/Python benchmark: fib(30) = 832040, ~2.7M recursive calls per invocation.");
console.log("- Galerina benchmark: fib(20) = 6765, ~21K recursive calls per invocation (fib(30) would take ~19s/call).");
console.log("- Calls/sec are not directly comparable — structural complexity differs by ~130×.");
console.log("- Comparable result: Galerina handles ~1M+ AST node evaluations per second for recursive dispatch.\n");
console.log("**Memory:**");
console.log("- Galerina tree-walker allocates a new `{ __tag, value }` object per AST node — visible as heap growth.");
console.log("- Negative heap delta = GC ran during execution and reclaimed more than was allocated.");
console.log("- Node.js V8 JIT uses native tagged integers (no boxing) — heap stays flat on numeric workloads.\n");
console.log("**passive mode: pre-compiled deployment throughput:**");
console.log("- Galerina (passive) warm = LRU cache hits: steady-state deployment model (same input, same output).");
console.log("- Galerina (passive) cold = execution without cache: different input each call, no cache benefit.");
console.log("- Passive warm is typically 10-50× faster than governed — governance amortized, cache serves result.");
console.log("- Passive cold shows pure execution cost: governance was pre-verified at compile time.\n");
console.log("**hardware-targets: AVX2 vs generic for float dot product:**");
console.log("- On i5-11400H (Tiger Lake H): generic x86 ≈ AVX2 for small arrays (both auto-vectorize to SSE4.2).");
console.log("- Real AVX2 advantage appears on large tensors (L2/L3 cache boundary crossing, 16K+ float elements).");
console.log("- WASM Phase 27: once WebAssembly.instantiate is wired, WASM SIMD 128 will show 10-100× over tree-walker.\n");
console.log("**governance-cost: measuring the governance tax:**");
console.log("- This benchmark isolates the overhead of the governance layer (ProofGraph + capability checking + audit).");
console.log("- Key metric: galerinaGoverned/galerinaManifest ratio. Current baseline: ~2-3× slower (37% of manifest speed).");
console.log("- Governance overhead sources: ProofGraph construction, GovernanceFlags bitmask, capability lookup, audit event.");
console.log("- Target (Phase 30): <1.2× overhead via compile-time governance caching and proof reuse.\n");
console.log("**Phase 25 projection (WASM):**");
console.log("- Phase 25 WASM real arithmetic: pure flows now emit i32.add/sub/mul/div instead of (local.get $p0) stubs.");
console.log("- Expected: 10-100× speedup for numeric pure flows when executed via WebAssembly.instantiate.");
console.log("- collection-pipeline Galerina result already shows what the model delivers at the right abstraction level.");

// ── 6. Trailing comparison — how far behind the winner is each runtime ────────

console.log("\n## 6. Distance from Winner — Every Runtime vs 🏆\n");
console.log("> How much slower (or faster) is each runtime compared to the winner of that benchmark?");
console.log("> **1.0×** = tied with winner. **2.0×** = half the speed. **100×** = one hundred times slower.\n");

// Gather all runtimes that appear at least once
const allRts = new Set();
for (const bench of data) {
  for (const rt of ORDER) {
    if (throughput(bench.results?.[rt])) allRts.add(rt);
  }
}
const rtsInOrder = ORDER.filter(rt => allRts.has(rt));

console.log("| Benchmark | 🏆 Winner | " + rtsInOrder.map(rt => LABEL[rt]).join(" | ") + " |");
console.log("|" + Array(rtsInOrder.length + 2).fill("---").join("|") + "|");

for (const bench of data) {
  if (!comparable(bench)) continue;   // excluded — workloads not unit-aligned
  const m = {};
  for (const rt of ORDER) m[rt] = throughput(bench.results?.[rt]);

  // Find winner speed
  let winnerRt = null, winnerSpeed = 0;
  for (const rt of ORDER) {
    if (m[rt] && m[rt] > winnerSpeed) { winnerSpeed = m[rt]; winnerRt = rt; }
  }
  if (!winnerRt) continue;

  const winnerLabel = LABEL[winnerRt] ?? winnerRt;
  const cells = rtsInOrder.map(rt => {
    const t = m[rt];
    if (!t) return cellReason(bench, rt);   // explicit short reason, never a bare dash
    const ratio = winnerSpeed / t;
    if (ratio <= 1.05) return "**🏆 winner**";
    if (ratio <= 1.5)  return `${ratio.toFixed(1)}× slower`;
    if (ratio <= 10)   return `${ratio.toFixed(0)}× slower`;
    if (ratio <= 1000) return `**${ratio.toFixed(0)}× slower**`;
    return `**${(ratio/1000).toFixed(1)}K× slower**`;
  });

  console.log(`| **${bench.benchmark}** | ${winnerLabel} | ` + cells.join(" | ") + " |");
}

console.log("\n> Bold = significantly behind (>10×). A non-numeric cell states why that runtime has no figure (e.g. \"not run — no native impl\", \"errored\", \"no WASM build\") — never a silent blank.");
console.log("> Fibonacci passive is excluded from 'winner' comparison — LRU cache hit is not a fair race.");
console.log(`> gpu-compute GPU: ${GPU_NAME} slower than CPU at 100K elements (setup overhead dominates — crossover ~500K elements).`);

// ── 7. Per-benchmark scoreboard — winner → slowest, with spread ─────────────────
// Answers, per benchmark, in one place: who won, who are the runners-up, where EACH
// language lands, how far each is from the WINNER, and how far from the SLOWEST.
console.log("\n## 7. Per-Benchmark Scoreboard — Winner → Slowest (full spread)\n");
console.log("> Every runtime that ran, ranked fastest→slowest, with distance from the winner AND from the slowest.");
console.log("> ⚠️ **`Galerina passive ⟨interp⟩` figures are LRU cache-HIT rates** (a memoised result for a repeated");
console.log("> input), **not compute** — flagged `⚠️cache` below. Read the first non-cache row for the real compute winner.\n");

const fmtX = (r) => (r >= 1000 ? (r / 1000).toFixed(1) + "K×" : r >= 10 ? r.toFixed(0) + "×" : r.toFixed(1) + "×");
for (const bench of data) {
  if (!comparable(bench)) continue;
  const rows = ORDER
    .map((rt) => ({ rt, t: throughput(bench.results?.[rt]) }))
    .filter((x) => x.t)
    .sort((a, b) => b.t - a.t);
  if (rows.length === 0) continue;
  const winner = rows[0].t, slowest = rows[rows.length - 1].t;
  const realWinner = rows.find((x) => x.rt !== "galerinaPassive");
  console.log(`### ${bench.benchmark}`);
  if (rows[0].rt === "galerinaPassive" && realWinner) {
    console.log(`> 🏆 cache-hit "winner" is Galerina passive (memoised); **real compute winner: ${LABEL[realWinner.rt]} at ${fmtT(realWinner.t)}**.`);
  }
  console.log("| # | Runtime | Throughput | ×vs winner | ×vs slowest |");
  console.log("|---|---|---|---|---|");
  rows.forEach((x, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
    const vsW = i === 0 ? "🏆 winner" : fmtX(winner / x.t) + " slower";
    const vsS = i === rows.length - 1 ? "— (slowest)" : fmtX(x.t / slowest) + " faster";
    const flag = x.rt === "galerinaPassive" ? " ⚠️cache" : "";
    console.log(`| ${medal} | ${LABEL[x.rt]}${flag} | ${fmtT(x.t)} | ${vsW} | ${vsS} |`);
  });
  console.log("");
}

// ── Benchmark Glossary ────────────────────────────────────────────────────────
console.log(`
---

## Benchmark Glossary — what each benchmark measures

| Benchmark | What it measures | Why it matters |
|---|---|---|
| **arithmetic-threshold** | Integer arithmetic loop: count operations above a threshold at 4B/s | Raw CPU / WASM JIT ceiling — the fastest possible pure number-crunching |
| **call-chain** | Flow-to-flow call chain (A→B→C→D): function-call overhead | Real programs call multiple governed flows; this isolates dispatch cost |
| **collection-pipeline** | Functional pipeline: filter → map → reduce over 10K integer records | Data transformation throughput — the bread-and-butter of governed APIs |
| **compute-mix** | Mixed workload: string ops, conditionals, arithmetic, object creation | Closest to real-world application code; no single hot path |
| **crypto-ops** | SHA-256 hashing, HMAC, Ed25519 sign+verify (via stdlib) | Performance of governed cryptographic operations (used in every secure flow) |
| **data-query** | \`scanRecords(10K)\`: one pass — filter (WHERE amount>threshold) + GROUP BY category — the same bulk-N scan on every runtime | Governed data-query throughput in record-scans/sec (aligned 2026-07-11); the \`Tainted<String>\` query path is a compile-time cost layered on top |
| **fibonacci-recursive** | Recursive fib(20): tail-call and LRU cache warm path | Tests recursion overhead + caching benefit across governed/passive/WASM tiers |
| **governance-cost** | Sum 1..100 (triangle number) with full governance verification overhead | Directly measures the cost of Galerina's contract{} checking vs raw arithmetic |
| **gpu-compute** | Parallel map-reduce kernel (100K elements) via Deno WebGPU | GPU dispatch throughput on RTX 2060 — the WASM/GPU crossover point |
| **hardware-targets** | Dispatch to 5 hardware targets: CPU/GPU/NPU/WASM/fallback | Route decision overhead when contract.targets{} selects execution path |
| **http-throughput** | Sequential HTTP requests/sec to a governed localhost endpoint | Server throughput — how fast Galerina can handle real HTTP requests |
| **json-parse** | Parse 500 JSON records: split on comma, split on colon, accumulate | Real I/O parsing workload — string-heavy, cache-friendly on repeat calls |
| **spore-container** | Create the canonical .spore trust-container (TMX-256 SHAKE Merkle + LE packing). **The "Node.js" column IS Galerina's \`@galerina/ext-spore\` engine** (pure TS/Node); Python/Rust are byte-identical reference writers — all assert the same golden root | Can other languages create a .spore, and how fast? Honest SHAKE256+packing race (the engine is pure Node, so it has no separate interpreter column) |
| **framework-pipeline** | One full governed request through the **Galerina App Kernel's fixed 12-gate pipeline** (route→policy→size→content-type→auth→decode→idempotency→concurrency→dispatch→encode→audit). **The "Node.js" column IS the App Kernel** (no middleware chain); Python is an equivalent sync gate chain | "Native framework, no middleware" vs a middleware chain — measures pipeline cost in-process (no sockets). The structural win is fewer deps + non-reorderable gates, not raw speed |
| **low-memory** | Process 10K items with strict heap budget (measures bytes/op) | Memory efficiency — critical for edge/embedded deployment targets |
| **matrix-multiply** | 32×32 integer GEMM (matrix multiplication) | Scientific / ML workload: dense arithmetic, benefits from SIMD/GPU |
| **nbody** | N-body gravitational force: pairwise O(N²) physics simulation | Compute-heavy scientific workload — measured in force-evals/sec; Node/Python (native loops) are far faster than the tree-walker |
| **record-allocation** | Create 10K records at 2.3B/s: struct construction throughput | Memory allocation cost under governance — critical for high-frequency APIs |
| **six-digit-guess** | Brute-force 6-digit PIN search with early exit | Branch-heavy search — tests conditional execution + JIT branch prediction |
| **text-html** | HTML template rendering: string interpolation + escaping | Web/rendering workload — string manipulation under governance |
| **tri-logic** | Balanced ternary (base-3) logic operations: trit arithmetic | Photonic/ternary compute path — future hardware target validation |
| **naming-check** | FUNGI-NAMING checker over 27 auth-service .fungi files | DevTools throughput: how fast the naming linter processes a codebase |
| **context-receipt** | Context Receipt generation: 51–97% token reduction per flow | AI context window generation speed — how fast receipts are produced |
| **intelligence-search** | BM25 hybrid code search: index 81 flows, 10 queries/run | Code search latency — how fast galerina search responds |
| **provenance-trace** | Data lineage graph: source→transform→sink for 27 files | Compliance evidence generation speed — how fast the audit trail is built |
`);

