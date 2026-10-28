import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  checkEffects,
  executeFlow,
  parseProgram,
} from "../../galerina-core-compiler/dist/index.js";
import { Verdict, vAnd } from "../dist/index.js";
import { fromFungi, toFungi } from "./fixtures/k3-fungi-marshal.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXISTING_SOURCE = join(PACKAGE_ROOT, "src", "self-hosted", "effective-verdict.fungi");
const DUPLICATE_SOURCE = join(PACKAGE_ROOT, "src", "self-hosted", "verdict-and.fungi");
const REFERENCE_SOURCE = join(PACKAGE_ROOT, "src", "three-valued-governance.ts");
const K3_MIN = Object.freeze([
  Object.freeze([Verdict.DENY, Verdict.DENY, Verdict.DENY]),
  Object.freeze([Verdict.DENY, Verdict.UNKNOWN, Verdict.UNKNOWN]),
  Object.freeze([Verdict.DENY, Verdict.ALLOW, Verdict.DENY]),
  Object.freeze([Verdict.UNKNOWN, Verdict.DENY, Verdict.UNKNOWN]),
  Object.freeze([Verdict.UNKNOWN, Verdict.UNKNOWN, Verdict.UNKNOWN]),
  Object.freeze([Verdict.UNKNOWN, Verdict.ALLOW, Verdict.UNKNOWN]),
  Object.freeze([Verdict.ALLOW, Verdict.DENY, Verdict.DENY]),
  Object.freeze([Verdict.ALLOW, Verdict.UNKNOWN, Verdict.UNKNOWN]),
  Object.freeze([Verdict.ALLOW, Verdict.ALLOW, Verdict.ALLOW]),
]);
// K3-SK 2026-10-28: the shipped Fungi flow is the real implementation and is strong Kleene AND = min
// (DENY absorbs UNKNOWN). K3_MIN above stays as the pin of the FROZEN, known-divergent TS reference.
const K3_STRONG_MIN = Object.freeze([
  Object.freeze([Verdict.DENY, Verdict.DENY, Verdict.DENY]),
  Object.freeze([Verdict.DENY, Verdict.UNKNOWN, Verdict.DENY]),
  Object.freeze([Verdict.DENY, Verdict.ALLOW, Verdict.DENY]),
  Object.freeze([Verdict.UNKNOWN, Verdict.DENY, Verdict.DENY]),
  Object.freeze([Verdict.UNKNOWN, Verdict.UNKNOWN, Verdict.UNKNOWN]),
  Object.freeze([Verdict.UNKNOWN, Verdict.ALLOW, Verdict.UNKNOWN]),
  Object.freeze([Verdict.ALLOW, Verdict.DENY, Verdict.DENY]),
  Object.freeze([Verdict.ALLOW, Verdict.UNKNOWN, Verdict.UNKNOWN]),
  Object.freeze([Verdict.ALLOW, Verdict.ALLOW, Verdict.ALLOW]),
]);
const K3_STRONG_MIN_DIVERGENT_ROWS = Object.freeze([1,3]);

function readUtf8(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/u, "");
}

function compileExistingCandidate() {
  const source = readUtf8(EXISTING_SOURCE);
  const program = parseProgram(source, "effective-verdict.fungi");
  assert.deepEqual(
    (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.deepEqual(
    checkEffects(program.flows, program.ast)
      .flatMap((result) => result.diagnostics)
      .filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  return program;
}

async function interpret(program, left, right) {
  const interpreted = await executeFlow(
    "effectiveVerdict",
    new Map([
      ["ideal", await toFungi(left)],
      ["reading", await toFungi(right)],
    ]),
    program.ast,
    program.flows,
  );
  return fromFungi(interpreted.value);
}

describe("Slice 93 vAnd is superseded by existing Fungi minimum", () => {
  it("binds the exact export and refuses a duplicate Fungi asset", () => {
    assert.ok(existsSync(EXISTING_SOURCE), "missing Slice 91 minimum asset");
    assert.equal(existsSync(DUPLICATE_SOURCE), false, "duplicate verdict-and.fungi is forbidden");
    assert.match(
      readUtf8(REFERENCE_SOURCE),
      /export function vAnd\(a: Verdict, b: Verdict\): Verdict \{\s*const x = operand\(a, "vAnd"\);\s*const y = operand\(b, "vAnd"\);\s*if \(isK3Unknown\(x\) \|\| isK3Unknown\(y\)\) return K3_UNKNOWN;\s*return asVerdict\(minTrit\(x, y\)\);\s*\}/u,
    );
  });

  it("matches all nine literal rows: TS reference infectious-UNKNOWN, existing Fungi flow strong-Kleene minimum", async () => {
    const program = compileExistingCandidate();
    for (const [i, [left, right, expected]] of K3_MIN.entries()) {
      assert.deepEqual(K3_STRONG_MIN[i].slice(0, 2), [left, right]);
      assert.equal(vAnd(left, right), expected, `TypeScript vAnd(${left}, ${right})`);
      assert.deepEqual(
        await interpret(program, left, right),
        K3_STRONG_MIN[i][2],
        `existing Fungi minimum(${left}, ${right})`,
      );
    }
  });
  it("K3-SK: frozen TS reference diverges from the strong-Kleene Fungi flow at exactly the recorded rows", () => {
    const diff = K3_MIN.flatMap((row, i) => (row[2] === K3_STRONG_MIN[i][2] ? [] : [i]));
    assert.deepEqual(diff, [...K3_STRONG_MIN_DIVERGENT_ROWS]);
  });
});
