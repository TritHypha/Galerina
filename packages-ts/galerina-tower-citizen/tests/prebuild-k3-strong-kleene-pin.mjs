#!/usr/bin/env node
// Test-only prebuild for k3-strong-kleene-pin. Writes the dist files that
// tests/fixtures/k3-fungi-marshal.mjs and k3-strong-kleene-pin.test.mjs import:
//   ../dist/index.js (thin re-export of K3_UNKNOWN / Verdict)
//   ../dist/three-valued-governance.js and trit-gates.js
//   ../../galerina-core-compiler/dist/index.js (tsc if missing)
// Nothing is deleted. Safe to import as a side-effect from the pin test.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOWER = join(HERE, "..");
const COMPILER = join(TOWER, "..", "galerina-core-compiler");
const DIST = join(TOWER, "dist");

function tscBin(pkgRoot) {
  const candidates = [];
  const seen = new Set();
  const add = (p) => {
    const n = resolve(p);
    if (!seen.has(n)) {
      seen.add(n);
      candidates.push(n);
    }
  };
  add(join(pkgRoot, "node_modules", "typescript", "bin", "tsc"));
  add(join(COMPILER, "node_modules", "typescript", "bin", "tsc"));
  let dir = resolve(TOWER);
  for (let i = 0; i < 8; i += 1) {
    add(join(dir, "node_modules", "typescript", "bin", "tsc"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "k3-sk-pin prebuild: typescript tsc not found under node_modules (bare tsc is refused)",
  );
}

function runTsc(pkgRoot, args) {
  const bin = tscBin(pkgRoot);
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: pkgRoot,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    const err = r.stderr || r.stdout || `tsc exit ${r.status}`;
    const compilerHint = pkgRoot === COMPILER
      ? " run npm install / npm run build in galerina-core-compiler."
      : "";
    throw new Error(`k3-sk-pin prebuild tsc failed in ${pkgRoot}:${compilerHint} ${err.slice(0, 800)}`);
  }
}

export function prebuildK3StrongKleenePin() {
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
    throw new Error(
      "k3-sk-pin prebuild: compiler dist/index.js still missing; run npm install / npm run build in galerina-core-compiler",
    );
  }
  if (!existsSync(join(DIST, "index.js")) || !existsSync(join(DIST, "three-valued-governance.js"))) {
    throw new Error("k3-sk-pin prebuild: tower-citizen dist overlay still missing");
  }
}

const invokedAsCli = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsCli) prebuildK3StrongKleenePin();
