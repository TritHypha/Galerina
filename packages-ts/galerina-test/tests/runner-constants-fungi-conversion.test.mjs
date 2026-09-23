import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  assembleWAT,
  admitAndInstantiate,
  buildWATModuleFromGIR,
  checkEffects,
  createHostRuntime,
  emitGIR,
  executeFlow,
  generateRunnerKeypair,
  getInternedStrings,
  parseProgram,
  renderWAT,
  signWasm,
} from "../../galerina-core-compiler/dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const SOURCE = join(PACKAGE_ROOT, "src", "self-hosted", "runner-constants.fungi");
const REFERENCE_SOURCE = join(PACKAGE_ROOT, "src", "runners.ts");
const SPAWN_SOURCE = join(PACKAGE_ROOT, "src", "spawn.ts");
const PACKAGE = join(PACKAGE_ROOT, "package.json");

const STRING_CASES = new Map([
  ["unitRunner", { name: "UNIT_RUNNER", value: "scripts/run-all-tests.cjs" }],
  ["r6Parity", { name: "R6_PARITY", value: "tests/r6-corpus/r6-parity.test.mjs" }],
  ["fidelityDifferential", { name: "FIDELITY_DIFFERENTIAL", value: "packages-ts/galerina-core-compiler/tests/fidelity-differential.test.mjs" }],
  ["compilerDist", { name: "COMPILER_DIST", value: "packages-ts/galerina-core-compiler/dist/index.js" }],
  ["compilerBuildEvidence", { name: "COMPILER_BUILD_EVIDENCE", value: "packages-ts/galerina-core-compiler/dist/build-evidence.json" }],
  ["compilerPackage", { name: "COMPILER_PACKAGE", value: "packages-ts/galerina-core-compiler" }],
  ["galerinaCli", { name: "GALERINA_CLI", value: "galerina.mjs" }],
  ["compilerEvidenceSchema", { name: "COMPILER_EVIDENCE_SCHEMA", value: "fungi.compiler.build-evidence.v1" }],
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function compileCandidate() {
  assert.ok(existsSync(SOURCE), "the package-owned runner constants Fungi asset must exist");
  const source = readFileSync(SOURCE, "utf8").replace(/^\uFEFF/u, "");
  const program = parseProgram(source, "runner-constants.fungi");
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
  const { gir } = emitGIR(program.ast, program.flows, effects);
  const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "runner-constants", program.ast, true));
  const assembled = await assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  assert.deepEqual(assembled.diagnostics, []);
  const host = createHostRuntime();
  for (const entry of getInternedStrings()) host.seedString(entry.handle, entry.value);
  const keypair = generateRunnerKeypair();
  const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
    host,
  });
  return { host, instance, program, source };
}

describe("galerina-test package-owned Fungi runner constants", () => {
  it("binds every exact TypeScript constant and the package manifest", async () => {
    const compiled = await compileCandidate();
    const packageJson = JSON.parse(readFileSync(PACKAGE, "utf8"));
    const loadedAssets = packageJson.packageGraph?.loadedAssets ?? [];
    assert.deepEqual(loadedAssets.filter((asset) => !asset.includes("/conversion-overlays/")), [
      "src/self-hosted/runner-constants.fungi",
      "src/self-hosted/test-marker.fungi",
      "src/self-hosted/workspace-marker.fungi",
    ]);
    const overlayAssets = loadedAssets.filter((asset) => asset.includes("/conversion-overlays/"));
    assert.equal(new Set(overlayAssets).size, overlayAssets.length, "conversion overlay identities must be unique");
    const spawn = readFileSync(SPAWN_SOURCE, "utf8").replace(/^\uFEFF/u, "");
    assert.match(spawn, /export const DEFAULT_TIMEOUT_MS = 600_000;/u);
    const runners = readFileSync(REFERENCE_SOURCE, "utf8").replace(/^\uFEFF/u, "");
    for (const { name, value } of STRING_CASES.values()) {
      assert.match(
        runners,
        new RegExp(`const\\s+${name}\\s*=\\s*"${escapeRegExp(value)}";`, "u"),
        name,
      );
    }
    const syntaxOnly = compiled.source
      .replace(/^\s*\/\/\/.*$/gmu, "")
      .replace(/"(?:\\.|[^"\\])*"/gu, '""');
    assert.doesNotMatch(syntaxOnly, /\b(?:null|NaN|else|throw|try|catch|for|while|loop)\b/u);
  });

  it("preserves the exact integer and strings through interpretation and signed Wasm", async () => {
    const compiled = await compileCandidate();
    const timeout = await executeFlow("defaultTimeoutMs", new Map(), compiled.program.ast, compiled.program.flows);
    assert.deepEqual(timeout.value, { __tag: "int", value: 600_000 });
    assert.equal(compiled.instance.exports.defaultTimeoutMs(), 600_000);
    assert.notEqual(compiled.instance.exports.defaultTimeoutMs(), 599_999);
    assert.notEqual(compiled.instance.exports.defaultTimeoutMs(), 600_001);
    for (const [flow, { value: expected }] of STRING_CASES) {
      const interpreted = await executeFlow(flow, new Map(), compiled.program.ast, compiled.program.flows);
      assert.equal(interpreted.value.__tag, "string");
      assert.equal(interpreted.value.value, expected, `${flow} must match the live TypeScript path`);
      assert.equal(compiled.host.readString(compiled.instance.exports[flow]()), expected, `${flow} Wasm path must match`);
      assert.notEqual(expected.toUpperCase(), expected);
    }
  });
});
