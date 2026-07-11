#!/usr/bin/env node
// audit-node-dependencies.mjs — the "all node packages replaced" permanent guard.
//
// Galerina's goal is a bounded TCB: NO external npm dependency except a small, declared
// floor (crypto primitives + the WASM toolchain + the build-time TS compiler). Every
// other capability is Galerina's own code. This audit enumerates the declared deps of
// EVERY package.json in the repo and FAILS if any external dep is not on the floor
// allowlist — so an accidental `npm install <foo>` is caught in CI, permanently.
//
// Internal deps (@galerina/* and file:/workspace:/link: locals) and Node builtins are
// always OK. NODE_FLOOR is the reviewed exception set, each row carrying WHY it stays.
//
// FLAGS:
//   (none)      enforce: exit 1 if any external dep is off the floor allowlist.
//   --list      print every external dep + which package(s) declare it (no enforcement).
//   --self-test prove the detector fires on a planted off-floor dep (a neutered guard is
//               itself a fail-open).
//
// Zero-dep; mirrors scripts/audit-example-diagnostics.mjs house style.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const list = process.argv.includes('--list');
const selfTest = process.argv.includes('--self-test');

// The declared TCB floor — the ONLY external npm packages Galerina is permitted to depend
// on. Each entry names WHY it stays (a native primitive Galerina does not reimplement, or
// the build-time TS compiler). Adding a row is a reviewed decision. Keep in sync with the
// node-modules floor doc in the KB.
const NODE_FLOOR = new Map([
  ['typescript', 'build floor: the tsc compiler for .ts sources (retires when no .ts remains, #143)'],
  ['@types/node', 'build floor: Node type stubs consumed by tsc only'],
  ['@noble/post-quantum', 'crypto floor: ML-DSA-65 / ML-KEM post-quantum primitives (frozen TCB)'],
  ['@noble/ciphers', 'crypto floor: audited pure-JS symmetric ciphers (same @noble family as post-quantum; ext-spore)'],
  ['@noble/hashes', 'crypto floor: audited pure-JS hash functions SHA-2/3, BLAKE (ext-secrets-spore)'],
  ['argon2', 'crypto floor: Argon2 password KDF native binding'],
  ['bcryptjs', 'crypto floor: bcrypt password hashing'],
  ['snarkjs', 'ZK floor: Groth16/PLONK zk-SNARK proving, bridged by the OPTIONAL ext-proof-snarkjs extension (not a core dep)'],
  ['wabt', 'WASM toolchain: wat->wasm assembler for the build path'],
  ['wat-wasm', 'WASM toolchain: wat assembler'],
]);

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function isInternal(name, version) {
  if (name.startsWith('@galerina/')) return true;
  const v = String(version ?? '');
  return v.startsWith('file:') || v.startsWith('workspace:') || v.startsWith('link:');
}

function collectPackageJsons(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectPackageJsons(p));
    else if (e.name === 'package.json') out.push(p);
  }
  return out;
}

// --self-test: the detector must flag an off-floor dep and pass the allowed classes.
if (selfTest) {
  const checks = [
    ['off-floor dep flagged', !NODE_FLOOR.has('left-pad') && !isInternal('left-pad', '^1') && !BUILTINS.has('left-pad')],
    ['floor dep allowed', NODE_FLOOR.has('typescript')],
    ['@galerina/* is internal', isInternal('@galerina/core-compiler', '^1')],
    ['file: dep is internal', isInternal('@galerina/x', 'file:../x')],
    ['node builtin ignored', BUILTINS.has('node:crypto')],
  ];
  let bad = 0;
  for (const [name, pass] of checks) { console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`); if (!pass) bad++; }
  console.log(bad ? `\n❌ self-test: ${bad} failed` : `\n✅ self-test: ${checks.length}/${checks.length} detectors fire`);
  process.exit(bad ? 1 : 0);
}

// dep name -> Set<declaring package rel path>
const external = new Map();
const files = collectPackageJsons(root);
for (const abs of files) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  let pkg;
  try { pkg = JSON.parse(readFileSync(abs, 'utf8')); } catch { continue; }
  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, version] of Object.entries(deps)) {
      if (isInternal(name, version) || BUILTINS.has(name)) continue;
      if (!external.has(name)) external.set(name, new Set());
      external.get(name).add(rel);
    }
  }
}

if (list) {
  console.log(`External deps across ${files.length} package.json (${external.size} distinct):`);
  for (const name of [...external.keys()].sort()) {
    console.log(`  [${NODE_FLOOR.has(name) ? 'FLOOR    ' : 'OFF-FLOOR'}] ${name}  <- ${[...external.get(name)].join(', ')}`);
  }
  process.exit(0);
}

const violations = [...external.keys()].filter((n) => !NODE_FLOOR.has(n)).sort();
const floorUsed = [...external.keys()].filter((n) => NODE_FLOOR.has(n)).sort();

console.log(`node-dependencies: ${files.length} package.json scanned; floor deps in use: ${floorUsed.join(', ') || '(none)'}`);
if (violations.length) {
  console.log(`\n❌ ${violations.length} EXTERNAL dependency(ies) NOT on the declared TCB floor:`);
  for (const name of violations) console.log(`  OFF-FLOOR  ${name}  <- ${[...external.get(name)].join(', ')}`);
  console.log(`\nReplace it with Galerina's own code, or — if it is a true native primitive — add it to NODE_FLOOR with a reason.`);
  process.exit(1);
}
console.log(`✅ all node packages replaced — every external dep is on the declared TCB floor (${floorUsed.length} in use).`);
