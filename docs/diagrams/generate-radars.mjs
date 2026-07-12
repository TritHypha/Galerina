// generate-radars.mjs — produces 9 radar charts comparing Galerina to mainstream languages across
// distinct categories (security · perf · devx · governed-chaos · ci/cd · tri-ternary · web · databasing ·
// data-science). Run: `node docs/diagrams/generate-radars.mjs`. Scores are 0–10, honest/defensible
// (governance-strong, ecosystem-young is shown HONESTLY — Galerina scores low where it genuinely is).
// Short axis labels by design. esc() XML-escapes all text so `&` in a title can't produce invalid SVG.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = dirname(fileURLToPath(import.meta.url));

const SERIES_COLORS = {
  Galerina: "#e8590c",   // signature orange
  Rust:   "#b7410e",
  Go:     "#00add8",
  "C++":  "#6f42c1",
  Python: "#3572a5",
  TypeScript: "#3178c6",
  Zig:    "#f7a41d",
  Node:   "#43853d",
  R:      "#276dc3",
  "Galerina + SQL":      "#e8590c",
  "Galerina + TritMesh": "#9c36b5",
  "Std ORM (Py/Node)": "#868e96",
  "BitNet (Silicon)": "#0078d4",   // Microsoft blue — electronic 1.58-bit ternary
  "GPU FP16": "#9c36b5",           // mainstream PyTorch/CUDA stack
  "Python + PyTorch": "#0ca678",   // teal — DL framework tier (quantization, GPU)
};

const charts = [
  {
    // Memory-Safe = 9 (deliberately NOT 10, 2026-07-12): governed memory-residency now ships (RD-0358,
    // merged f7ff18df) — value-state/taint + a declared register-only/no-swap/no-dram residency CEILING
    // + erase-on-exit + memory.spill deny-only + spill→Refuted: a governance layer beyond Rust's borrow
    // checker. Held at 9 HONESTLY — the residency ceiling is compile-time-CHECKED but the runtime
    // mlock/zeroize ENFORCEMENT is the #143 execution switch (not yet built); the score reflects proven
    // enforcement, not declared intent. Bump to 10 when #143 lands.
    file: "radar-1-security-governance.svg",
    title: "1 · Security & Governance",
    subtitle: "where Galerina is built to lead",
    axes: ["Fail-closed Auth", "Memory Safe", "Capability Ctrl", "Audit / Provenance", "Supply-chain", "Data Privacy"],
    series: {
      Galerina: [10, 9, 10, 10, 9, 9],
      Rust:   [3, 10, 4, 2, 5, 2],
      Go:     [3, 8, 2, 2, 5, 2],
      "C++":  [2, 3, 2, 1, 2, 1],
    },
  },
  {
    file: "radar-2-performance-systems.svg",
    title: "2 · Raw Performance & Systems",
    subtitle: "where Galerina trades speed for safety",
    axes: ["Single-thread Speed", "Low-level Ctrl", "Startup", "Concurrency", "Mem Footprint", "Latency Predict."],
    series: {
      Galerina: [5, 2, 8, 5, 5, 6],
      Rust:   [10, 9, 9, 9, 9, 10],
      "C++":  [10, 10, 9, 7, 9, 10],
      Go:     [7, 4, 8, 10, 6, 5],
    },
  },
  {
    file: "radar-3-devx-ecosystem.svg",
    title: "3 · Developer Experience & Ecosystem",
    subtitle: "Galerina is new — strong on safety, thin on maturity",
    axes: ["Easy to Learn", "Tooling", "Ecosystem", "Type Safety", "Iteration", "Maturity / Hiring"],
    series: {
      Galerina: [5, 6, 2, 9, 6, 2],
      Python: [9, 7, 10, 3, 9, 10],
      Go:     [8, 9, 7, 7, 8, 9],
      Rust:   [3, 9, 7, 10, 5, 7],
    },
  },
  {
    // The "we play a different game" chart: capabilities that are NATIVE to a ternary multi-substrate
    // orchestrator and ABSENT (or hand-rolled, ungoverned) in binary languages. Galerina's primitives here
    // already ship (resilience{}/fallback_digital, vAndTensor=Tensorized No-Coercion, K3 vAnd=min,
    // freivalds verify-cheap + ToleranceWitness). Others score low because they don't ATTEMPT this natively.
    file: "radar-4-governed-chaos.svg",
    title: "4 · Governed Chaos & Multi-Substrate",
    subtitle: "the category binary languages don't play in",
    axes: ["Substrate Switch", "Fault Healing", "AI-Proposal Safety", "Tri-logic Ambiguity", "Verified Approx.", "Degrade-only"],
    series: {
      Galerina: [9, 7, 9, 10, 8, 9],
      Python: [1, 2, 1, 1, 2, 1],
      Rust:   [1, 3, 1, 1, 2, 2],
      "C++":  [1, 2, 1, 1, 2, 1],
    },
  },
  {
    file: "radar-5-cicd-devsupport.svg",
    title: "5 · CI/CD & Developer Support",
    subtitle: "governance-grade gates vs polished general tooling",
    axes: ["CI Gates", "Auto-gen Tests", "Supply-chain", "Attestation", "Lint / Format", "IDE / LSP"],
    series: {
      Galerina: [9, 7, 9, 9, 6, 3],   // ~15 enforcing lints + #149 + mutation gate + signed witnesses; LSP not built
      Go:     [6, 5, 5, 2, 9, 9],
      Rust:   [7, 5, 5, 3, 9, 9],
      Python: [4, 6, 3, 2, 7, 8],
    },
  },
  {
    file: "radar-6-tri-ternary.svg",
    title: "6 · Tri / Ternary Logic",
    subtitle: "a category binary languages can't enter natively",
    axes: ["K3 Native Logic", "Abstain State", "No-Coercion", "Ternary Fault-Tol.", "Speculative", "Tri-Substrate"],
    series: {
      Galerina: [10, 10, 10, 9, 8, 9],
      Rust:   [1, 2, 0, 1, 1, 0],   // Option≈Abstain-ish, but no native ternary logic/fold/routing
      Python: [1, 1, 0, 1, 1, 0],
      "C++":  [1, 1, 0, 1, 1, 0],
    },
  },
  {
    file: "radar-7-web-api-secure.svg",
    title: "7 · Web App / API / Secure Web",
    subtitle: "governance-strong, runtime ecosystem still young",
    axes: ["Fail-closed Auth", "K3 API Routing", "Injection / XSS", "Capability Ctrl", "PII / Privacy", "Web Ecosystem"],
    series: {
      Galerina: [9, 9, 7, 9, 9, 2],   // web-* contracts deny-by-default but stub runtime; no framework ecosystem yet
      Node:   [4, 3, 4, 3, 2, 10],
      Python: [4, 3, 4, 3, 3, 9],
      Go:     [5, 4, 5, 4, 2, 7],
    },
  },
  {
    file: "radar-8-databasing.svg",
    title: "8 · Databasing — over SQL vs native TritMesh",
    subtitle: "governed data access: Galerina+SQL, Galerina+TritMesh (R&D-stage design), vs a standard ORM",
    axes: ["Injection-safe", "Tenant Isolation", "Audit Trail", "Capability-gated", "Schema Safety", "Ecosystem"],
    series: {
      "Galerina + SQL":      [9, 9, 9, 9, 7, 6],   // governed access over mature SQL
      // Injection-safe=10 is now MACHINE-BACKED by the .hypha reference checker (injection-proof-by-construction;
      // RD-0246, 51/51, 3 adversarial rounds) — evidence, not assertion. Tenant-Isolation=9 is the
      // reachability-as-authorization DESIGN, GATED on the still-unbuilt signed graph-spine + unsolved cross-tenant
      // edge custody (RD-0150 #3) — a design target, not shipped. Ecosystem=2 = R&D-stage, honest.
      "Galerina + TritMesh": [10, 9, 9, 9, 8, 2],
      "Std ORM (Py/Node)": [6, 3, 4, 2, 6, 10],
    },
  },
  {
    file: "radar-9-data-science.svg",
    title: "9 · Data Science",
    subtitle: "Galerina governs the data; Python/R crunch it",
    // "Machine Learning" dropped (it lives on chart 10) → "Reproducibility": deterministic, contract-pinned
    // pipelines are a governance strength; notebook-driven Python/R workflows are famously hard to reproduce.
    axes: ["PII Protection", "Data Eng", "Data Analysis", "Reproducibility", "Data Viz", "Domain Expertise"],
    series: {
      Galerina: [10, 4, 3, 9, 2, 9],   // governance/PII/domain-contracts/reproducibility strong; crunching/viz thin
      Python: [3, 9, 10, 4, 8, 5],
      R:      [2, 5, 9, 4, 9, 4],
    },
  },
  {
    // The BitNet chart (notes/71-beyond-1bit): Microsoft's "1-bit" LLM is really a 1.58-bit TERNARY net
    // ({−1,0,+1}) — the exact substrate Galerina is built on. Galerina is deliberately WEAK on pure 1-bit
    // binary (photonic Tri encodes phase/amplitude, not a single binary level) and ecosystem-thin, but
    // native-strong on ternary logic, wavelength (WDM) parallelism, passive optical compute, and governed
    // inference. Scores are positioning (the photonic axes are roadmap, like charts 4/6), shown honestly.
    file: "radar-10-AI-ML-NuroNet.svg",
    title: "10 · AI / ML / Neural Nets",
    subtitle: "ternary-native AI · photonic axes (WDM, passive compute) are planned, not built yet",
    axes: ["1-bit Binary", "Ternary Logic", "Photonic WDM*", "Passive Compute*", "Governed AI", "Model Ecosystem"],
    series: {
      Galerina:           [2, 10, 9, 8, 10, 2],   // can't do pure 1-bit; native ternary + optical + governed
      "BitNet (Silicon)": [9, 9, 0, 6, 2, 5],      // king of low-bit ternary on electronic ALUs; no optics
      "GPU FP16":         [5, 2, 0, 1, 2, 10],      // mature stack, power-hungry float matmul
      Python:             [3, 2, 0, 1, 3, 10],      // native lang alone — ecosystem-rich, no low-bit/ternary on its own
      "Python + PyTorch": [6, 3, 0, 1, 2, 10],      // DL framework adds int8/quant + GPU; ternary still research-only
    },
  },
  {
    // The language / type-system chart (added 2026-07-11): Galerina's distinctive move is that
    // GOVERNANCE lives IN the type system — value-state (protected/redacted/tainted), the declared
    // effect set (CANONICAL_EFFECTS), currency-typed Money<GBP>, developer-minted nominal HALLMARK open
    // types with mandatory assay gates (RD-0353 — raw→domain is a compile REJECT; parse-don't-validate
    // as a first-class feature), value-unit types (RD-0349 I2/I3), and deny-by-default are CHECKED, not
    // conventions. Rust has strong types + exhaustive match but no effect/value-state/governance layer;
    // TypeScript is gradual + branded-by-hand; Python is dynamic. Scored honestly — Galerina leads here
    // because it defines the category (exhaustive-match is a genuine tie with Rust).
    // Domain/Money bumped 9→10 (2026-07-12): hallmark + Money<GBP> + value-unit types all ship AND are
    // CHECKED — best-in-set for governed domain typing (nothing in the comparison set governs nominal
    // domain types with assay gates).
    file: "radar-11-language-type-system.svg",
    title: "11 · Language & Type System",
    subtitle: "governance and value-state live IN the type system",
    axes: ["Value-state / Taint", "Effect System", "Governance in Types", "Domain / Money Types", "Exhaustive Match", "Fail-closed Default"],
    series: {
      Galerina:    [10, 10, 10, 10, 9, 10],
      Rust:        [3, 2, 0, 5, 9, 3],
      TypeScript:  [2, 1, 0, 4, 5, 1],
      Python:      [1, 1, 0, 2, 3, 1],
    },
  },
];

const W = 720, H = 560, CX = 300, CY = 300, R = 210, MAXV = 10, RINGS = 5;
const TAU = Math.PI * 2;
const angleFor = (i, n) => -Math.PI / 2 + (i / n) * TAU;            // start at top, clockwise
const pt = (i, n, v) => {
  const a = angleFor(i, n), r = (v / MAXV) * R;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
// Escape XML-special chars in text content. A raw `&` (e.g. "Security & Governance") makes the SVG invalid
// XML and renders as an error — the bug this fixes. (`<`/`>` escaped too for safety.)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svg(chart) {
  const n = chart.axes.length;
  const parts = [];
  // width/height="100%" + preserveAspectRatio: when the file is opened standalone it fills the
  // viewport (no longer renders tiny); when embedded as <img> the viewBox ratio drives the size.
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" font-family="system-ui,Segoe UI,Roboto,sans-serif">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<text x="${CX}" y="34" text-anchor="middle" font-size="22" font-weight="700" fill="#1a1a1a">${esc(chart.title)}</text>`);
  parts.push(`<text x="${CX}" y="56" text-anchor="middle" font-size="13" fill="#666">${esc(chart.subtitle)}</text>`);

  // concentric grid rings
  for (let ring = 1; ring <= RINGS; ring++) {
    const poly = [];
    for (let i = 0; i < n; i++) poly.push(fmt(pt(i, n, (ring / RINGS) * MAXV)));
    parts.push(`<polygon points="${poly.join(" ")}" fill="none" stroke="#e3e3e3" stroke-width="1"/>`);
  }
  // axes + labels
  for (let i = 0; i < n; i++) {
    const [ex, ey] = pt(i, n, MAXV);
    parts.push(`<line x1="${CX}" y1="${CY}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#d0d0d0" stroke-width="1"/>`);
    const a = angleFor(i, n);
    const lx = CX + (R + 18) * Math.cos(a), ly = CY + (R + 18) * Math.sin(a);
    const cos = Math.cos(a);
    const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
    parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" font-size="12.5" font-weight="600" fill="#333">${esc(chart.axes[i])}</text>`);
  }
  // data polygons
  const names = Object.keys(chart.series);
  names.forEach((name) => {
    const vals = chart.series[name];
    const poly = vals.map((v, i) => fmt(pt(i, n, v))).join(" ");
    const c = SERIES_COLORS[name] ?? "#888";
    parts.push(`<polygon points="${poly}" fill="${c}" fill-opacity="0.14" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`);
    vals.forEach((v, i) => { const [x, y] = pt(i, n, v); parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${c}"/>`); });
  });
  // legend
  let ly = 120;
  parts.push(`<text x="600" y="${ly - 22}" text-anchor="middle" font-size="12" font-weight="700" fill="#888">LEGEND</text>`);
  names.forEach((name) => {
    const c = SERIES_COLORS[name] ?? "#888";
    parts.push(`<rect x="556" y="${ly - 10}" width="16" height="6" rx="2" fill="${c}"/>`);
    parts.push(`<text x="578" y="${ly - 4}" font-size="13" font-weight="${name === "Galerina" ? 700 : 500}" fill="#1a1a1a">${esc(name)}</text>`);
    ly += 24;
  });
  parts.push(`<text x="${CX}" y="${H - 14}" text-anchor="middle" font-size="11" fill="#aaa">0 (center) → 10 (edge) · Galerina vs mainstream languages</text>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

for (const c of charts) {
  writeFileSync(join(OUT, c.file), svg(c));
  console.log("wrote", c.file);
}
