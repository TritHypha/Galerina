#!/usr/bin/env node
/**
 * audit-package-border.mjs — Hardened Border CI gate (#149), ENFORCING + fail-closed.
 *
 * Re-scans EVERY package under packages-galerina/ FROM SOURCE with the real scanner and enforces that
 * package's committed `.graph/boundary-policy.json` allowlist. This is the zero-trust gate: it does NOT
 * trust the committed `.graph/package-graph.json` (the artifact a drift-introducer controls) — it
 * RE-DERIVES the external import surface from source, then FAILS the build on:
 *   • an external import not in allowedExternal           (drift past the Hardened Border)
 *   • a missing boundary-policy.json under enforcement    (delete-to-launder defence — see reporter.js)
 *   • a malformed/non-array allowlist                     (unknown → deny, never allow-all)
 *   • a VACUOUS scan — 0 files matched but a source root holds code (the .mjs blind-spot class: a green
 *                                                          border over an UNSCANNED package; the fix is a
 *                                                          packageGraph.extensions override in package.json)
 *
 * Anti-neuter: a `--self-test` proves the gate still FIRES (on an unlisted external, a missing policy, AND a
 * vacuous scan) before the enforcing sweep — a border gate that has been silently defanged is itself a fail-open.
 *
 * Requires the scanner to be BUILT first (`tsc` on galerina-devtools-package-graph — it is pure TS with no
 * third-party deps, so the CI build is just tsc, no `npm install` of package deps). If the scanner dist is
 * absent the gate EXITS NON-ZERO rather than skipping (a gate that can't run must not pass).
 *
 * Usage:
 *   node scripts/audit-package-border.mjs --self-test   # prove the detector fires, then exit 0
 *   node scripts/audit-package-border.mjs               # self-test + enforcing sweep (CI)
 *
 * Exit codes: 0 clean · 1 boundary violation(s) found · 2 gate could not run / detector neutered.
 *
 * Residual (honestly scoped): orphan-file findings are advisory here (parity with the CLI --check, which
 * exits 1 only on boundary FAIL). #40 tracks scanner bare-subpath vs relative-form border identity.
 */
import { readdirSync, existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "packages-galerina", "galerina-devtools-package-graph", "dist");
const PKG_ROOT = join(ROOT, "packages-galerina");

// A "vacuous PASS" is a green border over an UNSCANNED package: the scanner matched ZERO files, yet the
// package's source roots DO contain code — the extension just isn't in the scan set (the .mjs blind-spot
// class, RD-0348). Recognised code extensions (excluding .d.ts, which carries no import surface).
const CODE_EXT = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".fungi"];

/** True iff `dir` (recursively, skipping dist/node_modules) holds a real code file. */
function dirHasCode(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      if (dirHasCode(join(dir, e.name))) return true;
    } else if (!e.name.endsWith(".d.ts") && CODE_EXT.some((x) => e.name.endsWith(x))) {
      return true;
    }
  }
  return false;
}

/** A scan that matched 0 files while one of its (existing) source roots holds code is a vacuous border. */
function isVacuousScan(scan) {
  if (scan.files.length > 0) return false;
  return scan.roots.some((r) => dirHasCode(join(scan.scopePath, r)));
}

async function loadScanner() {
  for (const f of ["scanner.js", "graph.js", "reporter.js"]) {
    if (!existsSync(join(DIST, f))) {
      console.error(
        `FAIL: the package-graph scanner is not built (${join(DIST, f)} missing).\n` +
        `       Build it first:  npx -p typescript tsc -p packages-galerina/galerina-devtools-package-graph/tsconfig.json\n` +
        `       (A border gate that cannot run must not silently pass.)`,
      );
      process.exit(2);
    }
  }
  const { scanPackage } = await import(pathToFileURL(join(DIST, "scanner.js")).href);
  const { buildGraph } = await import(pathToFileURL(join(DIST, "graph.js")).href);
  const { runBoundaryGate } = await import(pathToFileURL(join(DIST, "reporter.js")).href);
  return { scanPackage, buildGraph, runBoundaryGate };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CROSS-PACKAGE RELATIVE IMPORTS — the border crossing this gate did not look at (2026-07-17)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FINDING. This gate reported "95 PASS / 0 FAIL — every package's external surface is within its
// Hardened Border" while 39 imports reached into a SIBLING package's dist/ by relative path. It was not
// a bug: the surface is EXTERNAL (npm) specifiers checked against `allowedExternal`, and
// `../../sibling/dist/x.js` is a relative FILE PATH, not an external — so it fell outside the surface
// entirely. The verdict was honest for its surface. Its surface just wasn't the border. That the gate is
// NAMED "Hardened Border" is what makes it dangerous: a reader takes "95 PASS" to mean exactly the thing
// that was never checked.
//
// WHY IT IS A BORDER CROSSING — and the most dangerous kind. `../../sibling/` bypasses package.json
// altogether: no declaration, no version, no npm resolution, and invisible to the file:-closure walk
// (which is how one of these broke a clean-checkout CI build — the closure could not see an edge that
// exists only in code).
//
// TWO SEVERITIES, deliberately distinct:
//   • ANY `../../<sibling>/…`  → PUBLISH-BLOCKER. It resolves in the monorepo and CANNOT resolve for
//     anyone running `npm install @galerina/<pkg>` — a published tarball has no `../../` sibling — and
//     it reaches into `dist/` rather than the package's public entry, so no `exports` map can rescue it.
//     These packages are not standalone, which is the whole point of the package standard.
//   • …AND UNDECLARED (package.json names neither) → also a clean-clone BUILD-BREAKER.
//
// G0: the green must say what it does NOT check. That one line, present from the start, would have
// surfaced this the day the gate shipped.
const PKG_DIR_NAMES = () => readdirSync(PKG_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

/**
 * Find cross-package relative imports in one package's source. Pure-ish: `siblings` is injected so the
 * self-test drives it with a fixture instead of the real tree (a DI seam, no monkeypatching).
 * Only counts `../../<x>/…` where <x> is a REAL sibling package dir — `../../lib/util.js` inside a
 * package is not a border crossing, and calling it one would be a false positive.
 */
export function findCrossPackageRelativeImports(sourceText, siblings) {
  const out = [];
  for (const m of sourceText.matchAll(/from\s+["']\.\.\/\.\.\/([a-z0-9-]+)\/([^"']*)["']/g)) {
    const sib = m[1];
    if (!siblings.includes(sib)) continue;
    out.push({ sibling: sib, path: m[2], reachesDist: m[2].startsWith("dist/") });
  }
  return out;
}

/** Re-scan a package from source and enforce its committed policy (check=true → never auto-baselines). */
function checkPkg(S, pkgPath) {
  const scan = S.scanPackage(pkgPath);
  const graph = S.buildGraph(scan);
  const gate = S.runBoundaryGate(pkgPath, graph, /* check */ true);
  // Vacuous-PASS guard (RD-0348): a 0-file scan over a package that DOES have source code is a green
  // border over an unscanned package — fail-closed rather than let it pass silently, and name the fix.
  if (gate.status !== "FAIL" && isVacuousScan(scan)) {
    return {
      status: "FAIL",
      violations: [
        "vacuous border — 0 files matched this package's scan extensions, but its source roots contain " +
        "code files. The border is green over an UNSCANNED package. Add a `packageGraph`.extensions " +
        "override to package.json covering the real source extension(s) so its imports are gated.",
      ],
      orphanWarnings: gate.orphanWarnings ?? [],
    };
  }
  return gate;
}

/** The gate must FIRE on (A) an unlisted external and (B) a missing policy. Else it is neutered. */
function selfTest(S) {
  const base = mkdtempSync(join(tmpdir(), "fungi-border-selftest-"));
  try {
    // (A) source imports an unlisted external; policy allows nothing → must FAIL with that specifier.
    const a = join(base, "pkgA");
    mkdirSync(join(a, "src"), { recursive: true });
    mkdirSync(join(a, ".graph"), { recursive: true });
    writeFileSync(join(a, "package.json"), JSON.stringify({ name: "@selftest/a" }));
    writeFileSync(join(a, "src", "index.ts"), 'import x from "evil-unlisted-dep";\nexport const y = x;\n');
    writeFileSync(join(a, ".graph", "boundary-policy.json"), JSON.stringify({ packageName: "@selftest/a", allowedExternal: [] }));
    const ra = checkPkg(S, a);
    if (ra.status !== "FAIL" || !ra.violations.some((v) => String(v).includes("evil-unlisted-dep"))) {
      console.error("SELF-TEST FAIL: gate did not flag an unlisted external (detector neutered):", JSON.stringify(ra));
      process.exit(2);
    }
    // (B) source imports a dep but there is NO policy file → must FAIL closed (delete-to-launder defence).
    const b = join(base, "pkgB");
    mkdirSync(join(b, "src"), { recursive: true });
    writeFileSync(join(b, "package.json"), JSON.stringify({ name: "@selftest/b" }));
    writeFileSync(join(b, "src", "index.ts"), 'import z from "another-dep";\nexport const w = z;\n');
    const rb = checkPkg(S, b);
    if (rb.status !== "FAIL") {
      console.error("SELF-TEST FAIL: a missing policy did not fail-closed (delete-to-launder hole):", JSON.stringify(rb));
      process.exit(2);
    }
    // (C) source is a code file whose extension the DEFAULT scan misses (.mjs) with NO packageGraph override
    // → the scan matches 0 files while a root holds code → the vacuous-border guard must FIRE (RD-0348).
    const c = join(base, "pkgC");
    mkdirSync(join(c, "src"), { recursive: true });
    mkdirSync(join(c, ".graph"), { recursive: true });
    writeFileSync(join(c, "package.json"), JSON.stringify({ name: "@selftest/c" }));
    writeFileSync(join(c, "src", "bench.mjs"), 'import cp from "node:child_process";\nexport const r = cp;\n');
    writeFileSync(join(c, ".graph", "boundary-policy.json"), JSON.stringify({ packageName: "@selftest/c", allowedExternal: [] }));
    const rc = checkPkg(S, c);
    if (rc.status !== "FAIL" || !rc.violations.some((v) => String(v).includes("vacuous"))) {
      console.error("SELF-TEST FAIL: a 0-file scan over a package WITH .mjs source did not fail-closed (vacuous-border hole):", JSON.stringify(rc));
      process.exit(2);
    }
    console.log("  self-test: gate fires on unlisted-external, missing-policy AND vacuous-scan ✅");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

async function main() {
  const selfTestOnly = process.argv.includes("--self-test");
  const S = await loadScanner();

  selfTest(S);
  if (selfTestOnly) {
    console.log("Hardened Border gate: self-test only (detectors fire) — OK.");
    process.exit(0);
  }

  const pkgs = readdirSync(PKG_ROOT)
    .map((n) => join(PKG_ROOT, n))
    .filter((p) => existsSync(join(p, "package.json")));

  let pass = 0;
  const failures = [];
  for (const p of pkgs) {
    const r = checkPkg(S, p);
    if (r.status === "FAIL") failures.push({ pkg: p.slice(ROOT.length + 1), violations: r.violations });
    else pass++;
  }

  console.log(`\n  Hardened Border — re-scanned ${pkgs.length} packages: ${pass} PASS / ${failures.length} FAIL`);
  if (failures.length > 0) {
    console.error("\n  ❌ Hardened Border violations:");
    for (const f of failures) {
      console.error(`     ${f.pkg}`);
      for (const v of f.violations) console.error(`        - ${v}`);
    }
    console.error(
      "\n  Fix: add the new external to that package's .graph/boundary-policy.json (a deliberate widening,\n" +
      "  reviewable in the PR diff), or remove the import. Regenerate the report with the package-graph CLI.",
    );
    process.exit(1);
  }

  // ── SECOND SURFACE: cross-package relative imports (see the header block above) ──────────────
  const siblings = PKG_DIR_NAMES();
  const crossings = [];
  for (const dir of siblings) {
    const src = join(PKG_ROOT, dir, "src");
    if (!existsSync(src)) continue;
    for (const file of walkSource(src)) {
      for (const c of findCrossPackageRelativeImports(readFileSync(file, "utf8"), siblings)) {
        crossings.push({ from: dir, ...c, file: file.slice(ROOT.length + 1) });
      }
    }
  }
  const pairs = [...new Set(crossings.map((c) => `${c.from} → ${c.sibling}`))].sort();

  // RATCHET — shrink-only, same shape as the other declared baselines. These are a PRE-EXISTING debt the
  // old surface could not see; they cannot all be fixed in the commit that lands the detector. Every
  // crossing is still PRINTED, the count is enforced, and ONE new crossing fails the gate.
  const CROSSING_BASELINE = 39;

  if (crossings.length) {
    console.log(`\n  ── cross-package relative imports: ${crossings.length} across ${pairs.length} pair(s) ──`);
    for (const p of pairs) console.log(`     ${p}`);
    console.log(
      `\n  These are PUBLISH-BLOCKERS, declared or not: \`../../<sibling>/dist/…\` resolves in this monorepo\n` +
      `  and CANNOT resolve for anyone running \`npm install\` — a published tarball has no \`../../\` sibling,\n` +
      `  and it reaches into dist/ rather than the package's public entry, so no \`exports\` map can rescue it.\n` +
      `  It also bypasses package.json entirely: no declaration, no version, invisible to the file:-closure\n` +
      `  walk (which is how one of these broke a clean-checkout CI build). Fix = declare the dep and import\n` +
      `  the package by name. Tracked as task #104.`,
    );
  }
  if (crossings.length > CROSSING_BASELINE) {
    console.error(`\n  ❌ NEW cross-package relative import: ${crossings.length} vs baseline ${CROSSING_BASELINE}. The ratchet only shrinks.`);
    process.exit(1);
  }

  // G0 — the green states its surface AND its exclusions. The old green ("every package's external
  // surface is within its Hardened Border") was true and read as a guarantee it never made.
  console.log(`\n  ✅ every package's external surface is within its Hardened Border.`);
  console.log(`     SURFACE: external (npm) specifiers vs each package's declared allowedExternal, re-derived from source.`);
  console.log(`     ALSO CHECKED: cross-package relative imports — ${crossings.length} at baseline ${CROSSING_BASELINE} (declared debt, shrink-only).`);
  console.log(`     NOT CHECKED: runtime reach-through, dynamic import() specifiers, or imports outside packages-galerina/*/src.\n`);
  process.exit(0);
}

/** Recursively list .ts/.mjs source files. */
function walkSource(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkSource(p));
    else if (/\.(ts|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

main().catch((e) => {
  console.error("FAIL: border gate crashed:", e?.stack || e);
  process.exit(2);
});
