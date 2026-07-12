#!/usr/bin/env node
// audit-node-dependencies.mjs — the external-dependency floor: visibility + single-source pin.
//
// DECISION (RD-0346, HANDOVER-crypto-floor-decision-to-main): do NOT consolidate external
// deps into one shared package — that would REVERSE Hardened-Border #149 (each package owns
// its crypto by bare import, no cross-package reach-through) and create a shared-trust
// chokepoint. Instead the "one visible floor for security" is THIS AUDIT, not a package.
//
// Galerina's bounded TCB: NO external npm dependency except a small, declared floor
// (NODE_FLOOR — crypto primitives + the WASM toolchain + the build-time TS compiler). Every
// other capability is Galerina's own code. This audit is fail-closed on three properties:
//   1. floor        — every external dep is on NODE_FLOOR (an accidental `npm install <foo>`
//                     in any of the ~95 package.json fails CI, permanently).
//   2. single-source pin — every package that OWNS a given dep pins the SAME version string;
//                     a drift means two packages ship divergent crypto/toolchain builds (#149
//                     ownership is only sound if the N bare copies are byte-identical, RD-0345).
//   3. visibility   — the report enumerates every external dep, its pin, and how many packages
//                     own it: the whole external TCB in one place, with no shared-trust package.
//
// NOT covered here (by design, to avoid duplication): "no reach-through" (a package importing
// crypto it does not declare) is gated by the hardened-border audit (audit-package-border.mjs +
// each package's boundary-policy.json). The golden-reproducible-hash of each owner's built crypto
// WASM is RD-0345 (needs the wabt pin) — a future check to fold in here.
//
// FLAGS:
//   (none)      enforce: exit 1 on any off-floor dep OR any single-source pin drift.
//   --list      print every external dep + pin(s) + owner count (no enforcement).
//   --self-test prove the detectors fire (off-floor + pin-drift). A neutered guard is a fail-open.
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

// The declared TCB floor — the ONLY external npm packages Galerina is permitted to depend on,
// each OWNED per-package by bare import (#149). Each row names WHY it stays. Adding a row is a
// reviewed decision. Keep in sync with the node-modules floor doc in the KB.
const NODE_FLOOR = new Map([
  ['typescript', 'build floor: the tsc compiler for .ts sources (retires when no .ts remains, #143)'],
  ['@types/node', 'build floor: Node type stubs consumed by tsc only'],
  ['@noble/post-quantum', 'crypto floor: ML-DSA-65 / ML-KEM post-quantum primitives (frozen TCB)'],
  ['@noble/ciphers', 'crypto floor: audited pure-JS symmetric ciphers (AES-GCM; ext-spore KEM-DEM)'],
  ['@noble/hashes', 'crypto floor: audited pure-JS hash functions / Argon2id (ext-secrets-spore anchor)'],
  ['argon2', 'crypto floor: Argon2 KDF native binding (slated per-package -> WASM PHC reference, RD-0345)'],
  ['bcryptjs', 'crypto floor: bcrypt password hashing'],
  ['snarkjs', 'ZK floor: Groth16/PLONK zk-SNARK proving, bridged by the OPTIONAL ext-proof-snarkjs extension'],
  ['wabt', 'WASM toolchain: wat->wasm assembler for the build path (pin required for RD-0345 golden hash)'],
  ['wat-wasm', 'WASM toolchain: wat assembler'],
]);

// Build-time toolchain (retires with the .ts sources, #143) — NOT a runtime primitive, so
// single-source pin drift here is a visible WARNING, not a fatal finding (R&D's single-source
// requirement is about the crypto/runtime primitives, whose N bare copies must be byte-identical).
const BUILD_TOOLING = new Set(['typescript', '@types/node']);

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

// A dep is single-source-pinned iff all its owners declare one identical version string.
const hasDrift = (versions) => new Set(versions).size > 1;

// --self-test: the detectors must fire (off-floor dep + pin drift) and pass the allowed classes.
if (selfTest) {
  const checks = [
    ['off-floor dep flagged', !NODE_FLOOR.has('left-pad') && !isInternal('left-pad', '^1') && !BUILTINS.has('left-pad')],
    ['floor dep allowed', NODE_FLOOR.has('typescript')],
    ['@galerina/* is internal', isInternal('@galerina/core-compiler', '^1')],
    ['file: dep is internal', isInternal('@galerina/x', 'file:../x')],
    ['node builtin ignored', BUILTINS.has('node:crypto')],
    ['pin drift detected', hasDrift(['^1.3.0', '^1.4.0'])],
    ['pin consistent ok', !hasDrift(['^1.3.0', '^1.3.0'])],
  ];
  let bad = 0;
  for (const [name, pass] of checks) { console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`); if (!pass) bad++; }
  console.log(bad ? `\n❌ self-test: ${bad} failed` : `\n✅ self-test: ${checks.length}/${checks.length} detectors fire`);
  process.exit(bad ? 1 : 0);
}

// dep name -> Array<{ pkg: rel path, version: string }>
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
      if (!external.has(name)) external.set(name, []);
      external.get(name).push({ pkg: rel, version: String(version) });
    }
  }
}

const names = [...external.keys()].sort();
const versionsOf = (n) => [...new Set(external.get(n).map((e) => e.version))];
const ownersOf = (n) => external.get(n).map((e) => e.pkg);

if (list) {
  console.log(`External deps across ${files.length} package.json (${external.size} distinct):`);
  for (const name of names) {
    const vers = versionsOf(name);
    const tag = NODE_FLOOR.has(name) ? 'FLOOR    ' : 'OFF-FLOOR';
    const vtag = vers.length > 1 ? `DRIFT(${vers.join(' vs ')})` : vers[0];
    console.log(`  [${tag}] ${name}@${vtag}  <- ${ownersOf(name).length} pkg`);
  }
  process.exit(0);
}

const offFloor = names.filter((n) => !NODE_FLOOR.has(n));
const floorUsed = names.filter((n) => NODE_FLOOR.has(n));
const drift = names.filter((n) => hasDrift(versionsOf(n)));

// Visibility — the single floor view: every external dep, its pin, and its owner count.
console.log(`node-dependencies: ${files.length} package.json scanned; ${external.size} distinct external dep(s) — the floor (each #149-owned by bare import):`);
for (const name of floorUsed) {
  console.log(`  ${name}@${versionsOf(name).join('|')}  (${ownersOf(name).length} owner pkg)`);
}

let red = false;
if (offFloor.length) {
  red = true;
  console.log(`\n❌ ${offFloor.length} EXTERNAL dependency(ies) NOT on the declared TCB floor:`);
  for (const name of offFloor) console.log(`  OFF-FLOOR  ${name}  <- ${ownersOf(name).join(', ')}`);
  console.log(`  -> replace it with Galerina's own code, or add it to NODE_FLOOR with a reason.`);
}
const runtimeDrift = drift.filter((n) => !BUILD_TOOLING.has(n));
const buildDrift = drift.filter((n) => BUILD_TOOLING.has(n));
if (runtimeDrift.length) {
  red = true;
  console.log(`\n❌ ${runtimeDrift.length} RUNTIME/crypto dep(s) with single-source PIN DRIFT (owners disagree on the version):`);
  for (const name of runtimeDrift) {
    console.log(`  DRIFT  ${name}: ${versionsOf(name).join(' vs ')}`);
    for (const e of external.get(name)) console.log(`         ${e.version}  ${e.pkg}`);
  }
  console.log(`  -> #149 per-package ownership is sound only if the N bare copies are byte-identical: pin ONE vetted version.`);
}
if (buildDrift.length) {
  console.log(`\n⚠️  ${buildDrift.length} BUILD-tooling dep(s) with version drift (non-fatal — retires with .ts, #143):`);
  for (const name of buildDrift) {
    const owners = external.get(name);
    const laggards = owners.filter((e) => e.version !== versionsOf(name)[0]);
    console.log(`     ${name}: ${versionsOf(name).join(' vs ')} — align to the majority pin when convenient (${laggards.length} laggard pkg; needs an install+build to verify).`);
  }
}
if (red) process.exit(1);
console.log(`\n✅ external floor clean — every dep on the floor (${floorUsed.length}), crypto/runtime primitives single-source pinned, no reach-through (gated by hardened-border).`);
