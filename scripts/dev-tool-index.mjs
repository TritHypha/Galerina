#!/usr/bin/env node
// =============================================================================
// dev-tool-index.mjs — index + graph the PACKAGES and the DEV TOOLS that govern them
// =============================================================================
// Owner ask (2026-07-02): "make a dev tool to graph and index packages including
// dev tools to help." The RD-0234 ZT-tooling audit found the dev-tool suite is
// mature but HAND-CURATED and its coverage is opaque — you cannot see at a glance
// which packages exist, which dev tools exist, what each tool checks, or where the
// gaps are. This tool produces that single view:
//
//   • a PACKAGE index (kind · tests · hardened-border · workspace deps · role)
//   • a DEV-TOOL index (category · self-test? · in phase-close cadence? · concerns)
//   • a COVERAGE matrix (concern -> the tools that guard it) + GAPS
//   • a GRAPH (mermaid) of the package dependency graph AND the tooling-coverage map
//
// Outputs (build/dev-tool-index/, git-ignored build artifact):
//   INDEX.md          human-browsable
//   index.json        machine-readable (CI / other tools)
//   packages.mmd      mermaid: package workspace-dependency graph, grouped by kind
//   tooling.mmd       mermaid: dev-tool -> concern coverage map
//
// Usage:  node scripts/dev-tool-index.mjs [--json] [--check]
//   --json   print the JSON summary to stdout (no files)
//   --check  exit 1 if a NEW package has zero tests or a NEW concern has zero tools
//            (a cadence gate — coverage can only grow); else 0.
// =============================================================================
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PKG_DIR = join(ROOT, "packages-galerina");
const OUT_DIR = join(ROOT, "build", "dev-tool-index");
const JSON_OUT = process.argv.includes("--json");
const CHECK = process.argv.includes("--check");

// ── helpers ──────────────────────────────────────────────────────────────────
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const KIND_ORDER = ["core", "tower", "tri", "framework", "devtools", "ext", "target",
  "governance", "inference", "observability", "substrate", "hardware", "api", "cpu",
  "auth", "ai", "test", "docs"];
function deriveKind(name) {
  const fam = name.replace(/^galerina-/, "").split("-")[0];
  return KIND_ORDER.includes(fam) ? fam : (fam || "other");
}

// ── 1. PACKAGES ────────────────────────────────────────────────────────────────
const version = (() => { try { return JSON.parse(read(join(ROOT, "version.json"))); } catch { return {}; } })();
const testsByPkg = version.testCountByPackage || {};

const packages = [];
for (const name of readdirSync(PKG_DIR)) {
  const dir = join(PKG_DIR, name);
  if (!statSync(dir).isDirectory()) continue;
  if (!existsSync(join(dir, "package.json"))) continue;
  let pj = {}; try { pj = JSON.parse(read(join(dir, "package.json"))); } catch { /* keep {} */ }
  const boundary = read(join(dir, ".graph", "BOUNDARY.md"));
  let border = "—", files = null, deps = [];
  if (boundary) {
    border = /Status:\*\*\s*✅/.test(boundary) ? "PASS" : /Status:\*\*/.test(boundary) ? "check" : "—";
    const fm = boundary.match(/\|\s*Files\s*\|\s*(\d+)\s*\|/); files = fm ? Number(fm[1]) : null;
    const ws = boundary.split(/###\s*Workspace/i)[1];
    if (ws) {
      const seg = ws.split(/\n\s*###|\n\s*##/)[0];
      deps = [...new Set([...seg.matchAll(/`(@galerina\/[^`]+)`/g)].map((m) => m[1]))];
    }
  }
  packages.push({
    name, kind: deriveKind(name),
    description: (pj.description || "").replace(/\s+/g, " ").trim().slice(0, 110),
    tests: testsByPkg[name] ?? null,
    hasTestScript: typeof pj.scripts?.test === "string",
    border, files, deps,
  });
}
packages.sort((a, b) => (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || a.name.localeCompare(b.name));

// ── 2. DEV TOOLS ─────────────────────────────────────────────────────────────
// Category is derived from the filename PREFIX. NB: an audit-class tool MUST be named `audit-*` — a
// verb-noun name like `brand-audit.mjs` falls through to "util" and so never reaches
// gaps.toolsNotInCadence (which scans only audit/lint), hiding it from this coverage report. Use the
// `audit-` prefix for new audits; renaming brand-audit.mjs -> audit-brand.mjs would restore its visibility.
function toolCategory(name) {
  if (/^audit-/.test(name)) return "audit";
  if (/^lint-/.test(name)) return "lint";
  if (/graph/.test(name)) return "graph";
  if (/(^|-)(index|registry)|^kb-|^code-|^gen-code/.test(name)) return "index";
  if (/^run-|^status|component-health/.test(name)) return "runner";
  if (/^gen-|^fix-|galerina-new/.test(name)) return "generator";
  return "util";
}
function toolPurpose(src) {
  const lines = src.split(/\r?\n/).slice(0, 30);
  for (const l of lines) {
    const m = l.match(/^\/\/\s*[\w.\-]+\.(?:mjs|cjs)\s*[—-]\s*(.+)/);
    if (m && m[1].trim().length > 8) return m[1].trim().slice(0, 130);
  }
  for (const l of lines) {
    const m = l.match(/^\/\/\s*(?:WHY:\s*)?(.{20,})/);
    if (m && !/^[=\-\s]+$/.test(m[1])) return m[1].trim().slice(0, 130);
  }
  return "(no header description)";
}
// concern taxonomy — maps a keyword found in the tool name/purpose to a security/quality concern.
const CONCERN_KEYS = [
  [/taint|sink|injection/, "sinks/taint"], [/effect/, "effects"], [/sign|manifest|fuse/, "signing/fusion"],
  [/governance|govern/, "governance"], [/naming|name-colli/, "naming"], [/provenance/, "provenance"],
  [/checker|wiring|dead-gate/, "gate-wiring"], [/coverage|blocker/, "coverage"], [/diagnostic|codes?/, "diagnostics"],
  [/secret|privacy/, "secrets/privacy"], [/border|package-graph/, "package-border"], [/tier/, "tier-floor"],
  [/mutation/, "mutation-testing"], [/corpus/, "teaching-corpus"], [/nul|hygiene|stray/, "source-hygiene"],
  [/doc-drift|doc/, "doc-drift"], [/brand/, "brand"], [/web-stub|web/, "web-stub"], [/graph|index/, "graph/index"],
  [/proof/, "proofs"], [/muted|muting/, "muted-diagnostics"], [/allowlist|sensitive/, "sensitive-allowlist"],
  [/runtime-coverage/, "runtime-coverage"],
];
function toolConcerns(hay) {
  const s = new Set();
  for (const [re, c] of CONCERN_KEYS) if (re.test(hay)) s.add(c);
  return [...s];
}

const phaseClose = read(join(HERE, "run-phase-close.mjs"));
const gated = new Set([...phaseClose.matchAll(/"scripts\/([\w.\-]+)"/g)].map((m) => m[1]));

const tools = [];
for (const f of readdirSync(HERE)) {
  if (!/\.(mjs|cjs)$/.test(f)) continue;
  if (/-proof\.mjs$/.test(f)) continue;         // proofs live in proofs/ (indexed separately)
  if (f === "dev-tool-index.mjs") continue;      // don't index self
  const p = join(HERE, f);
  if (!statSync(p).isFile()) continue;
  const src = read(p);
  const purpose = toolPurpose(src);
  tools.push({
    name: f, category: toolCategory(f), purpose,
    selfTest: /--self-test|self[-\s]?test/.test(src),
    inCadence: gated.has(f),
    // Tag concerns from the tool's NAME + its header block (first ~2.5k chars) — the header
    // documents what it checks (e.g. sink-canonicality names SECRET/PRIVACY egress), so this is
    // more accurate than the one-line purpose alone.
    concerns: toolConcerns((f + " " + src.slice(0, 2500)).toLowerCase()),
  });
}
tools.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const proofsDir = join(ROOT, "proofs");
const proofCount = existsSync(proofsDir) ? readdirSync(proofsDir).filter((f) => /\.mjs$/.test(f)).length : 0;

// ── 3. COVERAGE + GAPS ───────────────────────────────────────────────────────
const concernToTools = {};
for (const t of tools) for (const c of t.concerns) (concernToTools[c] ??= []).push(t.name);
const allConcerns = CONCERN_KEYS.map(([, c]) => c).filter((c, i, a) => a.indexOf(c) === i);
const gaps = {
  packagesNoTests: packages.filter((p) => p.hasTestScript && (p.tests == null || p.tests === 0)).map((p) => p.name),
  concernsNoTool: allConcerns.filter((c) => !concernToTools[c]),
  toolsNotInCadence: tools.filter((t) => (t.category === "audit" || t.category === "lint") && !t.inCadence).map((t) => t.name),
};

const byKind = {};
for (const p of packages) (byKind[p.kind] ??= []).push(p);
const byCat = {};
for (const t of tools) (byCat[t.category] ??= []).push(t);

const summary = {
  generatedNote: "auto-generated by scripts/dev-tool-index.mjs — run to refresh; do not hand-edit",
  totals: {
    packages: packages.length,
    testBearing: packages.filter((p) => p.hasTestScript).length,
    tests: Object.values(testsByPkg).reduce((a, b) => a + b, 0),
    devTools: tools.length,
    auditTools: tools.filter((t) => t.category === "audit").length,
    toolsInCadence: tools.filter((t) => t.inCadence).length,
    proofs: proofCount,
  },
  packages, tools, coverage: concernToTools, gaps,
};

// ── 4. RENDER ────────────────────────────────────────────────────────────────
if (JSON_OUT) { console.log(JSON.stringify(summary, null, 2)); process.exit(0); }

mkdirSync(OUT_DIR, { recursive: true });

const md = [];
md.push("# Galerina — Package & Dev-Tool Index");
md.push("");
md.push("> Auto-generated by `scripts/dev-tool-index.mjs` (owner ask: graph + index packages incl. dev tools). Do not hand-edit — re-run to refresh.");
md.push("");
const t = summary.totals;
md.push(`**${t.packages}** packages (${t.testBearing} test-bearing · ${t.tests.toLocaleString()} tests) · ` +
  `**${t.devTools}** dev tools (${t.auditTools} audits · ${t.toolsInCadence} in the phase-close cadence) · **${t.proofs}** proofs.`);
md.push("");

md.push("## Packages by kind");
md.push("");
md.push("| Kind | # | Tests | Packages |");
md.push("|---|--:|--:|---|");
for (const k of KIND_ORDER.concat(Object.keys(byKind).filter((x) => !KIND_ORDER.includes(x)))) {
  const ps = byKind[k]; if (!ps) continue;
  const tt = ps.reduce((a, p) => a + (p.tests || 0), 0);
  md.push(`| ${k} | ${ps.length} | ${tt.toLocaleString()} | ${ps.map((p) => p.name.replace(/^galerina-/, "")).join(", ")} |`);
}
md.push("");

md.push("## Package index");
md.push("");
md.push("| Package | Kind | Tests | Border | Deps | Role |");
md.push("|---|---|--:|:--:|--:|---|");
for (const p of packages) {
  md.push(`| \`${p.name}\` | ${p.kind} | ${p.tests ?? "—"} | ${p.border} | ${p.deps.length} | ${p.description || "—"} |`);
}
md.push("");

md.push("## Dev-tool index");
md.push("");
md.push("| Tool | Category | Self-test | In cadence | Concerns | Purpose |");
md.push("|---|---|:--:|:--:|---|---|");
for (const tl of tools) {
  md.push(`| \`${tl.name}\` | ${tl.category} | ${tl.selfTest ? "✅" : "—"} | ${tl.inCadence ? "✅" : "—"} | ${tl.concerns.join(", ") || "—"} | ${tl.purpose} |`);
}
md.push("");

md.push("## Coverage — concern → tools");
md.push("");
md.push("| Concern | Guarded by |");
md.push("|---|---|");
for (const c of allConcerns) {
  md.push(`| ${c} | ${(concernToTools[c] || []).map((n) => "`" + n + "`").join(", ") || "**⚠ NO TOOL**"} |`);
}
md.push("");

md.push("## Gaps");
md.push("");
md.push(`- **Test-bearing packages with 0 counted tests:** ${gaps.packagesNoTests.length ? gaps.packagesNoTests.join(", ") : "none ✅"}`);
md.push(`- **Concerns with NO dev tool:** ${gaps.concernsNoTool.length ? gaps.concernsNoTool.join(", ") : "none ✅"}`);
md.push(`- **audit/lint tools NOT in the phase-close cadence:** ${gaps.toolsNotInCadence.length ? gaps.toolsNotInCadence.map((n) => "`" + n + "`").join(", ") : "none ✅"}`);
md.push("");
md.push("Graphs: `packages.mmd` (workspace dependency graph, by kind) · `tooling.mmd` (tool → concern coverage). Machine view: `index.json`.");
md.push("");
writeFileSync(join(OUT_DIR, "INDEX.md"), md.join("\n"));
writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(summary, null, 2));

// ── mermaid: package dependency graph, grouped by kind ──
const id = (n) => n.replace(/[^a-zA-Z0-9]/g, "_");
const pkgNames = new Set(packages.map((p) => "@galerina/" + p.name.replace(/^galerina-/, "")));
const mm = ["flowchart LR"];
for (const k of Object.keys(byKind)) {
  mm.push(`  subgraph ${id(k)}["${k}"]`);
  for (const p of byKind[k]) mm.push(`    ${id(p.name)}["${p.name.replace(/^galerina-/, "")}"]`);
  mm.push("  }");
}
for (const p of packages) {
  for (const d of p.deps) {
    const dep = packages.find((q) => "@galerina/" + q.name.replace(/^galerina-/, "") === d);
    if (dep) mm.push(`  ${id(p.name)} --> ${id(dep.name)}`);
  }
}
writeFileSync(join(OUT_DIR, "packages.mmd"), mm.join("\n"));

// ── mermaid: tool → concern coverage ──
const tm = ["flowchart LR"];
for (const c of allConcerns) tm.push(`  C_${id(c)}(["${c}"])`);
for (const tl of tools) {
  if (!tl.concerns.length) continue;
  tm.push(`  T_${id(tl.name)}["${tl.name}"]`);
  for (const c of tl.concerns) tm.push(`  T_${id(tl.name)} --> C_${id(c)}`);
}
writeFileSync(join(OUT_DIR, "tooling.mmd"), tm.join("\n"));

console.log(`dev-tool-index: ${t.packages} packages · ${t.devTools} tools · ${t.proofs} proofs → ${OUT_DIR}`);
console.log(`  gaps: ${gaps.packagesNoTests.length} pkgs-no-tests · ${gaps.concernsNoTool.length} concerns-no-tool · ${gaps.toolsNotInCadence.length} audits-not-gated`);

// ── --check cadence gate ──
if (CHECK) {
  const problems = [];
  if (gaps.concernsNoTool.length) problems.push(`concern(s) with no tool: ${gaps.concernsNoTool.join(", ")}`);
  // (packagesNoTests is informational — many template pkgs legitimately have no suite; not gated)
  if (problems.length) { console.error("dev-tool-index --check FAILED:\n  " + problems.join("\n  ")); process.exit(1); }
  console.log("dev-tool-index --check: OK");
}
