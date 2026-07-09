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

if (AS_JSON) {
  console.log(JSON.stringify({ provenance, summary, rows, orphans }, null, 2));
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
  out.push(`  ${L("(orphans)", 12)} ${R(0, 6)} ${R(orphans.length, 6)} ${R("0%", 7)}`);
  out.push(`  ${L("TOTAL", 12)} ${R(summary.green, 6)} ${R(summary.components, 6)} ${R(summary.readinessPct.toFixed(1) + "%", 7)}`);
  out.push(`  scope: ${summary.scope}`);
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
console.log(out.join("\n"));
process.exit(STRICT && summary.totalGaps > 0 ? 1 : 0);
