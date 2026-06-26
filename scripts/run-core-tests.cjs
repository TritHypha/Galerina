// run-core-tests.js
// Stop hook: runs tests in dependency order whenever the sentinel file
// indicates that relevant files were edited this turn.
//
// Execution order (matches the dependency chain):
//   1. @galerina/devtools-project-graph — upstream library (C:\laragon\www\SPORE-Graph, when created)
//   2. galerina-core-*, galerina-devtools-graph-algorithms  — packages that may depend on @galerina/devtools-project-graph
//   3. galerina-devtools-graph-project  — downstream consumer of @galerina/devtools-project-graph
//
// Outputs a JSON { systemMessage } result so Claude Code shows a status chip.

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT        = path.join(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages-galerina');
const SPORE_GRAPH_DIR = path.join(ROOT, '..', 'SPORE-Graph');
const SENTINEL    = path.join(ROOT, '.claude', '.core-changed');
const GRAPH_PKG   = 'galerina-devtools-graph-project';

// ── Guard: only run when relevant files changed this turn ──────────────────

if (!fs.existsSync(SENTINEL)) {
  process.exit(0);
}

// Clear sentinel immediately so a crash won't leave it stale
try { fs.unlinkSync(SENTINEL); } catch { /* ignore */ }

// ── Helpers ────────────────────────────────────────────────────────────────

function hasTestScript(pkgDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    return typeof pkg.scripts?.test === 'string';
  } catch {
    return false;
  }
}

function runTest(dir, label) {
  const r = spawnSync('npm', ['test'], {
    cwd: dir,
    encoding: 'utf8',
    shell: true,
    timeout: 180_000,
  });
  return { label, passed: r.status === 0 };
}

// ── Main ────────────────────────────────────────────────────────────────────

const results = [];
let allPassed = true;

// 1. @galerina/devtools-project-graph — run first; core packages depend on it
if (fs.existsSync(SPORE_GRAPH_DIR) && hasTestScript(SPORE_GRAPH_DIR)) {
  const r = runTest(SPORE_GRAPH_DIR, '@galerina/devtools-project-graph');
  results.push(r);
  if (!r.passed) allPassed = false;
}

// 2. All galerina-* packages (excludes galerina-devtools-graph-project which runs last)
//    Catches: galerina-core-*, galerina-devtools-graph-algorithms, and any future galerina-* packages.
const corePackages = fs
  .readdirSync(PACKAGES_DIR)
  .filter(name => /^galerina-/.test(name) && name !== GRAPH_PKG)
  .map(name => ({ name, dir: path.join(PACKAGES_DIR, name) }))
  .filter(({ dir }) => hasTestScript(dir));

for (const { name, dir } of corePackages) {
  const r = runTest(dir, name);
  results.push(r);
  if (!r.passed) allPassed = false;
}

// 3. galerina-devtools-graph-project — run last; downstream of @galerina/devtools-project-graph
if (allPassed) {
  const graphDir = path.join(PACKAGES_DIR, GRAPH_PKG);
  if (hasTestScript(graphDir)) {
    const r = runTest(graphDir, GRAPH_PKG);
    results.push(r);
    if (!r.passed) allPassed = false;
  }
}

// ── Output ──────────────────────────────────────────────────────────────────

const lines = results.map(r => `${r.passed ? '✅' : '❌'} ${r.label}`);
const header = allPassed
  ? 'Galerina core tests — all passed'
  : 'Galerina core tests — failures detected';

process.stdout.write(
  JSON.stringify({ systemMessage: `${header}:\n${lines.join('\n')}` })
);
