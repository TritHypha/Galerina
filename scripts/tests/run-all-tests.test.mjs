import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(TEST_DIR, "..", "run-all-tests.cjs");
const require = createRequire(import.meta.url);
const { acquireSuiteLease } = require("../lib/suite-run-lease.cjs");
const { admitFallbackPlatform } = require("../run-all-tests.cjs");
const roots = [];

after(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, relativePath, contents) {
  const absolutePath = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function workspaceFixture(packageName, packageJson, files = {}) {
  const root = mkdtempSync(join(tmpdir(), "galerina-run-all-"));
  roots.push(root);
  write(root, "galerina.workspace.json", JSON.stringify({
    packages: [`packages-ts/${packageName}`],
  }));
  write(root, "governance/tooling-policy.json", JSON.stringify({
    schemaVersion: 1,
    packageNoTest: {},
    toolExceptions: {},
    generators: {},
  }));
  write(
    root,
    `packages-ts/${packageName}/package.json`,
    JSON.stringify(packageJson),
  );
  for (const [relativePath, contents] of Object.entries(files)) {
    write(root, `packages-ts/${packageName}/${relativePath}`, contents);
  }
  return root;
}

function parallelWorkspaceFixture() {
  const root = mkdtempSync(join(tmpdir(), "galerina-run-all-parallel-"));
  roots.push(root);
  const packageNames = ["parallel-a", "parallel-b"];
  write(root, "galerina.workspace.json", JSON.stringify({
    packages: packageNames.map((name) => `packages-ts/${name}`),
  }));
  write(root, "governance/tooling-policy.json", JSON.stringify({
    schemaVersion: 1,
    packageNoTest: {},
    toolExceptions: {},
    generators: {},
  }));
  for (const packageName of packageNames) {
    const peerName = packageName === "parallel-a" ? "parallel-b" : "parallel-a";
    write(root, `packages-ts/${packageName}/package.json`, JSON.stringify({
      name: `@galerina/${packageName}`,
      scripts: { test: "node concurrent-proof.cjs" },
    }));
    write(root, `packages-ts/${packageName}/concurrent-proof.cjs`, [
      `const fs = require("node:fs");`,
      `const path = require("node:path");`,
      `const root = path.resolve(__dirname, "..", "..");`,
      `const own = path.join(root, "${packageName}.ready");`,
      `const peer = path.join(root, "${peerName}.ready");`,
      `fs.writeFileSync(own, "ready");`,
      `const deadline = Date.now() + 5000;`,
      `const waitCell = new Int32Array(new SharedArrayBuffer(4));`,
      `while (!fs.existsSync(peer) && Date.now() < deadline) Atomics.wait(waitCell, 0, 0, 25);`,
      `if (!fs.existsSync(peer)) process.exit(2);`,
      `console.log("tests 1\\npass 1\\nfail 0");`,
    ].join("\n") + "\n");
  }
  return root;
}

function compilerIsolationFixture() {
  const root = mkdtempSync(join(tmpdir(), "galerina-run-all-isolation-"));
  roots.push(root);
  write(root, "galerina.workspace.json", JSON.stringify({
    packages: [
      "packages-ts/galerina-core-compiler",
      "packages-ts/galerina-dependent",
    ],
  }));
  write(root, "governance/tooling-policy.json", JSON.stringify({
    schemaVersion: 1,
    packageNoTest: {},
    toolExceptions: {},
    generators: {},
  }));
  write(root, "packages-ts/galerina-core-compiler/package.json", JSON.stringify({
    name: "@galerina/core-compiler",
    scripts: { test: "node isolation-proof.cjs" },
  }));
  write(root, "packages-ts/galerina-core-compiler/isolation-proof.cjs", [
    `const fs = require("node:fs");`,
    `const path = require("node:path");`,
    `const root = path.resolve(__dirname, "..", "..");`,
    `const active = path.join(root, "compiler.active");`,
    `const done = path.join(root, "compiler.done");`,
    `const waitCell = new Int32Array(new SharedArrayBuffer(4));`,
    `fs.writeFileSync(active, "active");`,
    `Atomics.wait(waitCell, 0, 0, 500);`,
    `fs.rmSync(active);`,
    `fs.writeFileSync(done, "done");`,
    `console.log("tests 1\\npass 1\\nfail 0");`,
  ].join("\n") + "\n");
  write(root, "packages-ts/galerina-dependent/package.json", JSON.stringify({
    name: "@galerina/dependent",
    scripts: { test: "node isolation-proof.cjs" },
  }));
  write(root, "packages-ts/galerina-dependent/isolation-proof.cjs", [
    `const fs = require("node:fs");`,
    `const path = require("node:path");`,
    `const root = path.resolve(__dirname, "..", "..");`,
    `const active = path.join(root, "compiler.active");`,
    `const done = path.join(root, "compiler.done");`,
    `const deadline = Date.now() + 3000;`,
    `const waitCell = new Int32Array(new SharedArrayBuffer(4));`,
    `while (!fs.existsSync(active) && !fs.existsSync(done) && Date.now() < deadline) Atomics.wait(waitCell, 0, 0, 25);`,
    `if (fs.existsSync(active) || !fs.existsSync(done)) process.exit(2);`,
    `console.log("tests 1\\npass 1\\nfail 0");`,
  ].join("\n") + "\n");
  return root;
}

function run(root, ...args) {
  return spawnSync(
    process.execPath,
    [RUNNER, "--root", root, ...args],
    { encoding: "utf8", timeout: 30_000 },
  );
}

function packageTreeDigest(directory) {
  const hash = createHash("sha256");
  const visit = (current, prefix) => {
    const entries = readdirSync(current, { withFileTypes: true })
      .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        hash.update(`D\0${relative}\0`);
        visit(absolute, relative);
      } else if (entry.isFile()) {
        const bytes = readFileSync(absolute);
        hash.update(`F\0${relative}\0${bytes.length}\0`);
        hash.update(bytes);
      } else {
        throw new Error(`unsupported fixture package entry: ${relative}`);
      }
    }
  };
  visit(directory, "");
  return `sha256:${hash.digest("hex")}`;
}

function writeTypeScriptIntegrity(root) {
  const directory = join(
    root,
    "packages-ts",
    "galerina-core-compiler",
    "node_modules",
    "typescript",
  );
  write(root, "scripts/toolchain-integrity.json", JSON.stringify({
    schema: "galerina-toolchain-integrity.v1",
    packages: [{
      name: "typescript",
      version: "5.9.3",
      treeDigest: packageTreeDigest(directory),
    }],
  }));
}

function runWithEnvironment(root, environment, ...args) {
  return spawnSync(
    process.execPath,
    [RUNNER, "--root", root, ...args],
    { encoding: "utf8", timeout: 30_000, env: environment },
  );
}

function typescriptFallbackFixture({ lockVersion = "5.9.3" } = {}) {
  const root = workspaceFixture("needs-tsc", {
    name: "@galerina/needs-tsc",
    scripts: {
      typecheck: "tsc --noEmit",
      test: "npm run typecheck && node --test tests/current.test.mjs",
    },
    devDependencies: { typescript: "^5.5.0" },
  }, {
    "tests/current.test.mjs":
      "import test from 'node:test'; test('current', () => {});\n",
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { devDependencies: { typescript: "^5.5.0" } },
        "node_modules/typescript": { version: lockVersion },
      },
    }),
  });
  write(root, "galerina.workspace.json", JSON.stringify({
    packages: [
      "packages-ts/galerina-core-compiler",
      "packages-ts/needs-tsc",
    ],
  }));
  write(root, "packages-ts/galerina-core-compiler/package.json", JSON.stringify({
    name: "@galerina/core-compiler",
    scripts: { test: "node compiler-pass.cjs" },
    devDependencies: { typescript: "^5.5.0" },
  }));
  write(
    root,
    "packages-ts/galerina-core-compiler/compiler-pass.cjs",
    "console.log('tests 1\\npass 1\\nfail 0');\n",
  );
  write(root, "packages-ts/galerina-core-compiler/package-lock.json", JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { devDependencies: { typescript: "^5.5.0" } },
      "node_modules/typescript": { version: "5.9.3" },
    },
  }));
  write(root, "packages-ts/galerina-core-compiler/node_modules/typescript/package.json", JSON.stringify({
    name: "typescript",
    version: "5.9.3",
  }));
  write(root, "packages-ts/galerina-core-compiler/node_modules/typescript/bin/tsc", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "fs.writeFileSync(path.join(process.cwd(), 'canonical-tsc.txt'), 'used');",
  ].join("\n") + "\n");
  writeTypeScriptIntegrity(root);
  return root;
}

function crossPackageTypeScriptMutationFixture() {
  const root = typescriptFallbackFixture();
  write(
    root,
    "packages-ts/galerina-core-compiler/compiler-pass.cjs",
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';",
      "const shim = pathValue.split(path.delimiter).find((entry) => path.basename(entry).startsWith('galerina-tsc-'));",
      "if (shim) {",
      "  fs.writeFileSync(path.join(__dirname, 'shim-disclosed.txt'), shim);",
      "  fs.writeFileSync(path.join(shim, 'typescript', 'bin', 'tsc'), [",
      "    \"const fs = require('node:fs');\",",
      "    \"const path = require('node:path');\",",
      "    \"fs.writeFileSync(path.join(process.cwd(), 'hijacked-tsc.txt'), 'executed');\",",
      "  ].join('\\n') + '\\n');",
      "}",
      "console.log('tests 1\\npass 1\\nfail 0');",
    ].join("\n") + "\n",
  );
  return root;
}

function canonicalTypeScriptMutationFixture() {
  const root = typescriptFallbackFixture();
  write(
    root,
    "packages-ts/galerina-core-compiler/compiler-pass.cjs",
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const root = path.resolve(__dirname, '..', '..');",
      "const compiler = path.join(root, 'packages-ts', 'galerina-core-compiler', 'node_modules', 'typescript', 'bin', 'tsc');",
      "fs.writeFileSync(compiler, [",
      "  \"const fs = require('node:fs');\",",
      "  \"const path = require('node:path');\",",
      "  \"fs.writeFileSync(path.join(process.cwd(), 'canonical-source-hijacked.txt'), 'executed');\",",
      "].join('\\n') + '\\n');",
      "console.log('tests 1\\npass 1\\nfail 0');",
    ].join("\n") + "\n",
  );
  return root;
}

function selfMutatingTypeScriptFixture() {
  const root = typescriptFallbackFixture();
  write(
    root,
    "packages-ts/galerina-core-compiler/node_modules/typescript/bin/tsc",
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "fs.writeFileSync(path.join(process.cwd(), 'self-mutating-tsc.txt'), 'executed');",
      "fs.appendFileSync(__filename, '\\n// changed during execution\\n');",
    ].join("\n") + "\n",
  );
  writeTypeScriptIntegrity(root);
  return root;
}

function transientTypeScriptSubstitutionFixture() {
  const root = typescriptFallbackFixture();
  write(root, "packages-ts/needs-tsc/package.json", JSON.stringify({
    name: "@galerina/needs-tsc",
    scripts: {
      pretypecheck: "node transient-pre.cjs",
      typecheck: "tsc --noEmit",
      posttypecheck: "node transient-post.cjs",
      test: "npm run typecheck && node --test tests/current.test.mjs",
    },
    devDependencies: { typescript: "^5.5.0" },
  }));
  write(root, "packages-ts/needs-tsc/transient-pre.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';",
    "const shim = pathValue.split(path.delimiter).find((entry) => path.basename(entry).startsWith('galerina-tsc-'));",
    "if (!shim) process.exit(2);",
    "const compiler = path.join(shim, 'typescript', 'bin', 'tsc');",
    "const backup = path.join(__dirname, 'authenticated-tsc.backup');",
    "fs.writeFileSync(backup, fs.readFileSync(compiler));",
    "try {",
    "  fs.writeFileSync(compiler, [",
    "    \"const fs = require('node:fs');\",",
    "    \"const path = require('node:path');\",",
    "    \"fs.writeFileSync(path.join(process.cwd(), 'transient-hijack.txt'), 'executed');\",",
    "  ].join('\\n') + '\\n');",
    "} catch (error) {",
    "  fs.writeFileSync(path.join(__dirname, 'transient-write-refused.txt'), error.code || 'refused');",
    "}",
  ].join("\n") + "\n");
  write(root, "packages-ts/needs-tsc/transient-post.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';",
    "const shim = pathValue.split(path.delimiter).find((entry) => path.basename(entry).startsWith('galerina-tsc-'));",
    "const compiler = path.join(shim, 'typescript', 'bin', 'tsc');",
    "try { fs.writeFileSync(compiler, fs.readFileSync(path.join(__dirname, 'authenticated-tsc.backup'))); } catch {}",
    "fs.rmSync(path.join(__dirname, 'authenticated-tsc.backup'), { force: true });",
  ].join("\n") + "\n");
  return root;
}

function shadowTypeScriptSubstitutionFixture() {
  const root = typescriptFallbackFixture();
  write(root, "packages-ts/needs-tsc/package.json", JSON.stringify({
    name: "@galerina/needs-tsc",
    scripts: {
      pretypecheck: "node shadow-pre.cjs",
      typecheck: "tsc --noEmit",
      posttypecheck: "node shadow-post.cjs",
      test: "npm run typecheck && node --test tests/current.test.mjs",
    },
    devDependencies: { typescript: "^5.5.0" },
  }));
  write(root, "packages-ts/needs-tsc/shadow-pre.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';",
    "const shim = pathValue.split(path.delimiter).find((entry) => path.basename(entry).startsWith('galerina-tsc-'));",
    "if (!shim) process.exit(2);",
    "const shadow = path.join(shim, 'tsc.bat');",
    "try {",
    "  fs.writeFileSync(shadow, [",
    "    '@echo off',",
    "    `\"${process.execPath}\" -e \"require('node:fs').writeFileSync('shadow-hijack.txt','executed')\"`,",
    "  ].join('\\r\\n') + '\\r\\n');",
    "} catch (error) {",
    "  fs.writeFileSync(path.join(__dirname, 'shadow-write-refused.txt'), error.code || 'refused');",
    "}",
  ].join("\n") + "\n");
  write(root, "packages-ts/needs-tsc/shadow-post.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';",
    "const shim = pathValue.split(path.delimiter).find((entry) => path.basename(entry).startsWith('galerina-tsc-'));",
    "try { fs.rmSync(path.join(shim, 'tsc.bat'), { force: true }); } catch {}",
  ].join("\n") + "\n");
  return root;
}

function customPathExtTypeScriptSubstitutionFixture() {
  const root = typescriptFallbackFixture();
  write(root, "packages-ts/needs-tsc/package.json", JSON.stringify({
    name: "@galerina/needs-tsc",
    scripts: {
      pretypecheck: "node custom-pathext-pre.cjs",
      typecheck: "set PATHEXT=.XYZ;.COM;.EXE;.BAT;.CMD&&tsc --noEmit",
      posttypecheck: "node custom-pathext-post.cjs",
      test: "npm run typecheck && node --test tests/current.test.mjs",
    },
    devDependencies: { typescript: "^5.5.0" },
  }));
  write(root, "packages-ts/needs-tsc/hostile-tsc.rs", [
    "use std::{env, fs};",
    "fn main() {",
    "    fs::write(",
    "        env::current_dir().expect(\"cwd\").join(\"custom-pathext-hijack.txt\"),",
    "        b\"executed\",",
    "    ).expect(\"marker\");",
    "}",
  ].join("\n") + "\n");
  const hostileCompiler = spawnSync(
    "rustc",
    [
      "--edition=2021",
      "-D",
      "warnings",
      "-o",
      join(root, "packages-ts", "needs-tsc", "hostile-tsc.exe"),
      join(root, "packages-ts", "needs-tsc", "hostile-tsc.rs"),
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(
    hostileCompiler.status,
    0,
    hostileCompiler.stderr || hostileCompiler.stdout || "rustc failed",
  );
  write(root, "packages-ts/needs-tsc/custom-pathext-pre.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';",
    "const shim = pathValue.split(path.delimiter).find((entry) => path.basename(entry).startsWith('galerina-tsc-'));",
    "if (!shim) process.exit(2);",
    "fs.copyFileSync(path.join(__dirname, 'hostile-tsc.exe'), path.join(shim, 'tsc.xyz'), fs.constants.COPYFILE_EXCL);",
  ].join("\n") + "\n");
  write(root, "packages-ts/needs-tsc/custom-pathext-post.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';",
    "const shim = pathValue.split(path.delimiter).find((entry) => path.basename(entry).startsWith('galerina-tsc-'));",
    "if (shim) fs.rmSync(path.join(shim, 'tsc.xyz'), { force: true });",
  ].join("\n") + "\n");
  return root;
}

function localBinTypeScriptSubstitutionFixture() {
  const root = typescriptFallbackFixture();
  write(root, "packages-ts/needs-tsc/node_modules/.bin/local-hijack.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "fs.writeFileSync(path.join(process.cwd(), 'npm-local-hijack.txt'), 'executed');",
  ].join("\n") + "\n");
  write(
    root,
    "packages-ts/needs-tsc/node_modules/.bin/tsc.cmd",
    `@echo off\r\n"${process.execPath}" "%~dp0local-hijack.cjs" %*\r\n`,
  );
  return root;
}

function fallbackCountIsolationFixture() {
  const root = typescriptFallbackFixture();
  const manifestPath = join(root, "packages-ts", "needs-tsc", "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.scripts.pretest = "node fake-counts.cjs";
  write(root, "packages-ts/needs-tsc/package.json", JSON.stringify(manifest));
  write(
    root,
    "packages-ts/needs-tsc/fake-counts.cjs",
    "console.log('tests 99\\npass 99\\nfail 0');\n",
  );
  return root;
}

function fallbackNodeTestCountForgeryFixture() {
  const root = typescriptFallbackFixture();
  write(root, "packages-ts/needs-tsc/tests/current.test.mjs", [
    "console.log('tests 999\\npass 999\\nfail 0');",
    "import test from 'node:test';",
    "test('current', () => {});",
  ].join("\n") + "\n");
  return root;
}

function fallbackNestedSuiteFixture() {
  const root = typescriptFallbackFixture();
  write(root, "packages-ts/needs-tsc/tests/current.test.mjs", [
    "import { describe, it } from 'node:test';",
    "describe('group', () => {",
    "  it('nested current', () => {});",
    "});",
  ].join("\n") + "\n");
  return root;
}

function fallbackConcurrencyOverrideFixture() {
  const root = typescriptFallbackFixture();
  write(root, "packages-ts/needs-tsc/package.json", JSON.stringify({
    name: "@galerina/needs-tsc",
    scripts: {
      typecheck: "tsc --noEmit",
      test: "npm run typecheck && node --test --test-concurrency=0 tests/concurrent-a.test.mjs tests/concurrent-b.test.mjs",
    },
    devDependencies: { typescript: "^5.5.0" },
  }));
  for (const side of ["a", "b"]) {
    const peer = side === "a" ? "b" : "a";
    write(root, `packages-ts/needs-tsc/tests/concurrent-${side}.test.mjs`, [
      "import test from 'node:test';",
      "import { existsSync, writeFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      "test('requires governed serial execution', () => {",
      `  const own = join(process.cwd(), 'concurrent-${side}.ready');`,
      `  const peer = join(process.cwd(), 'concurrent-${peer}.ready');`,
      "  writeFileSync(own, 'ready');",
      "  const waitCell = new Int32Array(new SharedArrayBuffer(4));",
      "  const deadline = Date.now() + 1000;",
      "  while (!existsSync(peer) && Date.now() < deadline) Atomics.wait(waitCell, 0, 0, 20);",
      "  if (!existsSync(peer)) throw new Error('test files did not overlap');",
      "});",
    ].join("\n") + "\n");
  }
  return root;
}

function hostilePath(root) {
  const directory = join(root, "hostile-bin");
  const script = join(directory, "hostile-tsc.cjs");
  write(root, "hostile-bin/hostile-tsc.cjs", [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "fs.writeFileSync(path.join(process.cwd(), 'hostile-tsc.txt'), 'used');",
    "process.exit(41);",
  ].join("\n") + "\n");
  write(
    root,
    "hostile-bin/tsc.cmd",
    `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`,
  );
  write(
    root,
    "hostile-bin/tsc",
    `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
  );
  chmodSync(join(directory, "tsc"), 0o755);
  return directory;
}

function environmentWithPathPrefix(prefix) {
  const environment = { ...process.env };
  const currentPath = Object.entries(environment)
    .find(([key]) => key.toLowerCase() === "path")?.[1] || "";
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === "path") delete environment[key];
  }
  environment.PATH = `${prefix}${delimiter}${currentPath}`;
  return environment;
}

test("full discovery includes every registered package with a test script", () => {
  const root = workspaceFixture("custom", {
    name: "@galerina/custom",
    scripts: { test: "node scripts/run-tests.mjs" },
  }, {
    "scripts/run-tests.mjs":
      "console.log('tests 1\\npass 1\\nfail 0');\n",
  });

  const result = run(root, "--list");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /custom/);
  assert.match(result.stdout, /Test-bearing packages \(1\)/);
});

test("an existing dist directory never bypasses the declared test and build chain", () => {
  const root = workspaceFixture("build-current", {
    name: "@galerina/build-current",
    scripts: {
      test: "node build.mjs && node --test tests/current.test.mjs",
    },
  }, {
    "build.mjs":
      "import { writeFileSync } from 'node:fs'; writeFileSync('dist/marker.txt', 'fresh');\n",
    "dist/marker.txt": "stale",
    "tests/current.test.mjs":
      "import test from 'node:test'; test('current build', () => {});\n",
  });

  const result = run(root, "--json");

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    readFileSync(
      join(root, "packages-ts", "build-current", "dist", "marker.txt"),
      "utf8",
    ),
    "fresh",
  );
  const report = JSON.parse(result.stdout);
  assert.equal(typeof report.durationMs, "number");
  assert.ok(report.durationMs >= 0);
  assert.deepEqual(report.controls, {
    testConcurrency: 2,
    packageConcurrency: 2,
    processIsolation: "process",
  });
  assert.match(result.stderr, /START galerina-build-current.*test-file ceiling 2/);
  assert.match(result.stderr, /END galerina-build-current.*pass/);
  assert.equal(report.results[0].built, true);
  assert.equal(report.results[0].tests, 1);
  assert.deepEqual(report.results[0].processControl, {
    ownedTree: true,
    cleanupAttempted: false,
  });
});

test("a validated canonical TypeScript fallback outranks a hostile ambient launcher", () => {
  const root = typescriptFallbackFixture();
  const result = runWithEnvironment(
    root,
    environmentWithPathPrefix(hostilePath(root)),
    "--json",
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    true,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "hostile-tsc.txt")),
    false,
  );
  assert.deepEqual(JSON.parse(result.stdout).controls.typescriptFallback, {
    used: true,
    version: "5.9.3",
    treeDigest: JSON.parse(readFileSync(
      join(root, "scripts", "toolchain-integrity.json"),
      "utf8",
    )).packages[0].treeDigest,
    packages: ["galerina-needs-tsc"],
  });
});

test("a byte-substituted canonical TypeScript fallback refuses before execution", () => {
  const root = typescriptFallbackFixture();
  write(
    root,
    "packages-ts/galerina-core-compiler/node_modules/typescript/bin/tsc",
    "require('node:fs').writeFileSync('substituted-tsc.txt', 'used');\n",
  );

  const result = runWithEnvironment(
    root,
    environmentWithPathPrefix(hostilePath(root)),
    "--json",
  );

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.violations[0].code, "TEST-TOOLCHAIN-REFUSED");
  assert.deepEqual(report.results, []);
  assert.equal(existsSync(join(root, "packages-ts", "needs-tsc", "substituted-tsc.txt")), false);
  assert.equal(existsSync(join(root, "packages-ts", "needs-tsc", "hostile-tsc.txt")), false);
});

test("an earlier package cannot replace the authenticated fallback used by a later package", () => {
  const root = crossPackageTypeScriptMutationFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(
    existsSync(join(root, "packages-ts", "galerina-core-compiler", "shim-disclosed.txt")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "hijacked-tsc.txt")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    true,
  );
});

test("canonical fallback drift between packages refuses before the changed compiler executes", () => {
  const root = canonicalTypeScriptMutationFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const dependent = report.results.find((item) => item.package === "galerina-needs-tsc");
  assert.equal(dependent.failureCode, "TEST-TOOLCHAIN-REFUSED");
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-source-hijacked.txt")),
    false,
  );
});

test("private fallback mutation is blocked and converts an apparent pass into failure", () => {
  const root = selfMutatingTypeScriptFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const dependent = report.results.find((item) => item.package === "galerina-needs-tsc");
  assert.equal(dependent.failureCode, "TEST-CHILD-FAILED");
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "self-mutating-tsc.txt")),
    true,
  );
});

test("transient replace-execute-restore cannot substitute the protected fallback compiler", () => {
  const root = transientTypeScriptSubstitutionFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(
    report.results.find((item) => item.package === "galerina-needs-tsc")?.failureCode,
    "TEST-CHILD-FAILED",
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "transient-hijack.txt")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    false,
  );
});

test("a transient higher-priority launcher cannot shadow the protected fallback compiler", () => {
  const root = shadowTypeScriptSubstitutionFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(
    report.results.find((item) => item.package === "galerina-needs-tsc")?.failureCode,
    "TEST-CHILD-FAILED",
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "shadow-hijack.txt")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    false,
  );
});

test("a caller PATHEXT cannot add an unprotected fallback compiler alias", () => {
  const root = typescriptFallbackFixture();
  const result = runWithEnvironment(
    root,
    { ...process.env, PATHEXT: ".XYZ;.COM;.EXE;.BAT;.CMD" },
    "--json",
    "--package-concurrency",
    "1",
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    true,
  );
});

test("a package script cannot replace the admitted fallback command grammar", () => {
  const root = customPathExtTypeScriptSubstitutionFixture();
  const result = runWithEnvironment(
    root,
    { ...process.env, PATHEXT: ".XYZ;.COM;.EXE;.BAT;.CMD" },
    "--json",
    "--package-concurrency",
    "1",
  );

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(
    report.results.find((item) => item.package === "galerina-needs-tsc")?.failureCode
      ?? report.violations?.[0]?.code,
    "TEST-TOOLCHAIN-REFUSED",
    result.stdout,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "custom-pathext-hijack.txt")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    false,
  );
});

test("a package-local npm bin cannot outrank the authenticated fallback compiler", () => {
  const root = localBinTypeScriptSubstitutionFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "npm-local-hijack.txt")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    true,
  );
});

test("fallback lifecycle output cannot forge the node:test counters", () => {
  const root = fallbackCountIsolationFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const dependent = JSON.parse(result.stdout).results
    .find((item) => item.package === "galerina-needs-tsc");
  assert.equal(dependent.tests, 1);
  assert.equal(dependent.pass, 1);
  assert.equal(dependent.fail, 0);
});

test("fallback node:test output cannot forge the structured test counters", () => {
  const root = fallbackNodeTestCountForgeryFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const dependent = JSON.parse(result.stdout).results
    .find((item) => item.package === "galerina-needs-tsc");
  assert.equal(dependent.tests, 1);
  assert.equal(dependent.pass, 1);
  assert.equal(dependent.fail, 0);
});

test("fallback structured counters admit a valid nested node:test suite", () => {
  const root = fallbackNestedSuiteFixture();
  const result = run(root, "--json", "--package-concurrency", "1");

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const dependent = JSON.parse(result.stdout).results
    .find((item) => item.package === "galerina-needs-tsc");
  assert.equal(dependent.tests, 1);
  assert.equal(dependent.pass, 1);
  assert.equal(dependent.fail, 0);
});

test("a fallback manifest cannot raise the governed test concurrency", () => {
  const root = fallbackConcurrencyOverrideFixture();
  const result = run(
    root,
    "--json",
    "--package-concurrency",
    "1",
    "--test-concurrency",
    "1",
  );

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const dependent = JSON.parse(result.stdout).results
    .find((item) => item.package === "galerina-needs-tsc");
  assert.equal(dependent.failureCode, "TEST-TOOLCHAIN-REFUSED");
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "concurrent-a.ready")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "concurrent-b.ready")),
    false,
  );
});

test("a non-Windows fallback platform refuses before lifecycle admission", () => {
  assert.throws(
    () => admitFallbackPlatform("linux"),
    (error) => error?.code === "TEST-TOOLCHAIN-REFUSED"
      && /before any lifecycle step/u.test(error.message),
  );
  assert.equal(admitFallbackPlatform("win32"), true);
});

test("a mismatched canonical TypeScript fallback refuses before package execution", () => {
  const root = typescriptFallbackFixture({ lockVersion: "5.9.2" });
  const result = runWithEnvironment(
    root,
    environmentWithPathPrefix(hostilePath(root)),
    "--json",
  );

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.violations[0].code, "TEST-TOOLCHAIN-REFUSED");
  assert.deepEqual(report.results, []);
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "canonical-tsc.txt")),
    false,
  );
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "hostile-tsc.txt")),
    false,
  );
});

test("a missing canonical TypeScript fallback refuses before package execution", () => {
  const root = typescriptFallbackFixture();
  rmSync(
    join(root, "packages-ts", "galerina-core-compiler", "node_modules", "typescript"),
    { recursive: true, force: true },
  );
  const result = runWithEnvironment(
    root,
    environmentWithPathPrefix(hostilePath(root)),
    "--json",
  );

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.violations[0].code, "TEST-TOOLCHAIN-REFUSED");
  assert.deepEqual(report.results, []);
  assert.equal(
    existsSync(join(root, "packages-ts", "needs-tsc", "hostile-tsc.txt")),
    false,
  );
});

test("a caller may lower but never raise the test concurrency ceiling", () => {
  const root = workspaceFixture("bounded", {
    name: "@galerina/bounded",
    scripts: { test: "node --test tests/bounded.test.mjs" },
  }, {
    "tests/bounded.test.mjs":
      "import test from 'node:test'; test('bounded', () => {});\n",
  });

  const lowered = run(root, "--json", "--test-concurrency", "2");
  assert.equal(lowered.status, 0, lowered.stderr || lowered.stdout);
  assert.equal(JSON.parse(lowered.stdout).controls.testConcurrency, 2);

  const raised = run(root, "--json", "--test-concurrency", "5");
  assert.equal(raised.status, 3);
  assert.match(raised.stderr, /TEST-CONCURRENCY-INVALID|one through four/i);
});

test("package concurrency is bounded and overlaps independent package tests", () => {
  const root = parallelWorkspaceFixture();

  const result = run(
    root,
    "--json",
    "--package-concurrency",
    "2",
    "--test-concurrency",
    "1",
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.controls.packageConcurrency, 2);
  assert.equal(report.controls.testConcurrency, 1);
  assert.equal(report.totals.passed, 2);
  assert.deepEqual(
    report.results.map((item) => item.package),
    ["galerina-parallel-a", "galerina-parallel-b"],
    "completion order must not change report order",
  );

  const refused = run(root, "--json", "--package-concurrency", "3");
  assert.equal(refused.status, 3);
  assert.match(refused.stderr, /PACKAGE-CONCURRENCY-INVALID|one or two/i);
});

test("compiler build authority is isolated before dependent package tests", () => {
  const root = compilerIsolationFixture();

  const result = run(root, "--json", "--package-concurrency", "2");

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.totals.passed, 2);
  assert.deepEqual(
    report.results.map((item) => item.package),
    ["galerina-core-compiler", "galerina-dependent"],
  );
});

test("a zero exit with no parseable non-zero test summary is refused", () => {
  const root = workspaceFixture("silent", {
    name: "@galerina/silent",
    scripts: { test: "node silent-pass.mjs" },
  }, {
    "silent-pass.mjs": "process.exit(0);\n",
  });

  const result = run(root, "--json");

  assert.equal(result.status, 1);
  assert.equal(existsSync(join(root, "version.json")), false);
  const report = JSON.parse(result.stdout);
  assert.equal(report.results[0].status, "fail");
  assert.equal(report.results[0].failureCode, "TEST-SUMMARY-UNPARSEABLE");
});

test("a zero-test summary is refused rather than treated as an empty pass", () => {
  const root = workspaceFixture("empty", {
    name: "@galerina/empty",
    scripts: { test: "node empty-pass.mjs" },
  }, {
    "empty-pass.mjs":
      "console.log('tests 0\\npass 0\\nfail 0');\n",
  });

  const result = run(root, "--json");

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.results[0].failureCode, "TEST-SUMMARY-EMPTY");
});

test("a failed package retains bounded, digest-bound diagnostic evidence", () => {
  const root = workspaceFixture("diagnostic-failure", {
    name: "@galerina/diagnostic-failure",
    scripts: { test: "node diagnostic-failure.mjs" },
  }, {
    "diagnostic-failure.mjs": [
      "console.log('tests 1\\npass 0\\nfail 1');",
      "console.error('not ok 1 - planted package failure');",
      "console.error('Error: exact planted diagnostic');",
      "process.exit(7);",
    ].join("\n") + "\n",
  });

  const result = run(root, "--json");

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const evidence = report.results[0].failureEvidence;
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.exitCode, 7);
  assert.match(evidence.outputSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(evidence.diagnosticLines, [
    "fail 1",
    "not ok 1 - planted package failure",
    "Error: exact planted diagnostic",
  ]);
  assert.equal(Object.hasOwn(evidence, "rawOutput"), false);
});

test("--emit-counts replaces stale package-count narrative with derived scope", () => {
  const root = workspaceFixture("counted", {
    name: "@galerina/counted",
    scripts: { test: "node counted.mjs" },
  }, {
    "counted.mjs": "console.log('tests 1\\npass 1\\nfail 0');\n",
  });
  write(root, "version.json", JSON.stringify({
    testCount: 99,
    packageCount: 53,
    packageCountNote: "All 53 workspace packages are test-bearing.",
    testCountByPackage: {},
  }));

  const result = run(root, "--emit-counts", "--json");

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const version = JSON.parse(readFileSync(join(root, "version.json"), "utf8"));
  assert.equal(version.packageCount, 1);
  assert.equal(
    version.packageCountNote,
    "Derived from the complete governed package inventory: 1/1 test-bearing packages passed their declared build-current test chains; see testCountByPackage.",
  );
});

test("a held checkout lease refuses before a package child starts", () => {
  const root = workspaceFixture("must-not-run", {
    name: "@galerina/must-not-run",
    scripts: { test: "node must-not-run.mjs" },
  }, {
    "must-not-run.mjs":
      "import { writeFileSync } from 'node:fs'; writeFileSync('ran.txt', 'bad'); console.log('tests 1\\npass 1\\nfail 0');\n",
  });
  const lease = acquireSuiteLease({ root, commandClass: "phase-close" });

  const result = run(root, "--json");

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.violations[0].code, "SUITE-LEASE-HELD");
  assert.equal(
    existsSync(join(root, "packages-ts", "must-not-run", "ran.txt")),
    false,
  );
  assert.equal(lease.release(), true);
});

test("Git repository overrides refuse before any package child starts", () => {
  const root = workspaceFixture("must-not-run", {
    name: "@galerina/must-not-run",
    scripts: { test: "node --test tests/must-not-run.test.mjs" },
  }, {
    "tests/must-not-run.test.mjs": [
      "import { test } from 'node:test';",
      "import { writeFileSync } from 'node:fs';",
      "test('package test started', () => writeFileSync('ran.txt', 'started'));",
    ].join("\n") + "\n",
  });
  const keys = ["GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"];
  const poisoned = [
    ["GIT_COMMON_DIR", join(root, "poison-git-common-dir")],
    ["git_dir", join(root, "poison-git-dir")],
    ["GIT_INDEX_FILE", ""],
    ["GIT_WORK_TREE", join(root, "poison-git-work-tree")],
  ];

  for (const [key, value] of poisoned) {
    const environment = { ...process.env };
    for (const inheritedKey of Object.keys(environment)) {
      if (keys.includes(inheritedKey.toUpperCase())) delete environment[inheritedKey];
    }
    delete environment.NODE_TEST_CONTEXT;
    environment[key] = value;
    const result = runWithEnvironment(root, environment, "--json");

    assert.equal(result.status, 3, `${key}: ${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /TEST-GIT-ENVIRONMENT-REFUSED/u);
    assert.equal(existsSync(join(root, "packages-ts", "must-not-run", "ran.txt")), false);
  }

  const positiveEnvironment = { ...process.env, GIT_PAGER: "cat" };
  for (const inheritedKey of Object.keys(positiveEnvironment)) {
    if (keys.includes(inheritedKey.toUpperCase())) delete positiveEnvironment[inheritedKey];
  }
  delete positiveEnvironment.NODE_TEST_CONTEXT;
  const positive = spawnSync(
    process.execPath,
    ["--test", join(root, "packages-ts", "must-not-run", "tests", "must-not-run.test.mjs")],
    {
      cwd: join(root, "packages-ts", "must-not-run"),
      encoding: "utf8",
      env: positiveEnvironment,
      timeout: 15_000,
      windowsHide: true,
    },
  );
  assert.equal(positive.status, 0, positive.stderr || positive.stdout);
  assert.equal(existsSync(join(root, "packages-ts", "must-not-run", "ran.txt")), true);
});
