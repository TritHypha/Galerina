import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import * as generator from "../generate-rd0858-scalar-oracle-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const compiler = join(root, "packages-ts/galerina-core-compiler");
const runtime = join(root, "packages-ts/galerina-core-runtime-wasm");
const admitted = generator.admitTypeScriptCompiler(process.execPath, join(compiler, "node_modules/typescript"));

function sourceFiles(packageName, stage, locators) {
  const source = join(root, "packages-ts", packageName, "src");
  function walk(directory, prefix = "") {
    assert.ok(prefix.split("/").length < 8);
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      assert.ok(!entry.isSymbolicLink());
      const locator = `${prefix}${entry.name}`;
      return entry.isDirectory() ? walk(join(directory, entry.name), `${locator}/`)
        : entry.name.endsWith(".ts") ? [locator] : [];
    }).sort();
  }
  const selected = locators ?? walk(source);
  assert.ok(selected.length < 100);
  return Object.fromEntries(selected.map(locator => [join(stage, "src", locator), readFileSync(join(source, locator))]));
}

function inputsAt(identityRoot) {
  const stage = join(identityRoot, "stage");
  return {
    identityRoot,
    compilerFiles: sourceFiles("galerina-core-compiler", join(stage, "compiler"), generator.SCALAR_COMPILER_SOURCE_LOCATORS),
    graphFiles: sourceFiles("galerina-devtools-graph-algorithms", join(stage, "graph")),
    substrateFiles: sourceFiles("galerina-substrate-math", join(stage, "substrate")),
    decimalFiles: sourceFiles("galerina-core-runtime-wasm", join(stage, "decimal"), ["decimal-core.ts"]),
    decimalPackageBytes: readFileSync(join(runtime, "package.json")),
  };
}

const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function writeFixture(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
function executableLocators(runtimeRoot, outputs) {
  return Object.keys(outputs).filter(path => /\.(?:js|mjs|json)$/.test(path))
    .map(path => path.slice(runtimeRoot.length + 1).replaceAll("\\", "/")).sort();
}

// Breaks if any selected import disappears, an ambient file is admitted, or the
// real leaf's emitted bytes are no longer part of the compiled/loaded identity.
test("selected scalar closure compiles, loads under the closed loader, and refuses omissions", { timeout: 100_000 }, async t => {
  const temporary = mkdtempSync(join(tmpdir(), "rd0858-scalar-closure-"));
  assert.equal(dirname(realpathSync(temporary)), realpathSync(tmpdir()));
  try {
    const inputs = inputsAt(temporary);
    const runtimeRoot = join(temporary, "runtime");
    const built = generator.compileScalarCompilerClosure(admitted, inputs);
    const entryPath = join(runtimeRoot, "core/rd0858-scalar-compiler-entry.js");
    const leafPath = join(runtimeRoot, "node_modules/@galerina/core-runtime-wasm/dist/decimal-core.js");
    assert.ok(built.outputFiles[entryPath]);
    assert.ok(built.outputFiles[leafPath]);
    assert.equal(built.outputFiles[join(runtimeRoot, "node_modules/@galerina/core-runtime-wasm/dist/index.js")], undefined);
    // Exact owner package bytes, not a fixture alias pretending to be the package.
    assert.equal(built.outputFiles[join(runtimeRoot, "node_modules/@galerina/core-runtime-wasm/package.json")], inputs.decimalPackageBytes.toString("utf8"));

    await t.test("real package subpath resolves from a compiler consumer", async () => {
      const consumerUrl = pathToFileURL(join(compiler, "src/decimal-arith.ts")).href;
      const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
        import { createRequire } from "node:module";
        import { pathToFileURL } from "node:url";
        const path = createRequire(${JSON.stringify(consumerUrl)}).resolve("@galerina/core-runtime-wasm/dist/decimal-core.js");
        const leaf = await import(pathToFileURL(path));
        if (leaf.decDiv("1", "2", 1, "halfEven") !== "0.5") throw new Error("leaf semantics");
        console.log(JSON.stringify({ok:true, modes:leaf.ROUND_MODES}));
      `], { cwd: temporary, env: {}, encoding: "utf8", timeout: 10_000, maxBuffer: 1_048_576 });
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(JSON.parse(child.stdout).modes, ["halfEven", "halfUp", "halfDown", "up", "down", "ceiling", "floor"]);
    });

    // Disk twins deliberately survive omission from the closed map.
    for (const files of [inputs.compilerFiles, inputs.decimalFiles]) {
      for (const [path, bytes] of Object.entries(files)) writeFixture(path, bytes);
    }
    for (const locator of ["decimal-arith.ts", "method-chain-checker.ts", "typed-content-block.ts", "generic-argument-kinds.ts"]) {
      await t.test(`refuses omitted ${locator} despite its disk twin`, () => {
        const path = join(temporary, "stage/compiler/src", locator);
        assert.ok(existsSync(path));
        const compilerFiles = { ...inputs.compilerFiles };
        delete compilerFiles[path];
        assert.throws(() => generator.compileScalarCompilerClosure(admitted, { ...inputs, compilerFiles }), error => error.code === "COMPILER_BUILD_DIAGNOSTIC");
      });
    }
    await t.test("refuses omitted canonical leaf despite its disk twin", () => {
      assert.ok(existsSync(join(temporary, "stage/decimal/src/decimal-core.ts")));
      assert.throws(() => generator.compileScalarCompilerClosure(admitted, { ...inputs, decimalFiles: {} }), error => error.code === "COMPILER_PROJECT");
    });
    await t.test("refuses an owner package that no longer permits the deep import", () => {
      const packageJson = JSON.parse(inputs.decimalPackageBytes);
      assert.throws(() => generator.compileScalarCompilerClosure(admitted, {
        ...inputs, decimalPackageBytes: Buffer.from(JSON.stringify({ ...packageJson, exports: "./dist/index.js" })),
      }), error => error.code === "DECIMAL_PACKAGE_SUBPATH");
    });
    await t.test("reinstating all omitted bytes restores identical output and input identity", () => {
      const restored = generator.compileScalarCompilerClosure(admitted, inputs);
      assert.deepEqual(restored, built);
    });

    for (const [path, text] of Object.entries(built.outputFiles)) writeFixture(path, text);
    const locators = executableLocators(runtimeRoot, built.outputFiles);
    const executableDigest = generator.digestCompilerExecutableClosure(runtimeRoot, locators);
    await t.test("changed canonical source changes build and executable identity", () => {
      const path = join(temporary, "stage/decimal/src/decimal-core.ts");
      const before = inputs.decimalFiles[path].toString("utf8");
      assert.ok(before.includes("MAX_DECIMAL_SCALE = 100;"));
      const decimalFiles = { ...inputs.decimalFiles, [path]: Buffer.from(before.replace("MAX_DECIMAL_SCALE = 100;", "MAX_DECIMAL_SCALE = 99;")) };
      const changed = generator.compileScalarCompilerClosure(admitted, { ...inputs, decimalFiles });
      assert.notEqual(changed.inputDigest, built.inputDigest);
      assert.notEqual(changed.outputFiles[leafPath], built.outputFiles[leafPath]);
      writeFixture(leafPath, changed.outputFiles[leafPath]);
      assert.notEqual(generator.digestCompilerExecutableClosure(runtimeRoot, locators), executableDigest);
      assert.throws(() => generator.requireCompilerExecutableClosure(runtimeRoot, locators, executableDigest), error => error.code === "COMPILER_BUILD_DRIFT");
      writeFixture(leafPath, built.outputFiles[leafPath]);
      generator.requireCompilerExecutableClosure(runtimeRoot, locators, executableDigest);
    });

    await t.test("emitted scalar entry executes and every module is byte-traced by the production loader", () => {
      const runner = join(runtimeRoot, "scalar-closure-runner.mjs");
      const source = readFileSync(join(root, generator.SCALAR_ORACLE_SOURCE_RELATIVE), "utf8");
      // Fixture identities only: this is NOT a guarded HEAD candidate or fixed point.
      const identity = { sourceDigest: digest(source), compilerVersion: "1.0.0-beta.2", compilerPackageGraphDigest: digest("fixture-package"), checkerSetDigest: digest("fixture-checkers"), generatorSourceDigest: digest("fixture-generator") };
      const runnerSource = `
        import { buildRd0858ScalarArtifact, verifyRd0858ScalarArtifact } from "./core/rd0858-scalar-compiler-entry.js";
        import { decDiv } from "./core/decimal-arith.js";
        const source = ${JSON.stringify(source)}, identity = ${JSON.stringify(identity)};
        const result = buildRd0858ScalarArtifact(source,identity);
        const verified = verifyRd0858ScalarArtifact(source,result.bytes,identity);
        if (decDiv("1","2",1,"halfEven") !== "0.5") throw new Error("decimal leaf");
        console.log(JSON.stringify({flow:result.artifact.flowName,profile:result.artifact.runtimeProfile,verified}));
      `;
      writeFixture(runner, runnerSource);
      const all = { ...built.outputFiles, [runner]: runnerSource };
      const executableHashes = Object.fromEntries(Object.entries(all).filter(([path]) => /\.(?:js|mjs)$/.test(path)).map(([path,text]) => [pathToFileURL(path).href, digest(text)]));
      const trace = join(temporary, "trace.jsonl");
      const configPath = join(temporary, "loader.json");
      const config = JSON.stringify({ files: executableHashes, trace, builtinParents: generator.scalarCompilerBuiltinParents(runtimeRoot) });
      writeFixture(trace, "");
      writeFixture(configPath, config);
      const loader = generator.buildStrictLoaderInvocation(generator.STRICT_LOADER_SOURCE);
      const child = spawnSync(process.execPath, ["--experimental-loader", loader.url, runner], {
        cwd: temporary, env: { RD0858_LOADER_CONFIG: configPath, RD0858_LOADER_CONFIG_DIGEST: digest(config) },
        encoding: "utf8", timeout: 15_000, maxBuffer: 1_048_576,
      });
      assert.equal(child.status, 0, child.stderr);
      const result = JSON.parse(child.stdout);
      assert.equal(result.flow, "scalarOracle");
      assert.equal(result.profile, "scalar-1");
      assert.equal(result.verified.sourceDigest, identity.sourceDigest);
      const entries = readFileSync(trace,"utf8").trim().split("\n").map(line => JSON.parse(line));
      generator.validateConsumedModuleTrace(entries, executableHashes);
      assert.ok(entries.some(entry => entry.url === pathToFileURL(leafPath).href));
      assert.ok(!entries.some(entry => /core-runtime-wasm\/dist\/(?:index|wasm-runtime|seam-adapters)\.js$/.test(entry.url)));
      generator.requireCompilerExecutableClosure(runtimeRoot, locators, executableDigest);
      // Matching bytes do not give this parent crypto or substrate-intrinsic authority.
      for (const specifier of ["node:crypto", "node:util/types", "node:util"]) {
        writeFixture(runner, `import ${JSON.stringify(specifier)};\n`);
        const refusedConfig = JSON.parse(config);
        refusedConfig.files[pathToFileURL(runner).href] = digest(readFileSync(runner));
        const refusedBytes = JSON.stringify(refusedConfig);
        writeFixture(configPath, refusedBytes);
        const refused = spawnSync(process.execPath, ["--experimental-loader", loader.url, runner], {
          cwd: temporary, env: { RD0858_LOADER_CONFIG: configPath, RD0858_LOADER_CONFIG_DIGEST: digest(refusedBytes) },
          encoding: "utf8", timeout: 15_000, maxBuffer: 1_048_576,
        });
        assert.equal(refused.status, 1, refused.stderr);
        assert.match(refused.stderr, /COMPILER_MODULE_UNEXPECTED/);
      }
    });
  } finally {
    assert.equal(dirname(realpathSync(temporary)), realpathSync(tmpdir()));
    assert.ok(temporary.startsWith(join(tmpdir(), "rd0858-scalar-closure-")));
    rmSync(temporary, { recursive: true });
  }
});
