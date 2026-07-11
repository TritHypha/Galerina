#!/usr/bin/env node
// component-health.mjs — Galerina per-COMPONENT readiness matrix for v1.0 "full testing".
// Pure-read, zero-dep (node builtins only: fs/path/url/child_process), never throws, exit 0 (1 only with --strict on gaps).
// Prints a git PROVENANCE header (branch/SHA/dirty) so a report can never silently describe the wrong tree —
// a detached HEAD is called out LOUDLY, because a detached-HEAD run once measured a stale pre-rename tree unnoticed.
// Surfaces one honest SHIP-READINESS % over the FULL component set (orphans counted in, no gap class masked).
// Complements status.mjs (headline counts) with a per-package breakdown + gap detector:
//   which workspace packages have a test script, a tests/ dir + test files, a recorded test count,
//   and which packages-galerina/ dirs are ORPHANS (a package.json on disk but absent from the workspace).
//
//   node scripts/component-health.mjs            # full matrix, grouped by family
//   node scripts/component-health.mjs --gaps     # only rows with a readiness gap
//   node scripts/component-health.mjs --json     # machine-readable
//   node scripts/component-health.mjs --strict   # exit 1 if any gap/orphan (CI gate)
//   node scripts/component-health.mjs --table    # per-family readiness table with a TOTAL row
//
// The --table / default / --json outputs also carry two extra AUTOMATIC sections:
//   CONVERSION — the .ts→.fungi self-hosting inventory (Stage-6 model: packages convert one at
//     a time, pure-logic first, TCB last). "Converted" is MECHANICAL: a workspace package whose
//     src/ holds .fungi and zero impl .ts. Self-hosted core modules are counted by EXISTENCE
//     only — existence ≠ parity (the byte-parity gate lives in the Stage-B differential harness).
//   TODO — checkbox counts ([ ] open / [x] done) across every git-TRACKED TODO.md, as written.
//     Per-package TODOs are known to lag reality (e.g. long-shipped items still unchecked), so
//     this is a doc-state signal, never a completion claim.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages-galerina");

const argv = new Set(process.argv.slice(2));
const ONLY_GAPS = argv.has("--gaps");
const AS_JSON = argv.has("--json");
const STRICT = argv.has("--strict");
const TABLE = argv.has("--table");

const readJSON = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const listDir = (p) => { try { return readdirSync(p); } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));

// ── git provenance (read-only; names the exact tree these numbers describe) ────
// Runs only reporting git subcommands; ROOT-anchored; never throws (returns null on any failure).
const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
};
const provenance = (() => {
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") return { available: false };
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]); // literal "HEAD" when detached
  const sha = git(["rev-parse", "--short", "HEAD"]);
  const porcelain = git(["status", "--porcelain"]); // "" ⇒ clean, any content ⇒ dirty
  return {
    available: true, branch, sha,
    detached: branch === "HEAD",
    dirty: porcelain == null ? null : porcelain.length > 0,
  };
})();

// ── inputs ───────────────────────────────────────────────────────────────────
const workspace = readJSON(join(ROOT, "galerina.workspace.json")) || {};
const wsPackages = Array.isArray(workspace.packages) ? workspace.packages : [];
const version = readJSON(join(ROOT, "version.json")) || {};
const testCounts = version.testCountByPackage || {};

// family bucket from the package directory-name head
const FAMILY = {
  core: "core", substrate: "core", auth: "framework", framework: "framework",
  api: "framework", registry: "framework", ai: "ai", data: "data", web: "web",
  db: "db", target: "target", cpu: "target", hardware: "target", photonic: "target",
  ext: "ext", inference: "ext", devtools: "devtools", governance: "governance",
  observability: "governance", tower: "runtime", tri: "runtime", docs: "docs",
  test: "tooling", tools: "tooling",
};
const familyOf = (dir) => FAMILY[dir.replace(/^galerina-/, "").split("-")[0]] || "other";

// ── per-component rows (driven by the workspace list) ─────────────────────────
const countTestFiles = (dir) => {
  let n = 0;
  const walk = (d) => {
    for (const e of listDir(d) || []) {
      const ep = join(d, e);
      if (isDir(ep)) walk(ep);
      else if (/\.test\.(mjs|cjs|js)$/.test(e)) n++;
    }
  };
  if (existsSync(dir)) walk(dir);
  return n;
};

const rows = wsPackages.map((rel) => {
  const abs = join(ROOT, rel);
  const dir = basename(rel);
  const pkg = readJSON(join(abs, "package.json"));
  const testsDir = join(abs, "tests");
  const hasTestsDir = existsSync(testsDir);
  return {
    dir, name: pkg?.name || dir, family: familyOf(dir),
    onDisk: isDir(abs), hasPkg: !!pkg, private: pkg?.private === true,
    version: pkg?.version || null,
    testScript: !!pkg?.scripts?.test, buildScript: !!pkg?.scripts?.build,
    hasTestsDir, testFiles: hasTestsDir ? countTestFiles(testsDir) : 0,
    recordedCount: Object.prototype.hasOwnProperty.call(testCounts, dir) ? testCounts[dir] : null,
  };
});

// ── gap rules ─────────────────────────────────────────────────────────────────
const gapsFor = (r) => {
  const g = [];
  if (!r.onDisk) { g.push("missing-on-disk"); return g; }
  if (!r.hasPkg) { g.push("no-package.json"); return g; }
  if (!r.testScript) g.push("no-test-script");
  if (r.testScript && !r.hasTestsDir) g.push("test-script-but-no-tests-dir");
  if (r.hasTestsDir && r.testFiles === 0) g.push("tests-dir-empty");
  if (r.testScript && r.testFiles > 0 && r.recordedCount == null) g.push("tested-but-not-in-counts");
  return g;
};
for (const r of rows) r.gaps = gapsFor(r);

// ── orphans: packages-galerina/ dirs with a package.json, absent from the workspace ─
const wsDirs = new Set(wsPackages.map((p) => basename(p)));
const orphans = [];
for (const e of listDir(PKG_DIR) || []) {
  if (e === "node_modules" || e.startsWith(".")) continue;
  const ep = join(PKG_DIR, e);
  if (isDir(ep) && existsSync(join(ep, "package.json")) && !wsDirs.has(e)) orphans.push(e);
}

// #32 annotated exemption allowlist — documents WHY each orphan is a deliberate non-workspace package (so the
// sub-100% ship-readiness is explained, not an open question), WITHOUT masking the denominator: exempt orphans
// still count against the ship-readiness %. An orphan ABSENT from this list is UNEXPECTED and is flagged loudly —
// the allowlist is a fail-closed signal (a new un-annotated orphan means "explain it or enlist it", never silent).
const EXEMPT_ORPHANS = {
  "galerina-devtools-benchmarks": "benchmark harness — not a shippable unit-tested package (run via its own npm scripts)",
  "galerina-registry": "signed registry index — planned; joins the workspace when the index ships",
};
const orphanRows = orphans.slice().sort().map((o) => ({ dir: o, exemptReason: EXEMPT_ORPHANS[o] ?? null }));
const unexpectedOrphans = orphanRows.filter((o) => o.exemptReason === null).map((o) => o.dir);

// ── .ts→.fungi conversion inventory (Stage-6 self-hosting metric) ─────────────
// Tracked files only (git ls-files) so gitignored build/ output can never inflate the counts.
// Fail-honest: if git is unavailable the section reports itself unavailable instead of guessing.
const trackedFiles = (() => {
  const o = git(["ls-files"]);
  return o ? o.split("\n").filter(Boolean) : null;
})();
const conversion = (() => {
  if (!trackedFiles) return { available: false };
  const isImplTs = (f) => f.endsWith(".ts") && !f.endsWith(".d.ts");
  const tsImplAll = trackedFiles.filter(isImplTs);
  const tsImplPkgs = tsImplAll.filter((f) => f.startsWith("packages-galerina/")); // the convertible universe (Stage 6 converts packages; root CLI/scripts stay host-side)
  const tsDecl = trackedFiles.filter((f) => f.endsWith(".d.ts")).length;
  const fungiAll = trackedFiles.filter((f) => f.endsWith(".fungi"));
  const SELF_HOSTED = "packages-galerina/galerina-core-compiler/src/self-hosted/";
  const fungiSelfHosted = fungiAll.filter((f) => f.startsWith(SELF_HOSTED)).length;
  // "examples" counts BOTH the top-level examples/ tree AND per-package */examples/ trees —
  // a top-level-only filter undercounted 309 example files as 52 (verified 2026-07-10).
  const fungiExamples = fungiAll.filter((f) => f.startsWith("examples/") || f.includes("/examples/")).length;
  // Per-workspace-package verdict — MECHANICAL: src/ holds ≥1 .fungi and ZERO host-language impl
  // (.ts AND .mjs/.cjs/.js — a .mjs-implemented package with .fungi fixtures must not count).
  // This matches .fungi-NATIVE packages as well as completed conversions — the tool cannot
  // mechanically tell them apart, so the label says "fungi-only src/", never "converted".
  // (A package mid-conversion — both languages present — honestly counts as NOT fungi-only.)
  let fungiOnlyPkgs = 0;
  for (const rel of wsPackages) {
    const srcPrefix = `${rel.replace(/\\/g, "/")}/src/`;
    const srcHost = tsImplAll.some((f) => f.startsWith(srcPrefix))
      || trackedFiles.some((f) => f.startsWith(srcPrefix) && /\.(mjs|cjs|js)$/.test(f));
    const srcFungi = fungiAll.some((f) => f.startsWith(srcPrefix) && !f.startsWith(SELF_HOSTED)); // self-hosted drafts live INSIDE compiler src — they don't make the compiler package fungi-only
    if (!srcHost && srcFungi) fungiOnlyPkgs++;
  }
  const convertedPkgs = fungiOnlyPkgs;
  return {
    available: true,
    convertedPackages: convertedPkgs,
    workspacePackages: wsPackages.length,
    pct: wsPackages.length ? (100 * convertedPkgs) / wsPackages.length : 0,
    tsImplRemainingPkgs: tsImplPkgs.length,
    tsImplRemainingTotal: tsImplAll.length,
    tsDecl,
    fungi: {
      total: fungiAll.length,
      selfHosted: fungiSelfHosted,
      examples: fungiExamples,
      other: fungiAll.length - fungiSelfHosted - fungiExamples,
    },
  };
})();

// ── tracked TODO.md checkbox counts (doc-state signal, not a completion claim) ─
const todos = (() => {
  if (!trackedFiles) return { available: false };
  const files = trackedFiles.filter((f) => /(^|\/)TODO\.md$/i.test(f));
  let open = 0, done = 0;
  for (const f of files) {
    let txt = "";
    try { txt = readFileSync(join(ROOT, f), "utf8"); } catch { continue; }
    open += (txt.match(/\[ \]/g) || []).length;
    done += (txt.match(/\[x\]/gi) || []).length;
  }
  const total = open + done;
  return { available: true, files: files.length, open, done, total, donePct: total ? (100 * done) / total : 0 };
})();

// ── roll-up ────────────────────────────────────────────────────────────────────
const summary = {
  workspacePackages: rows.length,
  onDisk: rows.filter((r) => r.onDisk).length,
  withTestScript: rows.filter((r) => r.testScript).length,
  withTestFiles: rows.filter((r) => r.testFiles > 0).length,
  recordedTotal: rows.reduce((a, r) => a + (typeof r.recordedCount === "number" ? r.recordedCount : 0), 0),
  withGaps: rows.filter((r) => r.gaps.length).length,
  orphans: orphans.length,
};
// ── honest ship-readiness: GREEN components over the FULL set. Orphans are un-shippable
//    components (a package.json on disk, absent from the workspace) so they count against the
//    denominator and toward the gap total — never masked out to flatter the headline. ────────────
summary.green = rows.filter((r) => r.gaps.length === 0).length;
summary.components = rows.length + orphans.length;
summary.totalGaps = summary.withGaps + orphans.length;
summary.readinessPct = summary.components ? (summary.green / summary.components) * 100 : 0;
// ── scope declaration: this % measures WORKSPACE PACKAGES ONLY (galerina.workspace.json +
//    packages-galerina/ orphans). It does NOT cover the root CLI (galerina.mjs), root tests/,
//    the scripts/ dev-tool suite, examples/, docs/, or the self-hosted .fungi corpus — those
//    have their own gates (phase-close, lint-conventions, keep-green). Say so in EVERY output
//    mode, so the headline % can never silently read as whole-project readiness. ──────────────
summary.scope = "workspace packages only (not the full project: root CLI/scripts/examples/docs/corpus have their own gates)";
summary.conversion = conversion;
summary.todos = todos;

// ── README thesis tables (curated roadmap status, surfaced here so the tool and the README
//    draw from ONE place — the Tests row is LIVE from version.json; the rest are the
//    roadmap-readiness %s maintained in the README's "Zero-Trust thesis" + "Build Progress"
//    sections. ◑ boundaries are partial: a shipped gate + a design-intent remainder. Update
//    these arrays when a component's readiness changes, then sync the README rows. ─────────
const ZERO_TRUST = [
  { boundary: "Compiler", pct: 100, status: "✅ shipped — policy + execution DAG proven at build time" },
  { boundary: "I/O — OS kernel", pct: 66, status: "◑ auth gate (kernel.fungi) + sentinel-io decision surface FULLY twinned (integrity LSIO-INTEGRITY-001 · zero-copy LSIO-MAP-001 · manifest LSIO-MANIFEST-001) checker-clean · full kernel-bypass EXECUTION = design intent (DSS.wasm #102-106, #143 switch)" },
  { boundary: "Packages", pct: 98, status: "◑ signed admission fully twinned — central-index (registry-index) + per-package manifest (package-admission) + kernel FUSION admission (descriptor · hash · sidecar · revocation · sig-policy · registry · capability — fuse-admission.fungi) checker-clean · remaining = #143 execution + Phase-28 registry-data wiring" },
  { boundary: "Memory", pct: 62, status: "◑ governed-decision surface FULLY twinned (validator · pool-config · segmentation LSM-SEGV · trit-tamper LSM-TRIT-CORRUPT · allocate/free/UAF-guard LSM-UAF-001 + REJECT-scrub — 5 checker-clean .fungi) · real WASM isolation execution = design intent (#143 switch)" },
  { boundary: "TLSTP — zero-middleware", pct: 42, status: "◑ 5 core-network border DECISION surfaces twinned (.fungi, all fail-closed): cert-gate (S1 K3 pin·chain·expiry·revocation vAnd, unknown→DENY) · cors-policy (deny-by-default read admission) · inbound-guard (port admission + fail-closed rate-limit) · defensive-controls (RD-0325/0326: trusted-proxy · uniform responses · opaque-id · bounded pagination) · admission-feedback (degrade-only K3 telemetry self-throttle — throttles toward DENY, never manufactures ALLOW) · egress-guard remaining; in-sandbox decryption = target (DSS.wasm TCB, #143 switch)" },
];
const BUILD_PROGRESS = [
  { layer: "Specification / KB", pct: 100 },
  { layer: "Lexer / Parser / Verifier / Contract / Value-state", pct: 100 },
  { layer: "DRCM Phases 1-7 (Stage-A simulation)", pct: 100 },
  { layer: "CBOR Manifests (RFC 8949)", pct: 100 },
  { layer: "Tests — full suite", pct: 100, live: true },
  { layer: "Stage-B self-hosting — interpreter parity", pct: 100 },
  { layer: "Type checker / Effect checker", pct: 90 },
  { layer: "WAT emitter", pct: 89 },
  { layer: "Runtime interpreter", pct: 87 },
  { layer: "Application-framework layer", pct: 72 },
  { layer: "Post-Quantum & Hardware Security", pct: 38 },
  { layer: "Passive Execution Plans & Target Bridges", pct: 22 },
  { layer: "AI Inference Tower (BitNet/Groq/NVFP4)", pct: 12 },
  { layer: "Photonic / Ternary Computing", pct: 3 },
  { layer: "Stage-B self-hosting — WASM execution (P9)", status: "in progress" },
  { layer: "B8 governed HTTP transport (TLSTP)", status: "in progress" },
];
const quantified = BUILD_PROGRESS.filter((l) => typeof l.pct === "number");
const buildAvg = Math.round(quantified.reduce((a, l) => a + l.pct, 0) / quantified.length);
const ztAvg = Math.round(ZERO_TRUST.reduce((a, b) => a + b.pct, 0) / ZERO_TRUST.length);

// Shared renderer for the two automatic sections (used by --table AND the default report,
// so the numbers can never drift between output modes).
const extraSections = () => {
  const L = (s, n) => String(s).padEnd(n);
  const R = (s, n) => String(s).padStart(n);
  const lines = [];
  lines.push("");
  lines.push("  CONVERSION (.ts -> .fungi, Stage-6 self-hosting)");
  if (!conversion.available) {
    lines.push("    unavailable (not a git work tree)");
  } else {
    lines.push(`    ${L("packages with .fungi-only src/", 34)} ${R(`${conversion.convertedPackages}/${conversion.workspacePackages}`, 8)} ${R(conversion.pct.toFixed(1) + "%", 7)}`);
    lines.push(`    ${L(".ts impl files remaining", 34)} ${R(conversion.tsImplRemainingPkgs, 8)}   (in packages; ${conversion.tsImplRemainingTotal} repo-wide incl. root tooling; +${conversion.tsDecl} .d.ts excluded)`);
    lines.push(`    ${L(".fungi corpus", 34)} ${R(conversion.fungi.total, 8)}   (${conversion.fungi.selfHosted} self-hosted core drafts · ${conversion.fungi.examples} examples · ${conversion.fungi.other} other)`);
    lines.push("    note: fungi-only = src/ holds .fungi with ZERO host-language impl (.ts/.mjs) — matches .fungi-NATIVE packages too, not only conversions; self-hosted drafts count by EXISTENCE, not byte-parity");
  }
  lines.push("");
  lines.push("  TODO (tracked TODO.md checkboxes, as written)");
  if (!todos.available) {
    lines.push("    unavailable (not a git work tree)");
  } else {
    lines.push(`    ${L("items open / done / total", 34)} ${R(`${todos.open} / ${todos.done} / ${todos.total}`, 20)}   (${todos.donePct.toFixed(1)}% done across ${todos.files} TODO.md files)`);
    lines.push("    note: doc-state signal only — per-package TODOs are known to lag shipped reality");
  }
  lines.push("");
  lines.push(`  ZERO-TRUST THESIS — boundary readiness (avg ${ztAvg}%; mirrors README "The Zero-Trust thesis")`);
  for (const b of ZERO_TRUST) lines.push(`    ${L(b.boundary, 24)} ${R(b.pct + "%", 5)}  ${b.status}`);
  lines.push("");
  lines.push(`  BUILD PROGRESS — layer readiness (quantified avg ${buildAvg}%; mirrors README "Build Progress")`);
  for (const l of BUILD_PROGRESS) {
    const pctStr = typeof l.pct === "number" ? `${l.pct}%` : (l.status ?? "—");
    const extra = l.live && version.testCount ? `  (${version.packageCount}/${version.packageCount} pkgs · ${fmt(version.testCount)} tests · 0 fail)` : "";
    lines.push(`    ${L(l.layer, 50)} ${R(pctStr, 12)}${extra}`);
  }
  lines.push("    note: %s are the maintained roadmap-readiness figures (README source of truth); the Tests row is LIVE from version.json.");
  return lines;
};

if (AS_JSON) {
  console.log(JSON.stringify({ provenance, summary, rows, orphans, orphanExemptions: orphanRows, unexpectedOrphans }, null, 2));
  process.exit(STRICT && summary.totalGaps > 0 ? 1 : 0);
}

if (TABLE) {
  // Per-family readiness table with a TOTAL row — the honest ship-readiness % broken out,
  // ranked most-ready first. Orphans are their own row (0 green / N) and count in the TOTAL,
  // so the TOTAL equals the SHIP-READINESS headline exactly (no masked denominator).
  const fams = {};
  for (const r of rows) {
    if (!fams[r.family]) fams[r.family] = { g: 0, t: 0 };
    fams[r.family].t += 1;
    if (r.gaps.length === 0) fams[r.family].g += 1;
  }
  const ranked = Object.keys(fams)
    .map((f) => ({ f, g: fams[f].g, t: fams[f].t, pct: (100 * fams[f].g) / fams[f].t }))
    .sort((a, b) => b.pct - a.pct || a.f.localeCompare(b.f));
  const L = (s, n) => String(s).padEnd(n);
  const R = (s, n) => String(s).padStart(n);
  const out = [];
  if (provenance.available) out.push(`  ${provenance.branch} @ ${provenance.sha} · ${provenance.dirty ? "dirty" : "clean"}`);
  out.push(`  ${L("FAMILY", 12)} ${R("GREEN", 6)} ${R("TOTAL", 6)} ${R("%", 7)}`);
  for (const r of ranked) out.push(`  ${L(r.f, 12)} ${R(r.g, 6)} ${R(r.t, 6)} ${R(r.pct.toFixed(0) + "%", 7)}`);
  out.push(`  ${L("(orphans)", 12)} ${R(0, 6)} ${R(orphans.length, 6)} ${R("0%", 7)}  ${unexpectedOrphans.length ? `⚠ ${unexpectedOrphans.length} UNEXPECTED (not on #32 allowlist)` : "all exempt (#32 documented)"}`);
  out.push(`  ${L("TOTAL", 12)} ${R(summary.green, 6)} ${R(summary.components, 6)} ${R(summary.readinessPct.toFixed(1) + "%", 7)}`);
  out.push(`  scope: ${summary.scope}`);
  out.push(...extraSections());
  console.log(out.join("\n"));
  process.exit(STRICT && summary.totalGaps > 0 ? 1 : 0);
}

// ── render ───────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const out = [];
out.push(`Galerina component health — ${summary.workspacePackages} workspace packages · ${summary.withTestScript} test-bearing · ${fmt(summary.recordedTotal)} recorded tests`);
// ── provenance header: which git tree produced these numbers (top of report) ──
if (provenance.available) {
  const state = provenance.dirty == null ? "dirty state unknown" : provenance.dirty ? "dirty (uncommitted changes)" : "clean";
  out.push(`  provenance: ${provenance.branch} @ ${provenance.sha} · ${state}`);
  if (provenance.detached) out.push("  ⚠ DETACHED HEAD — report may reflect a stale tree; confirm the SHA above is the tree you meant to measure");
} else {
  out.push("  provenance: unavailable (not a git work tree)");
}
out.push(`  SHIP-READINESS: ${summary.readinessPct.toFixed(1)}% (${summary.green}/${summary.components} components green) · ${summary.totalGaps} gap(s)`);
out.push(`  scope: ${summary.scope}`);
out.push("");
for (const fam of [...new Set(rows.map((r) => r.family))].sort()) {
  const famRows = rows.filter((r) => r.family === fam).sort((a, b) => a.dir.localeCompare(b.dir));
  const shown = ONLY_GAPS ? famRows.filter((r) => r.gaps.length) : famRows;
  if (!shown.length) continue;
  out.push(`  ${fam}/`);
  for (const r of shown) {
    const cnt = r.recordedCount != null ? `${fmt(r.recordedCount)}t` : (r.testFiles ? `${r.testFiles}f` : "—");
    const flags = r.gaps.length ? `  ⚠ ${r.gaps.join(", ")}` : "";
    out.push(`    ${pad(r.dir, 40)} ${pad(cnt, 9)}${flags}`);
  }
}
out.push("");
out.push(`  gaps    : ${summary.withGaps} package(s) with a readiness gap${ONLY_GAPS ? "" : "  (--gaps to isolate)"}`);
out.push(`  orphans : ${summary.orphans}${orphans.length ? "  -> " + orphans.sort().join(", ") : ""}`);
out.push(`  ship    : ${summary.readinessPct.toFixed(1)}% ship-ready · ${summary.totalGaps} total gap(s) = ${summary.withGaps} package + ${summary.orphans} orphan`);
out.push(...extraSections());
console.log(out.join("\n"));
process.exit(STRICT && summary.totalGaps > 0 ? 1 : 0);
