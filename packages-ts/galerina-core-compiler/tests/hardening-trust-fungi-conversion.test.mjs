import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  assembleWAT,
  boundaryTrusted,
  buildWATModuleFromGIR,
  checkEffects,
  combineTrust,
  emitGIR,
  executeFlow,
  parseProgram,
  refute,
  renderWAT,
  trustName,
} from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const SOURCE = join(
  PACKAGE_ROOT,
  "src",
  "self-hosted",
  "hardening-trust-boundary.fungi",
);
const PACKAGE = join(PACKAGE_ROOT, "package.json");
const TRITS = Object.freeze([-1, 0, 1]);
const CONJUNCTION = Object.freeze([
  Object.freeze([-1, -1, -1]),
  Object.freeze([-1, 0, -1]),
  Object.freeze([-1, 1, -1]),
  Object.freeze([0, -1, -1]),
  Object.freeze([0, 0, 0]),
  Object.freeze([0, 1, 0]),
  Object.freeze([1, -1, -1]),
  Object.freeze([1, 0, 0]),
  Object.freeze([1, 1, 1]),
]);
const RELEASE = Object.freeze([
  Object.freeze([-1, false]),
  Object.freeze([0, false]),
  Object.freeze([1, true]),
]);
const NAMES = Object.freeze([
  Object.freeze([-1, "Refuted"]),
  Object.freeze([0, "Unverified"]),
  Object.freeze([1, "Trusted"]),
]);

async function compileCandidate() {
  assert.ok(existsSync(SOURCE), "the package-owned hardening trust Fungi asset must exist");
  const source = readFileSync(SOURCE, "utf8").replace(/^\uFEFF/u, "");
  const program = parseProgram(source, "hardening-trust-boundary.fungi");
  assert.deepEqual(
    (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
    [],
    "the exact hardening trust Fungi asset must parse and type-check without errors",
  );
  const effects = checkEffects(program.flows, program.ast);
  const { gir } = emitGIR(program.ast, program.flows, effects);
  const wat = renderWAT(
    buildWATModuleFromGIR(
      gir,
      undefined,
      "hardening-trust-boundary",
      program.ast,
      true,
    ),
  );
  const assembled = await assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  assert.deepEqual(assembled.diagnostics, []);
  const instance = await WebAssembly.instantiate(assembled.wasm, {});
  return { exports: instance.instance.exports, program };
}

describe("compiler package-owned Fungi hardening trust boundary", () => {
  it("tracks the executable trust boundary as a governed package asset", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE, "utf8"));
    assert.ok(
      packageJson.packageGraph.loadedAssets.includes(
        "src/self-hosted/hardening-trust-boundary.fungi",
      ),
    );
    assert.ok(existsSync(SOURCE));
  });

  it("matches the literal K3 conjunction and fail-closed release tables", async () => {
    const { exports: fungi, program } = await compileCandidate();
    assert.equal(typeof fungi.combineTrust, "function");
    assert.equal(typeof fungi.boundaryTrusted, "function");
    assert.equal(typeof fungi.trustName, "function");
    assert.equal(typeof fungi.refute, "function");

    for (const [left, right, expected] of CONJUNCTION) {
      assert.equal(combineTrust(left, right), expected, `TypeScript combineTrust(${left},${right})`);
      assert.equal(fungi.combineTrust(left, right), expected, `Fungi combineTrust(${left},${right})`);
    }
    for (const [trust, expected] of RELEASE) {
      assert.equal(boundaryTrusted(trust), expected, `TypeScript boundaryTrusted(${trust})`);
      assert.equal(Boolean(fungi.boundaryTrusted(trust)), expected, `Fungi boundaryTrusted(${trust})`);
    }
    for (const [trust, expected] of NAMES) {
      assert.equal(trustName(trust), expected, `TypeScript trustName(${trust})`);
      const interpreted = await executeFlow(
        "trustName",
        new Map([["trust", { __tag: "verdict", value: trust }]]),
        program.ast,
        program.flows,
      );
      assert.deepEqual(
        interpreted.value,
        { __tag: "string", value: expected },
        `Fungi trustName(${trust})`,
      );
    }
    assert.equal(refute(), -1, "TypeScript refute() must remain the sticky hard negative");
    assert.equal(fungi.refute(), refute(), "Fungi WAT refute() must exactly match TypeScript");
    const interpretedRefute = await executeFlow("refute", new Map(), program.ast, program.flows);
    assert.deepEqual(
      interpretedRefute.value,
      { __tag: "verdict", value: refute() },
      "Fungi interpreted refute() must exactly match TypeScript",
    );

    assert.deepEqual(TRITS, [-1, 0, 1]);
  });
});
