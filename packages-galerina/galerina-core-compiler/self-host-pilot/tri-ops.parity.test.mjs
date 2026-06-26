// =============================================================================
// STAGE-B tri-ops self-host parity test (node:test)
//
// Asserts that the .spore scalar-trit ops in ./tri-ops.spore produce EXACTLY the
// same verdict as the reference TypeScript numeric `Tri` ops in
//   packages-galerina/galerina-core-logic/src/index.ts  (built dist)
// for every balanced-ternary input combination over {-1, 0, 1}.
//
// The .spore side is driven through the Stage path the CLI exposes:
//   node galerina.mjs run <file.spore> --invoke <flow> <args...>
// which compiles the pure Int flow and runs it, printing the integer result.
//
// Run:  node --test packages-galerina/galerina-core-compiler/self-host-pilot/tri-ops.parity.test.mjs
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Repo root is four levels up: self-host-pilot -> galerina-core-compiler -> packages-galerina -> <root>
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const GALERINA_CLI = resolve(REPO_ROOT, "galerina.mjs");
const SPORE_FILE = resolve(__dirname, "tri-ops.spore");

// ---------------------------------------------------------------------------
// Reference implementation: the .ts numeric Tri ops (built dist).
// ---------------------------------------------------------------------------
const ts = require(
  resolve(REPO_ROOT, "packages-galerina", "galerina-core-logic", "dist", "index.js"),
);

const TRITS = [-1, 0, 1];

// ---------------------------------------------------------------------------
// Drive the .spore flow through the CLI and parse its integer verdict.
// ---------------------------------------------------------------------------
function runLln(flow, ...args) {
  const out = execFileSync(
    process.execPath,
    [GALERINA_CLI, "run", SPORE_FILE, "--invoke", flow, ...args.map(String)],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  // Output is the integer result on its own line; take the last non-empty line.
  const lines = out.split(/\r?\n/).filter((l) => l.trim() !== "");
  const last = lines[lines.length - 1].trim();
  const n = Number(last);
  assert.ok(
    Number.isInteger(n),
    `flow ${flow}(${args.join(",")}) produced non-integer output: ${JSON.stringify(out)}`,
  );
  return n;
}

test("triNot parity (.spore vs .ts) over all trits", () => {
  for (const a of TRITS) {
    const expected = ts.triNot(a);
    const actual = runLln("triNot", a);
    assert.equal(
      actual,
      expected,
      `triNot(${a}): .spore=${actual} .ts=${expected}`,
    );
  }
});

test("triAnd parity (.spore vs .ts) over all trit pairs", () => {
  for (const a of TRITS) {
    for (const b of TRITS) {
      const expected = ts.triAnd(a, b);
      const actual = runLln("triAnd", a, b);
      assert.equal(
        actual,
        expected,
        `triAnd(${a},${b}): .spore=${actual} .ts=${expected}`,
      );
    }
  }
});

test("triOr parity (.spore vs .ts) over all trit pairs", () => {
  for (const a of TRITS) {
    for (const b of TRITS) {
      const expected = ts.triOr(a, b);
      const actual = runLln("triOr", a, b);
      assert.equal(
        actual,
        expected,
        `triOr(${a},${b}): .spore=${actual} .ts=${expected}`,
      );
    }
  }
});

test("triNor parity (.spore vs .ts) over all trit pairs", () => {
  for (const a of TRITS) {
    for (const b of TRITS) {
      const expected = ts.triNor(a, b);
      const actual = runLln("triNor", a, b);
      assert.equal(
        actual,
        expected,
        `triNor(${a},${b}): .spore=${actual} .ts=${expected}`,
      );
    }
  }
});
