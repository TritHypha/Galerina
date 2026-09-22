import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  admitAndInstantiate,
  assembleWAT,
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
import { validateTransition } from "../dist/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_RELATIVE = "../../packages/fungi/products/galerina/rd0873-devtools-project-graph/resource-transition.fungi";
const ASSET = join(PACKAGE_ROOT, ...ASSET_RELATIVE.split("/"));
const PACKAGE = join(PACKAGE_ROOT, "package.json");
const STATES = Object.freeze([
  "declared",
  "planned",
  "initializing",
  "ready",
  "failed",
  "shutting_down",
  "closed",
]);
const ALLOWED = new Set([
  "declared\u0000planned",
  "declared\u0000failed",
  "planned\u0000initializing",
  "planned\u0000failed",
  "initializing\u0000ready",
  "initializing\u0000failed",
  "ready\u0000shutting_down",
  "ready\u0000failed",
  "failed\u0000shutting_down",
  "shutting_down\u0000closed",
  "shutting_down\u0000failed",
]);

async function compileCandidate() {
  const source = readFileSync(ASSET, "utf8").replace(/^\uFEFF/u, "");
  const program = parseProgram(source, ASSET_RELATIVE);
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
  const wat = renderWAT(
    buildWATModuleFromGIR(gir, undefined, "validateTransition", program.ast, true),
  );
  const assembled = await assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  assert.deepEqual(assembled.diagnostics, []);

  const host = createHostRuntime();
  let nextHandle = 1;
  for (const entry of getInternedStrings()) {
    host.seedString(entry.handle, entry.value);
    nextHandle = Math.max(nextHandle, entry.handle + 1);
  }
  const keypair = generateRunnerKeypair();
  const attestation = signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
  const { instance } = await admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
    host,
  });
  return { host, instance, nextHandle, program };
}

describe("project-graph package-owned Fungi resource transition decision", () => {
  it("requires the governed asset and complete source transition table", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE, "utf8"));
    const productAssets = packageJson.packageGraph?.productAssets ?? [];
    assert.ok(
      productAssets.some((entry) =>
        entry?.tree === "packages/fungi/products/galerina/rd0873-devtools-project-graph"
        && entry?.path === "resource-transition.fungi"
      ),
      "missing productAssets declaration for resource-transition.fungi",
    );
    assert.equal(existsSync(ASSET), true, `missing governed Fungi asset: ${ASSET_RELATIVE}`);

    const reference = readFileSync(
      join(PACKAGE_ROOT, "src", "graphs", "resource-graph.ts"),
      "utf8",
    );
    assert.match(
      reference,
      /export function validateTransition\(from: ResourceState, to: ResourceState\): boolean/u,
    );
    assert.doesNotMatch(reference, /VALID_TRANSITIONS/u);
    assert.match(
      reference,
      /export function validateTransition[\s\S]*from === "declared"[\s\S]*to === "planned"[\s\S]*from === "shutting_down"[\s\S]*to === "closed"/u,
    );
    for (const state of STATES) {
      assert.match(reference, new RegExp(`\\| "${state}"|from === "${state}"`, "u"), `missing source state: ${state}`);
    }
  });

  it("matches the complete 7 by 7 source domain and hostile surplus text", async () => {
    const compiled = await compileCandidate();
    const values = [...STATES, "", "Declared", "closed ", "failed\u0000"];
    for (const from of values) {
      for (const to of values) {
        const expected = ALLOWED.has(`${from}\u0000${to}`);
        assert.equal(validateTransition(from, to), expected, `TypeScript ${from}->${to}`);
        const interpreted = await executeFlow(
          "validateTransition",
          new Map([
            ["from", { __tag: "string", value: from }],
            ["to", { __tag: "string", value: to }],
          ]),
          compiled.program.ast,
          compiled.program.flows,
        );
        assert.deepEqual(
          interpreted.value,
          { __tag: "bool", value: expected },
          `Fungi ${from}->${to}`,
        );

        const fromHandle = compiled.nextHandle++;
        const toHandle = compiled.nextHandle++;
        compiled.host.seedString(fromHandle, from);
        compiled.host.seedString(toHandle, to);
        assert.equal(
          Boolean(compiled.instance.exports.validateTransition(fromHandle, toHandle)),
          expected,
          `signed Wasm ${from}->${to}`,
        );
      }
    }
  });
});
