import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  SCALAR_COMPILER_SOURCE_LOCATORS,
  admitTypeScriptCompiler,
  compileAdmittedTypeScriptProject,
} from "../generate-rd0858-scalar-oracle-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const compiler = join(root, "packages-ts/galerina-core-compiler");
const helper = "generic-argument-kinds.ts";
const helperBytes = readFileSync(join(compiler, "src", helper));
const admitted = admitTypeScriptCompiler(process.execPath, join(compiler, "node_modules/typescript"));
// Virtual inputs only: the production closed compiler does not write these paths.
const identityRoot = join(root, "virtual-secret-helper-admission");
const sourceRoot = join(identityRoot, "src");
function project(includeHelper) {
  return {
    currentDirectory: sourceRoot,
    identityRoot,
    rootNames: [join(sourceRoot, "consumer.ts")],
    files: {
      [join(sourceRoot, "consumer.ts")]: Buffer.from(
        'import { genericArgumentKind } from "./generic-argument-kinds.js";\n'
        + 'export const kind = genericArgumentKind("Brand", 1);\n',
      ),
      [join(sourceRoot, "package.json")]: Buffer.from('{"type":"module"}\n'),
      ...(includeHelper ? { [join(sourceRoot, helper)]: helperBytes } : {}),
    },
    options: {
      target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
      strict: true, declaration: true, rootDir: sourceRoot, outDir: join(identityRoot, "out"),
    },
  };
}

test("scalar source admission emits and executes the current generic helper", async () => {
  assert.ok(Object.isFrozen(SCALAR_COMPILER_SOURCE_LOCATORS));
  const inputs = project(SCALAR_COMPILER_SOURCE_LOCATORS.includes(helper));
  const first = compileAdmittedTypeScriptProject(admitted, inputs);
  const second = compileAdmittedTypeScriptProject(admitted, inputs);
  assert.equal(first.inputDigest, second.inputDigest);
  assert.deepEqual(first.outputs, second.outputs);
  const emitted = Object.entries(first.outputs).find(([path]) => path.endsWith("/generic-argument-kinds.js"));
  assert.ok(emitted, "the real admitted compiler must emit the selected source");
  const module = await import(`data:text/javascript;base64,${Buffer.from(emitted[1]).toString("base64")}`);
  assert.equal(module.genericArgumentKind("Brand", 1), "tag");
  assert.equal(module.genericArgumentKind("Vector", 1), "dim");
  assert.equal(module.genericArgumentKind("Tensor", 1), "shape");
  assert.equal(module.genericArgumentKind("List", 0), "type");
  assert.equal(module.genericArgumentKind("List", 1), undefined);
});

test("closed scalar compiler refuses a missing helper without ambient source fallback", () => {
  assert.throws(
    () => compileAdmittedTypeScriptProject(admitted, project(false)),
    error => error?.code === "COMPILER_BUILD_DIAGNOSTIC",
  );
});
