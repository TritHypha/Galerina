// run-all-tests.js
// Root test runner for the Galerina monorepo.
//
// There are no npm workspaces here — each package under packages-galerina/* is
// self-contained (file:../ deps, its own `npm test` that does
// typecheck && build && node --test). This script gives ONE command + ONE exit
// code across packages, parses each package's node:test summary, and prints an
// aggregate table (the same cross-package totals the runtime-status SOT tracks).
//
// Usage:
//   node scripts/run-all-tests.js              # all test-bearing packages
//   node scripts/run-all-tests.js --core       # just the SOT four (fast: ~30s)
//   node scripts/run-all-tests.js --list       # list discoverable test packages, no run
//   node scripts/run-all-tests.js <pkg> [pkg]  # only the named package(s)
//   node scripts/run-all-tests.js --bail       # stop at the first failing package
//   node scripts/run-all-tests.js --emit-counts # after a clean FULL run, write the
//                                               # canonical totals into version.json
//                                               # (testCount + per-package map) and
//                                               # the SOT doc's "verified" line (#150)
//
// Exit code: 0 if every selected package passed, 1 otherwise (3 = usage error).

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages-galerina');

// The four packages whose counts the runtime-status SOT aggregates, in build
// order (graph-algorithms is a compiler dependency; security builds last).
const CORE = [
  'galerina-devtools-graph-algorithms',
  'galerina-core-economics',
  'galerina-core-compiler',
  'galerina-core-security',
];

// Consumers that must run AFTER the rest (downstream of the generated graph).
const RUN_LAST = ['galerina-devtools-graph-project'];

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const named = argv.filter((a) => !a.startsWith('--'));
const isCore = flags.has('--core');
const isList = flags.has('--list');
const bail = flags.has('--bail');
const emitCounts = flags.has('--emit-counts');

// ── helpers ──────────────────────────────────────────────────────────────────
function readPkg(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}
function hasTestScript(dir) {
  const pkg = readPkg(dir);
  return typeof pkg?.scripts?.test === 'string';
}
// A "real" test suite runs node --test (or the galerina example runner) rather
// than only typechecking — used to distinguish suites from typecheck-only gates.
function isRealSuite(dir) {
  const t = readPkg(dir)?.scripts?.test || '';
  return /node\s+--test|galerina\.js\s+test/.test(t);
}

// Parse a node:test run summary from captured output. Handles both the TAP
// (`# tests N`) and spec-reporter (`ℹ tests N`) formats.
function parseCounts(out) {
  const grab = (label) => {
    const m = out.match(new RegExp(`(?:^|\\n)\\s*(?:#|\\u2139)\\s*${label}\\s+(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  return { tests: grab('tests'), pass: grab('pass'), fail: grab('fail') };
}

function discover() {
  if (named.length) {
    return named.map((name) => ({ name, dir: path.join(PACKAGES_DIR, name) }));
  }
  if (isCore) {
    return CORE.map((name) => ({ name, dir: path.join(PACKAGES_DIR, name) }));
  }
  // All test-bearing packages: graph-algorithms-style first, RUN_LAST last.
  const all = fs
    .readdirSync(PACKAGES_DIR)
    .filter((name) => fs.statSync(path.join(PACKAGES_DIR, name)).isDirectory())
    .map((name) => ({ name, dir: path.join(PACKAGES_DIR, name) }))
    .filter(({ dir }) => hasTestScript(dir) && isRealSuite(dir));
  const last = all.filter((p) => RUN_LAST.includes(p.name));
  const mid = all.filter((p) => !RUN_LAST.includes(p.name)).sort((a, b) => a.name.localeCompare(b.name));
  return [...mid, ...last];
}

// Expand a glob like "tests/*.test.mjs" against a package dir into real paths.
// Cross-platform: cmd.exe (shell:true) does NOT expand globs, so we do it in JS.
function expandTestGlob(dir, glob) {
  // glob form: "<subdir>/<pattern>.mjs" — support a single * in the basename.
  const slash = glob.lastIndexOf('/');
  const sub = slash >= 0 ? glob.slice(0, slash) : '.';
  const pat = slash >= 0 ? glob.slice(slash + 1) : glob;
  const subDir = path.join(dir, sub);
  if (!fs.existsSync(subDir)) return [];
  const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return fs.readdirSync(subDir).filter((f) => re.test(f)).map((f) => path.join(sub, f));
}

function runOne({ name, dir }) {
  if (!fs.existsSync(dir)) return { name, status: 'missing', tests: null, ms: 0 };
  if (!hasTestScript(dir)) return { name, status: 'no-test', tests: null, ms: 0 };
  const t0 = Date.now();

  // Smart dispatch: if the test script needs a build (npm run typecheck/build) but
  // dist/ already exists, run only the `node --test <globs>` portion directly,
  // expanding globs in JS (cmd.exe doesn't). Avoids requiring tsc on PATH.
  const pkg = readPkg(dir);
  const testScript = pkg?.scripts?.test ?? '';
  const distExists = fs.existsSync(path.join(dir, 'dist'));
  const needsBuild = /npm run (typecheck|build[:a-z]*)/.test(testScript);
  const nodeTestMatch = testScript.match(/node\s+--test\s+(.+?)(?:\s*&&|\s*$)/);

  let r;
  if (needsBuild && distExists && nodeTestMatch) {
    const globs = nodeTestMatch[1].trim().split(/\s+/);
    const files = globs.flatMap((g) => expandTestGlob(dir, g));
    if (files.length > 0) {
      r = spawnSync('node', ['--test', ...files], { cwd: dir, encoding: 'utf8', shell: false, timeout: 600_000 });
    } else {
      r = spawnSync('npm', ['test'], { cwd: dir, encoding: 'utf8', shell: true, timeout: 600_000 });
    }
  } else {
    r = spawnSync('npm', ['test'], { cwd: dir, encoding: 'utf8', shell: true, timeout: 600_000 });
  }
  const ms = Date.now() - t0;
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const counts = parseCounts(out);
  return { name, status: r.status === 0 ? 'pass' : 'fail', code: r.status, ...counts, ms, out };
}

// ── canonical count emission (#150) ───────────────────────────────────────────
// After a clean FULL run, write the canonical totals back into version.json and
// the runtime-status SOT doc so those figures are generated, not hand-edited
// (which is how they drifted). Idempotent: rewriting with identical numbers is a
// no-op. Safe: refuses to write on a partial scope or any failure (see callsite).

// Stable per-package map: { "<pkg>": <tests>, ... } for passed suites that
// reported a count. Sorted by name so the JSON diff is deterministic.
function buildPerPackage(res) {
  const map = {};
  for (const r of [...res].sort((a, b) => a.name.localeCompare(b.name))) {
    if (r.status === 'pass' && typeof r.tests === 'number') map[r.name] = r.tests;
  }
  return map;
}

/**
 * Cross-check testCountByPackage against the workspace package list.
 *
 * Item 9 (Bob architectural review 2026-07): version.json testCountByPackage is
 * a second hand-maintained registry that can drift from galerina.workspace.json.
 * After writing new counts, validate that:
 *   (a) every key in the new perPackage map corresponds to a real discovered package
 *       (no ghost entries from renamed/removed packages).
 *   (b) warn about packages that ARE in the workspace but produced no count
 *       (possible newly-added packages not yet in the map).
 *
 * Mismatches are printed as warnings — not fatal, because a freshly-added package
 * may not have landed in the SOT yet. Stale ghosts (case a) are always actionable.
 */
function validateTestCountVsWorkspace(perPackage) {
  // Load workspace package names from galerina.workspace.json
  let workspacePkgs;
  try {
    const ws = JSON.parse(fs.readFileSync(path.join(ROOT, 'galerina.workspace.json'), 'utf8'));
    workspacePkgs = new Set(
      (ws.packages || []).map((p) => p.replace(/^packages-galerina\//, '')),
    );
  } catch {
    process.stdout.write('   ⚠️  workspace cross-check: could not read galerina.workspace.json; skipped.\n');
    return;
  }

  const countKeys = new Set(Object.keys(perPackage));

  // (a) Keys in testCountByPackage that are NOT in the workspace — ghost entries.
  const ghosts = [...countKeys].filter((k) => !workspacePkgs.has(k));
  if (ghosts.length > 0) {
    process.stdout.write(
      `   ⚠️  workspace cross-check: ${ghosts.length} ghost key(s) in testCountByPackage not in workspace: ` +
      ghosts.join(', ') + '\n',
    );
  }

  // (b) Workspace packages not in testCountByPackage — newly-added or renamed.
  const missing = [...workspacePkgs].filter((k) => !countKeys.has(k));
  if (missing.length > 0) {
    process.stdout.write(
      `   ℹ️  workspace cross-check: ${missing.length} workspace package(s) absent from testCountByPackage: ` +
      missing.join(', ') + '\n',
    );
  }

  if (ghosts.length === 0 && missing.length === 0) {
    process.stdout.write(`   ✅ workspace cross-check: testCountByPackage keys match workspace (${countKeys.size} packages).\n`);
  }
}

function writeVersionJson(total, pkgCount, perPackage) {
  const file = path.join(ROOT, 'version.json');
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    process.stdout.write(`⚠️  --emit-counts: version.json not found at ${file}; skipped\n`);
    return false;
  }
  // Detect trailing newline so we preserve the file's existing style.
  const trailingNL = raw.endsWith('\n');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    process.stdout.write(`⚠️  --emit-counts: version.json is not valid JSON (${e.message}); skipped\n`);
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  json.testCount = total;
  json.packageCount = pkgCount;
  json.testCountByPackage = perPackage;
  json.testCountNote =
    `${today} auto-generated by scripts/run-all-tests.cjs --emit-counts: ` +
    `${pkgCount}/${pkgCount} packages, ${total.toLocaleString('en-US')} tests, 0 fail` +
    (typeof perPackage['galerina-core-compiler'] === 'number'
      ? ` (compiler ${perPackage['galerina-core-compiler'].toLocaleString('en-US')}).`
      : '.');
  const next = JSON.stringify(json, null, 2) + (trailingNL ? '\n' : '');
  if (next === raw) {
    process.stdout.write('   version.json already current (no change).\n');
    return true;
  }
  fs.writeFileSync(file, next);
  process.stdout.write(`   version.json updated → testCount=${total}, packageCount=${pkgCount}.\n`);
  return true;
}

function writeSotDoc(total, pkgCount) {
  // The SOT doc migrated to the sibling ZTF-Knowledge-Bases repo — resolve like kb-index.mjs
  // (GALERINA_KB_DIR override, sibling default). Absence stays non-fatal (optional target).
  const kbDir = process.env.GALERINA_KB_DIR || path.join(ROOT, '..', 'ZTF-Knowledge-Bases');
  const file = path.join(kbDir, 'galerina-runtime-status-SOT.md');
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    process.stdout.write('   SOT doc not present; skipped.\n');
    return true; // optional target — absence is not a failure
  }
  const today = new Date().toISOString().slice(0, 10);
  const totalStr = total.toLocaleString('en-US');
  // Canonical "verified" line only: a bold date-prefixed line ending "0 fail.".
  // Historical change-log / blockquote snapshots are intentionally NOT touched.
  const re = /(\*\*)\d{4}-\d{2}-\d{2} verified: \d+\/\d+ packages, [\d,]+ tests, 0 fail\.(\*\*)/;
  if (!re.test(raw)) {
    process.stdout.write('   SOT doc canonical "verified" line not found; left unchanged.\n');
    return true;
  }
  const next = raw.replace(
    re,
    `$1${today} verified: ${pkgCount}/${pkgCount} packages, ${totalStr} tests, 0 fail.$2`,
  );
  if (next === raw) {
    process.stdout.write('   SOT doc already current (no change).\n');
    return true;
  }
  fs.writeFileSync(file, next);
  process.stdout.write(`   SOT doc verified line updated → ${pkgCount}/${pkgCount} packages, ${totalStr} tests.\n`);
  return true;
}

// ── list mode ────────────────────────────────────────────────────────────────
if (isList) {
  const pkgs = discover();
  process.stdout.write(`Test-bearing packages (${pkgs.length}):\n`);
  for (const { name, dir } of pkgs) {
    const kind = isRealSuite(dir) ? 'suite' : hasTestScript(dir) ? 'typecheck-only' : 'no-test';
    process.stdout.write(`  ${name.padEnd(36)} ${kind}\n`);
  }
  process.exit(0);
}

// ── run ──────────────────────────────────────────────────────────────────────
const selection = discover();
const scope = named.length ? 'named' : isCore ? 'core (SOT four)' : 'all suites';
process.stdout.write(`Galerina root test runner — ${scope}: ${selection.length} package(s)\n\n`);

const results = [];
let totalTests = 0;
let anyFail = false;

for (const pkg of selection) {
  process.stdout.write(`▶ ${pkg.name} … `);
  const res = runOne(pkg);
  results.push(res);
  if (res.status === 'pass') {
    if (typeof res.tests === 'number') totalTests += res.tests;
    const cnt = typeof res.tests === 'number' ? `${res.tests} tests` : 'ok';
    process.stdout.write(`✅ ${cnt} (${(res.ms / 1000).toFixed(1)}s)\n`);
  } else if (res.status === 'fail') {
    anyFail = true;
    process.stdout.write(`❌ FAIL (exit ${res.code}, ${(res.ms / 1000).toFixed(1)}s)\n`);
    // surface the failing lines for quick triage
    const fails = (res.out || '').split('\n').filter((l) => /not ok|✖|Error:|fail \d/.test(l)).slice(0, 8);
    for (const l of fails) process.stdout.write(`    ${l.trim()}\n`);
    if (bail) break;
  } else {
    process.stdout.write(`⚠️  ${res.status}\n`);
  }
}

// ── summary ──────────────────────────────────────────────────────────────────
process.stdout.write('\n── Summary ──────────────────────────────\n');
const pad = (s, n) => String(s).padEnd(n);
process.stdout.write(`${pad('package', 38)}${pad('tests', 8)}status\n`);
for (const r of results) {
  const tests = typeof r.tests === 'number' ? r.tests : '—';
  const mark = r.status === 'pass' ? '✅ pass' : r.status === 'fail' ? '❌ fail' : `⚠️  ${r.status}`;
  process.stdout.write(`${pad(r.name, 38)}${pad(tests, 8)}${mark}\n`);
}
const passed = results.filter((r) => r.status === 'pass').length;
process.stdout.write('─────────────────────────────────────────\n');
process.stdout.write(`${passed}/${results.length} packages passed · ${totalTests} tests total\n`);

// ── emit canonical counts (#150) ──────────────────────────────────────────────
// Only when explicitly requested AND the run is a clean FULL run. Writing on a
// partial scope (--core / named) or after any failure would corrupt the SOT.
if (emitCounts) {
  process.stdout.write('\n── --emit-counts ────────────────────────\n');
  const isFullScope = !named.length && !isCore;
  if (!isFullScope) {
    process.stdout.write('   refused: counts are only canonical for a FULL run (no --core / named pkgs).\n');
  } else if (anyFail) {
    process.stdout.write('   refused: at least one package failed; counts not written.\n');
  } else if (passed !== results.length) {
    process.stdout.write('   refused: not every selected package passed; counts not written.\n');
  } else {
    const perPackage = buildPerPackage(results);
    writeVersionJson(totalTests, passed, perPackage);
    writeSotDoc(totalTests, passed);
    // Item 9 (Bob review 2026-07): cross-check testCountByPackage vs workspace
    validateTestCountVsWorkspace(perPackage);
  }
}

process.exit(anyFail ? 1 : 0);
