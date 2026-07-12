#!/usr/bin/env node
// audit-import-governance.mjs — inventory + classify every .fungi import; RED a plugin
// import that is missing its access { grant } contract (the Toxic-Border deny-by-default).
//
// HANDOVER-import-governance-audit-and-patch (RD, companion to package-standard §6.5). Uses
// the REAL compiler parser (parseProgram), never a regex — imports are governance edges
// (ZT-38/62). The 4 import classes:
//   1. import "./x.fungi"          -> module DAG-merge (checker enforces effect-subset/no-cycle)
//   2. import plugin safe|assimilate ... { contract { access { grant } } }
//                                  -> plugin / Toxic Border (untrusted): access { grant }
//                                     MANDATORY, effect subset-of-grant. RED if grant missing.
//   3. bare @galerina/* (in .ts)   -> cross-package: gated by boundary-policy.json + hardened-border
//   4. bare @noble/argon2/wabt     -> native-floor: per-package #149; gated by hardened-border + node-floor
//
// This audit covers the .fungi classes (1, 2) — the novel enforcement is class 2. Classes
// 3/4 (in .ts) are gated by scripts/audit-package-border.mjs (hardened-border) and
// scripts/audit-node-dependencies.mjs; this tool does NOT duplicate them.
//
// The checker (governance-verifier.verifyAssimilatedPlugins) already RED's a grantless
// `assimilate` plugin (FUNGI-ASSIMILATE-003) but NOT a `safe` one (importPluginDecl) — this
// audit catches BOTH, and its finding drives the safe-plugin checker patch.
//
// FLAGS: (none) enforce (exit 1 on a grantless plugin import); --self-test prove the detector.
// Zero-dep beyond the compiler dist; house style of scripts/audit-node-dependencies.mjs.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const selfTest = process.argv.includes('--self-test');

const { parseProgram } = await import(
  new URL('../packages-galerina/galerina-core-compiler/dist/index.js', import.meta.url).href
);

// Does a plugin import node carry an access { grant } contract? Mirrors the walk in
// governance-verifier.verifyAssimilatedPlugins so the audit and the checker agree.
function hasAccessGrant(node) {
  const contract = (node.children ?? []).find((c) => c.kind === 'contractDecl');
  if (!contract) return false;
  const walk = (n) => {
    if (n.kind === 'accessDecl') return true;
    if (typeof n.value === 'string' && (n.value.startsWith('grant:') || n.value.startsWith('access:') || n.value.includes('grant'))) {
      return true;
    }
    return (n.children ?? []).some(walk);
  };
  return walk(contract);
}

const PLUGIN_KINDS = { importPluginDecl: 'plugin-safe', assimilatedPluginDecl: 'plugin-assimilate' };

function collectFungi(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build' || e.name.startsWith('.')) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...collectFungi(p));
    else if (e.name.endsWith('.fungi')) out.push(p);
  }
  return out;
}

// ── self-test: prove the classifier + grant detector fire (a neutered gate is a fail-open) ──
if (selfTest) {
  const src = `@version 1
import "./x.fungi"
import plugin safe "./p.fungi" as P
import plugin assimilate "./q.fungi" as Q { contract { access { grant network.outbound } } }
`;
  const top = parseProgram(src, 't.fungi').ast.children;
  const byKind = (k) => top.find((n) => n.kind === k);
  // A plugin whose contract carries NO access { grant } — the contract alone is not enough.
  const contractNoGrant = parseProgram(
    `@version 1\nimport plugin safe "./r.fungi" as R { contract { intent { "x" } } }`,
    't.fungi',
  ).ast.children.find((n) => n.kind === 'importPluginDecl');
  const checks = [
    ['module import parsed', byKind('importDecl') !== undefined],
    ['safe plugin parsed', byKind('importPluginDecl') !== undefined],
    ['assimilate plugin parsed', byKind('assimilatedPluginDecl') !== undefined],
    ['grantless (no-contract) safe plugin CAUGHT', !hasAccessGrant(byKind('importPluginDecl'))],
    ['contract-but-no-grant plugin CAUGHT', !hasAccessGrant(contractNoGrant)],
    ['granted assimilate plugin passes', hasAccessGrant(byKind('assimilatedPluginDecl'))],
  ];
  let bad = 0;
  for (const [name, pass] of checks) { console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`); if (!pass) bad++; }
  console.log(bad ? `\n❌ self-test: ${bad} failed` : `\n✅ self-test: ${checks.length}/${checks.length} detectors fire`);
  process.exit(bad ? 1 : 0);
}

const files = collectFungi(root).sort();
const inv = { module: 0, 'plugin-safe': 0, 'plugin-assimilate': 0 };
const red = [];
let parseErrors = 0;
for (const abs of files) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  let ast;
  try { ast = parseProgram(readFileSync(abs, 'utf8'), rel).ast; } catch { parseErrors++; continue; }
  for (const n of ast?.children ?? []) {
    if (n.kind === 'importDecl') inv.module++;
    else if (n.kind in PLUGIN_KINDS) {
      inv[PLUGIN_KINDS[n.kind]]++;
      if (!hasAccessGrant(n)) red.push({ rel, kind: n.kind, alias: n.value ?? '<unknown>' });
    }
  }
}

console.log(`import-governance: ${files.length} .fungi parsed (${parseErrors} parse-skipped)`);
console.log(`  module imports (class 1):      ${inv.module}`);
console.log(`  plugin safe (class 2):         ${inv['plugin-safe']}`);
console.log(`  plugin assimilate (class 2):   ${inv['plugin-assimilate']}`);
console.log(`  [classes 3/4 (@galerina/@noble in .ts) are gated by hardened-border + node-floor audits]`);
if (red.length) {
  console.log(`\n❌ ${red.length} plugin import(s) MISSING access { grant } (Toxic-Border deny-by-default):`);
  for (const r of red) console.log(`  RED  ${r.rel}  ${r.kind} '${r.alias}'`);
  console.log(`  -> add: import plugin ${'{safe|assimilate}'} "..." as X { contract { access { grant <effect> } } } (least-privilege).`);
  process.exit(1);
}
console.log(`\n✅ every plugin import carries an access { grant } contract.`);
