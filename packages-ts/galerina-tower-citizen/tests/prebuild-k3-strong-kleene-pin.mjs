#!/usr/bin/env node
// Test-only prebuild for k3-strong-kleene-pin. Writes the dist files that
// tests/fixtures/k3-fungi-marshal.mjs and k3-strong-kleene-pin.test.mjs import:
//   ../dist/index.js (thin re-export of K3_UNKNOWN / Verdict)
//   ../dist/three-valued-governance.js and trit-gates.js
//   ../../galerina-core-compiler/dist/index.js (tsc if missing)
// Nothing is deleted. Safe to import as a side-effect from the pin test.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOWER = join(HERE, "..");
const COMPILER = join(TOWER, "..", "galerina-core-compiler");
const DIST = join(TOWER, "dist");

function tscBin(pkgRoot) {
  const local = join(pkgRoot, "node_modules", "typescript", "bin", "tsc");
  if (existsSync(local)) return local;
  const compilerTs = join(COMPILER, "node_modules", "typescript", "bin", "tsc");
  if (existsSync(compilerTs)) return compilerTs;
  return "tsc";
}

function runTsc(pkgRoot, args) {
  const bin = tscBin(pkgRoot);
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: pkgRoot,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const err = r.stderr || r.stdout || `tsc exit ${r.status}`;
    throw new Error(`k3-sk-pin prebuild tsc failed in ${pkgRoot}: ${err.slice(0, 800)}`);
  }
}

if (!existsSync(join(COMPILER, "dist", "index.js"))) {
  runTsc(COMPILER, ["-p", "tsconfig.json", "--pretty", "false"]);
}

mkdirSync(DIST, { recursive: true });
runTsc(TOWER, ["-p", "tsconfig.k3-sk-pin.json", "--pretty", "false"]);
writeFileSync(
  join(DIST, "index.js"),
  "export { Verdict, asVerdict, vAnd, vOr, vNot, allOf, anyOf, collapse, authorize, decideAtBoundary, GOV_3VL_DIAGNOSTIC, K3_UNKNOWN, isK3Unknown, vAndTensor, vAndTensor2D, consensusTritN, collapseConfidence } from \"./three-valued-governance.js\";\n",
);

if (!existsSync(join(COMPILER, "dist", "index.js"))) {
  throw new Error("k3-sk-pin prebuild: compiler dist/index.js still missing");
}
if (!existsSync(join(DIST, "index.js")) || !existsSync(join(DIST, "three-valued-governance.js"))) {
  throw new Error("k3-sk-pin prebuild: tower-citizen dist overlay still missing");
}
