import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
} from "../../packages-ts/galerina-core-compiler/dist/index.js";

function readUtf8(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/u, "");
}

export function assertScalarClassifierAsset({
  packageRoot,
  assetRelative,
  referenceRelative,
  assertReference,
  assetRoot = packageRoot,
  packageAssetRequired = assetRoot === packageRoot,
  productTree,
}) {
  const sourcePath = join(assetRoot, ...assetRelative.split("/"));
  assert.ok(existsSync(sourcePath), `missing governed Fungi asset: ${assetRelative}`);

  const packageJson = JSON.parse(readUtf8(join(packageRoot, "package.json")));
  if (packageAssetRequired) {
    assert.ok(
      Array.isArray(packageJson.packageGraph?.loadedAssets),
      "packageGraph.loadedAssets must be an explicit array",
    );
    assert.ok(packageJson.packageGraph.loadedAssets.includes(assetRelative));
  } else {
    const productAssets = packageJson.packageGraph?.productAssets ?? [];
    assert.ok(
      Array.isArray(productAssets) && productAssets.some((entry) =>
        entry?.tree === productTree && entry?.path === assetRelative
      ),
      `missing productAssets declaration for ${productTree}/${assetRelative}`,
    );
  }

  const source = readUtf8(sourcePath);
  assert.doesNotMatch(source, /^\s*(?:for|while|loop)\b/mu);
  assert.doesNotMatch(source, /\b(?:null|NaN|throw|try|catch)\b/u);
  assert.doesNotMatch(source, /\belse\s+if\b/u);
  assert.match(source, /\bmatch\b/u);
  assert.match(source, /_\s*=>/u);

  const reference = readUtf8(join(packageRoot, ...referenceRelative.split("/")));
  assertReference(reference);
}

async function compileCandidate({ packageRoot, assetRoot = packageRoot, assetRelative, flowName }) {
  const source = readUtf8(join(assetRoot, ...assetRelative.split("/")));
  const program = parseProgram(source, assetRelative);
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
    buildWATModuleFromGIR(gir, undefined, flowName, program.ast, true),
  );
  const assembled = await assembleWAT(wat);
  if (!assembled.valid || assembled.diagnostics.length > 0) {
    assert.fail(JSON.stringify(assembled.diagnostics));
  }

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
  assert.equal(typeof instance.exports[flowName], "function");
  return { host, instance, nextHandle, program };
}

export async function proveScalarClassifier({
  packageRoot,
  assetRoot = packageRoot,
  assetRelative,
  flowName,
  parameterName,
  cases,
}) {
  const compiled = await compileCandidate({ packageRoot, assetRoot, assetRelative, flowName });
  for (const { value, expected } of cases) {
    const interpreted = await executeFlow(
      flowName,
      new Map([[parameterName, { __tag: "string", value }]]),
      compiled.program.ast,
      compiled.program.flows,
    );
    assert.deepEqual(
      interpreted.value,
      { __tag: "bool", value: expected },
      `Fungi ${flowName}(${JSON.stringify(value)})`,
    );

    const handle = compiled.nextHandle;
    compiled.nextHandle += 1;
    compiled.host.seedString(handle, value);
    assert.equal(
      Boolean(compiled.instance.exports[flowName](handle)),
      expected,
      `signed Wasm ${flowName}(${JSON.stringify(value)})`,
    );
  }
}
