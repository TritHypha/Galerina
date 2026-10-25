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
import { effectiveVerdict, Verdict } from "../dist/index.js";
import { fromFungi, toFungi } from "./fixtures/k3-fungi-marshal.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(PACKAGE_ROOT, "src", "self-hosted", "effective-verdict.fungi");
const REFERENCE_SOURCE = join(PACKAGE_ROOT, "src", "substrate-model.ts");
const PACKAGE = join(PACKAGE_ROOT, "package.json");
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

function readUtf8(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/u, "");
}

function compileCandidate() {
  assert.ok(existsSync(SOURCE), "Tower-Citizen must own the Fungi effectiveVerdict decision");
  const source = readUtf8(SOURCE);
  const program = parseProgram(source, "effective-verdict.fungi");
  assert.deepEqual(
    (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const effects = checkEffects(program.flows, program.ast);
  assert.deepEqual(
    effects.flatMap((result) => result.diagnostics)
      .filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  return program;
}

async function interpret(program, ideal, reading) {
  const interpreted = await executeFlow(
    "effectiveVerdict",
    new Map([
      ["ideal", await toFungi(ideal)],
      ["reading", await toFungi(reading)],
    ]),
    program.ast,
    program.flows,
  );
  return fromFungi(interpreted.value);
}

describe("Tower-Citizen package-owned Fungi effectiveVerdict decision", () => {
  it("requires one governed typed asset bound to the exact exported helper chain", () => {
    assert.ok(existsSync(SOURCE), "missing governed Fungi asset: effective-verdict.fungi");
    const packageJson = JSON.parse(readUtf8(PACKAGE));
    assert.ok(
      packageJson.packageGraph.loadedAssets.includes("src/self-hosted/effective-verdict.fungi"),
    );

    const source = readUtf8(SOURCE);
    assert.doesNotMatch(source, /^\s*(?:for|while|loop)\b/mu);
    assert.doesNotMatch(source, /\b(?:null|NaN|throw|try|catch)\b/u);
    assert.doesNotMatch(source, /\belse\s+if\b/u);
    assert.match(source, /check\s*\(ideal\)/u);
    assert.match(source, /check\s*\(reading\)/u);

    const reference = readUtf8(REFERENCE_SOURCE);
    assert.match(
      reference,
      /export function effectiveVerdict\(ideal: Verdict, reading: -1 \| 0 \| 1\): Verdict \{[\s\S]*?return vAnd\(ideal, reading\);\s*\}/u,
    );
  });

  it("matches the complete independent Verdict x Verdict infectious-UNKNOWN K3 minimum table", async () => {
    const program = compileCandidate();
    for (const [ideal, reading, expected] of K3_MIN) {
      assert.equal(
        effectiveVerdict(ideal, reading),
        expected,
        `TypeScript effectiveVerdict(${ideal}, ${reading})`,
      );
      assert.deepEqual(
        await interpret(program, ideal, reading),
        expected,
        `Fungi effectiveVerdict(${ideal}, ${reading})`,
      );
    }
  });

  it("K3U2: TS NEUTRAL 0 has no native image and is refused, never marshalled as Unknown", async () => {
    await assert.rejects(() => toFungi(Verdict.NEUTRAL), /NEUTRAL \(trit 0\) has no native Fungi Verdict image/u);
    await assert.rejects(() => toFungi(0), /NEUTRAL/u);
    await assert.rejects(() => toFungi({ kind: "K3_UNKNOWN" }), /not a TS Verdict/u);
    await assert.rejects(() => fromFungi({ __tag: "verdict", value: 2 }), /not a native Verdict/u);
    assert.notDeepEqual(await toFungi(Verdict.UNKNOWN), await toFungi(Verdict.DENY));
    assert.notDeepEqual(await toFungi(Verdict.UNKNOWN), await toFungi(Verdict.ALLOW));
  });
});
