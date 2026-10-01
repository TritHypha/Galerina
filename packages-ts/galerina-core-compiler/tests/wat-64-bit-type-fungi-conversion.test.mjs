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
} from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const SOURCE = join(PACKAGE_ROOT, "src", "self-hosted", "wat-64-bit-type.fungi");
const REFERENCE_SOURCE = join(PACKAGE_ROOT, "src", "wat-emitter-binary.ts");
const PACKAGE = join(PACKAGE_ROOT, "package.json");
const VECTORS = Object.freeze([
  Object.freeze(["Int64", true]),
  Object.freeze(["UInt64", true]),
  Object.freeze(["", false]),
  Object.freeze(["Int32", false]),
  Object.freeze(["int64", false]),
  Object.freeze([" Int64", false]),
  Object.freeze(["UInt64 ", false]),
  Object.freeze(["Int64\u0000", false]),
  Object.freeze(["unknown", false]),
]);

async function compileCandidate() {
  assert.ok(existsSync(SOURCE), "the package-owned WAT 64-bit type Fungi asset must exist");
  const source = readFileSync(SOURCE, "utf8").replace(/^\uFEFF/u, "");
  const program = parseProgram(source, "wat-64-bit-type.fungi");
  assert.deepEqual(
    (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
    [],
    "the exact WAT 64-bit type Fungi asset must parse and type-check without errors",
  );
  const effects = checkEffects(program.flows, program.ast);
  const { gir } = emitGIR(program.ast, program.flows, effects);
  const wat = renderWAT(
    buildWATModuleFromGIR(gir, undefined, "wat-64-bit-type", program.ast, true),
  );
  const assembled = await assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  assert.deepEqual(assembled.diagnostics, []);
  assert.match(wat, /call \$host___str_eq/u, "String equality must lower by value");
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
  assert.equal(typeof instance.exports.is64BitWatType, "function");
  return { host, instance, program };
}

async function interpret(compiled, base) {
  const interpreted = await executeFlow(
    "is64BitWatType",
    new Map([["base", { __tag: "string", value: base }]]),
    compiled.program.ast,
    compiled.program.flows,
  );
  return interpreted.value;
}

function executeWasm(compiled, base) {
  return Boolean(compiled.instance.exports.is64BitWatType(compiled.host.internString(base)));
}

describe("compiler package-owned Fungi WAT 64-bit type decision", () => {
  it("tracks the private TypeScript sets and helper as a governed package asset", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE, "utf8"));
    assert.ok(packageJson.packageGraph.loadedAssets.includes("src/self-hosted/wat-64-bit-type.fungi"));
    assert.ok(existsSync(SOURCE));
    const reference = readFileSync(REFERENCE_SOURCE, "utf8").replace(/^\uFEFF/u, "");
    assert.match(reference, /(?:export )?const INT64_WAT_TYPES = new Set<string>\(\["Int64"\]\);/u);
    assert.match(reference, /(?:export )?const UINT64_WAT_TYPES = new Set<string>\(\["UInt64"\]\);/u);
    assert.match(
      reference,
      /(?:export )?const is64BitWatType = \(base: string\): boolean => INT64_WAT_TYPES\.has\(base\) \|\| UINT64_WAT_TYPES\.has\(base\);/u,
    );
  });

  it("matches canonical and hostile Strings through interpreter and signed Wasm", async () => {
    const compiled = await compileCandidate();
    for (const [base, wanted] of VECTORS) {
      assert.deepEqual(
        await interpret(compiled, base),
        { __tag: "bool", value: wanted },
        `Fungi ${JSON.stringify(base)}`,
      );
      assert.equal(executeWasm(compiled, base), wanted, `Wasm ${JSON.stringify(base)}`);
    }
  });

  it("keeps the public WAT-emission path on i64 for UInt64", () => {
    const callerSource = [
      "@version 1",
      "",
      "pure flow echoUInt64(value: UInt64) -> UInt64 {",
      "  return value",
      "}",
      "",
    ].join("\n");
    const program = parseProgram(callerSource, "wat-64-bit-public-caller.fungi");
    assert.deepEqual(
      (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
      [],
    );
    const effects = checkEffects(program.flows, program.ast);
    const { gir } = emitGIR(program.ast, program.flows, effects);
    const wat = renderWAT(
      buildWATModuleFromGIR(gir, undefined, "wat-64-bit-public-caller", program.ast, true),
    );
    assert.match(wat, /\(param \$p0 i64\)/u);
    assert.match(wat, /\(result i64\)/u);
  });
});
