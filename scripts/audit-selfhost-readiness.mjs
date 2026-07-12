#!/usr/bin/env node
// audit-selfhost-readiness.mjs — the honest self-hosting map: per package, how far toward
// "written in .fungi, no .ts" is it, and WHAT floors the rest.
//
// Owner ask (2026-07-09): "from the start of the runtime down, make sure each component is up-to-date
// .fungi, no .ts, 100% complete." A component can only be 100% .fungi once every primitive it uses is
// expressible+runnable in .fungi. Some are NOT yet: crypto lattice/hash primitives (ML-DSA/Ed25519/
// SHAKE — host-provided via @noble/node:crypto, NOT authored in .fungi), native/FFI addons, and
// .ts-runtime-object interop (a package that imports a sibling's dist/*.js and drives its classes).
// This tool CLASSIFIES each package so the migration is driven by evidence, not by deleting working
// .ts on a hope. It NEVER converts or deletes — it maps. Fail-closed: an unreadable package is a floor.
//
// Floors (why a package cannot be 100% .fungi YET):
//   crypto   — node:crypto / @noble/*  (primitive impl, not a .fungi effect call)
//   ffi      — native addon / .node / dlopen / process spawn of a binary
//   host-io  — node:fs / node:net / node:child_process / process.*  (OS surface)
//   ts-interop — imports a sibling runtime package's dist/*.js and calls its .ts classes
// A package with NO floor and only .ts is CONVERTIBLE-NOW (pure logic); with a floor it is
// FLOORED (needs the floor self-hosted first — the LATER/#102-106 DSS.wasm / PQ-custody work).
//
// Usage: node scripts/audit-selfhost-readiness.mjs [--json]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKGDIR = join(ROOT, "packages-galerina");
const JSON_OUT = process.argv.includes("--json");

// Runtime-stack order (the "start of the runtime down"); packages not listed sort after, alpha.
const STACK_ORDER = [
  "galerina-core-compiler", "galerina-framework-app-kernel", "galerina-core-security",
  "galerina-tower-citizen", "galerina-tri-pipe", "galerina-core-logic", "galerina-core-compute",
  "galerina-core-network", "galerina-core-config", "galerina-core-economics",
];
const rank = (n) => { const i = STACK_ORDER.indexOf(n); return i === -1 ? STACK_ORDER.length + 1 : i; };

const FLOORS = [
  ["crypto", /\bnode:crypto\b|@noble\//],
  ["ffi", /\.node["']|dlopen|require\(['"][^'"]*\.node|node-gyp|process\.dlopen/],
  ["host-io", /\bnode:fs\b|\bnode:net\b|\bnode:child_process\b|\bnode:os\b|\bprocess\.(env|argv|cwd|platform|exit)\b/],
  ["ts-interop", /from\s+["'][^"']*\/dist\/[^"']*\.js["']/],
];

function walk(dir, out = []) {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === ".graph") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function classify(pkgDir) {
  const src = join(pkgDir, "src");
  const files = walk(existsSync(src) ? src : pkgDir);
  const ts = files.filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !/\.test\.[cm]?[jt]s$/.test(f));
  const fungi = files.filter((f) => f.endsWith(".fungi"));
  if (ts.length === 0 && fungi.length === 0) return null;        // not a code package
  const floors = new Set();
  let unreadable = 0;
  for (const f of ts) {
    let txt; try { txt = readFileSync(f, "utf8"); } catch { unreadable++; continue; }
    for (const [name, re] of FLOORS) if (re.test(txt)) floors.add(name);
  }
  const total = ts.length + fungi.length;
  const pctFungi = total === 0 ? 100 : Math.round((fungi.length / total) * 100);
  let status;
  if (unreadable > 0) status = "FAIL-CLOSED (unreadable src)";
  else if (ts.length === 0) status = "FULLY-FUNGI";
  else if (fungi.length > 0) status = floors.size ? "PARTIAL (floored)" : "PARTIAL (convertible)";
  else status = floors.size ? "TS-ONLY (floored)" : "TS-ONLY (convertible-now)";
  return { ts: ts.length, fungi: fungi.length, pctFungi, floors: [...floors], status, unreadable };
}

const pkgs = readdirSync(PKGDIR).filter((n) => { try { return statSync(join(PKGDIR, n)).isDirectory(); } catch { return false; } });
const rows = [];
for (const n of pkgs) { const c = classify(join(PKGDIR, n)); if (c) rows.push({ pkg: n, ...c }); }
rows.sort((a, b) => rank(a.pkg) - rank(b.pkg) || a.pkg.localeCompare(b.pkg));

const totFungi = rows.reduce((a, r) => a + r.fungi, 0), totTs = rows.reduce((a, r) => a + r.ts, 0);
const flooredPkgs = rows.filter((r) => r.floors.length);
const convertible = rows.filter((r) => r.status === "TS-ONLY (convertible-now)");
const summary = { packages: rows.length, fungiFiles: totFungi, tsFiles: totTs,
  pctFungiFiles: Math.round((totFungi / (totFungi + totTs)) * 100),
  fullyFungi: rows.filter((r) => r.status === "FULLY-FUNGI").length,
  convertibleNow: convertible.length, flooredPackages: flooredPkgs.length };

if (JSON_OUT) { console.log(JSON.stringify({ summary, rows }, null, 2)); process.exit(0); }

console.log("\n  Self-hosting readiness — packages-galerina (runtime-stack order; the HONEST map, no deletion)\n");
console.log("  pkg".padEnd(42) + "fungi  ts   %fungi  status / floors");
console.log("  " + "-".repeat(88));
for (const r of rows) {
  const floors = r.floors.length ? `  [${r.floors.join(",")}]` : "";
  console.log("  " + r.pkg.replace(/^galerina-/, "").padEnd(40) +
    String(r.fungi).padStart(4) + String(r.ts).padStart(6) + String(r.pctFungi + "%").padStart(8) + "   " + r.status + floors);
}
console.log("\n  ── summary ──");
console.log(`  ${summary.packages} code packages · ${summary.fungiFiles} .fungi / ${summary.tsFiles} .ts (${summary.pctFungiFiles}% .fungi files)`);
console.log(`  FULLY-FUNGI: ${summary.fullyFungi} · convertible-now (pure logic, no floor): ${summary.convertibleNow} · floored: ${summary.flooredPackages}`);
console.log(`\n  Floored packages CANNOT be 100% .fungi until the floor is self-hosted (the LATER/#102-106 DSS.wasm / PQ-custody work):`);
for (const r of flooredPkgs) console.log(`    ${r.pkg.replace(/^galerina-/, "")}: ${r.floors.join(", ")}`);
if (convertible.length) {
  console.log(`\n  Convertible-now candidates (pure-logic .ts, no crypto/ffi/host/interop floor) — real .fungi migration targets:`);
  for (const r of convertible) console.log(`    ${r.pkg.replace(/^galerina-/, "")} (${r.ts} .ts)`);
}
console.log("\n  NOTE: this is a MAP, not a gate. 100%-.fungi requires the .fungi->WASM lowering complete (? / exhaustive-match)");
console.log("        AND the crypto/host primitives self-hosted. Converting a FLOORED package now would delete a working");
console.log("        primitive impl with no .fungi replacement — do not. Drive by this map. (audit-selfhost-readiness.mjs)\n");
