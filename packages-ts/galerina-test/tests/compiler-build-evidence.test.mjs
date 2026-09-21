import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  COMPILER_BUILD_EVIDENCE_SCHEMA,
  createBuildEvidence,
  verifyBuildEvidence,
  writeBuildEvidence,
} from "../../galerina-core-compiler/scripts/write-build-evidence.mjs";

function write(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function fixture(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "compiler-evidence-"));
  const compiler = "packages-ts/galerina-core-compiler";
  write(root, `${compiler}/src/index.ts`, extra.src ?? "export const value = 1;\n");
  write(root, `${compiler}/tests/index.test.mjs`, "export {};\n");
  write(root, `${compiler}/tsconfig.json`, JSON.stringify({
    compilerOptions: { outDir: "dist", rootDir: "src" },
    include: ["src/**/*.ts"],
  }, null, 2) + "\n");
  write(root, `${compiler}/package.json`, JSON.stringify({
    devDependencies: { typescript: "^5.5.0" },
  }, null, 2) + "\n");
  write(root, `${compiler}/dist/index.js`, extra.distIndex ?? "export {};\n");
  write(root, `${compiler}/dist/governance-mode.js`, extra.distGovernance ?? "export const mode = 1;\n");
  const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const add = spawnSync("git", ["add", "--", `${compiler}/src`, `${compiler}/tests`], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(add.status, 0, add.stderr);
  return { root, compiler };
}

function oldNulFrame(entries) {
  const hash = createHash("sha256");
  for (const [path, bytes] of entries) {
    hash.update(path);
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

test("compiler build evidence is deterministic and content-sensitive", () => {
  const { root, compiler } = fixture();
  try {
    const first = createBuildEvidence(root, compiler);
    const second = createBuildEvidence(root, compiler);
    assert.deepEqual(second, first);
    assert.equal(first.schema, COMPILER_BUILD_EVIDENCE_SCHEMA);
    assert.deepEqual(Object.keys(first), [
      "schema",
      "algorithm",
      "package",
      "inputs",
      "config",
      "toolchain",
      "outputs",
      "inputDigest",
      "outputDigest",
    ]);

    write(root, `${compiler}/src/index.ts`, "export const value = 2;\n");
    const changed = createBuildEvidence(root, compiler);
    assert.notEqual(changed.inputDigest, first.inputDigest);
    assert.equal(changed.inputs.length, first.inputs.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compiler build evidence refuses untracked source inputs", () => {
  const { root, compiler } = fixture();
  try {
    write(root, `${compiler}/src/hidden.ts`, "export const hidden = true;\n");
    assert.throws(
      () => createBuildEvidence(root, compiler),
      /untracked inputs.*hidden\.ts/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compiler build evidence refuses gitignored compile-affecting source", () => {
  const { root, compiler } = fixture();
  try {
    write(root, `${compiler}/.gitignore`, "hidden.ts\n");
    write(root, `${compiler}/src/hidden.ts`, "export const hidden = true;\n");
    assert.throws(
      () => createBuildEvidence(root, compiler),
      /compile-affecting source absent from tracked inputs.*hidden\.ts/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compiler build evidence writer persists exactly the computed evidence", () => {
  const { root, compiler } = fixture();
  try {
    const output = join(root, compiler, "dist", "build-evidence.json");
    const expected = createBuildEvidence(root, compiler);
    writeBuildEvidence(root, compiler, output);
    const raw = readFileSync(output, "utf8");
    assert.deepEqual(JSON.parse(raw), expected);
    assert.equal(verifyBuildEvidence(root, compiler, raw).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("length-prefixed framing distinguishes the old NUL collision pair", () => {
  const pathP = "packages-ts/galerina-core-compiler/src/p.ts";
  const pathQ = "packages-ts/galerina-core-compiler/src/q.ts";
  const x = Buffer.from("x");
  const y = Buffer.from("y");
  const z = Buffer.from("z");
  const nul = Buffer.from([0]);
  const firstP = Buffer.concat([x, nul, Buffer.from(pathQ), nul, y]);
  const firstQ = z;
  const secondP = x;
  const secondQ = Buffer.concat([y, nul, Buffer.from(pathQ), nul, z]);
  assert.equal(
    oldNulFrame([[pathP, firstP], [pathQ, firstQ]]),
    oldNulFrame([[pathP, secondP], [pathQ, secondQ]]),
  );

  const first = fixture();
  const second = fixture();
  try {
    write(first.root, pathP, firstP);
    write(first.root, pathQ, firstQ);
    write(second.root, pathP, secondP);
    write(second.root, pathQ, secondQ);
    for (const workspace of [first, second]) {
      const added = spawnSync("git", ["add", "--", `${workspace.compiler}/src`], {
        cwd: workspace.root,
        encoding: "utf8",
      });
      assert.equal(added.status, 0, added.stderr);
    }
    const left = createBuildEvidence(first.root, first.compiler);
    const right = createBuildEvidence(second.root, second.compiler);
    assert.notEqual(left.inputDigest, right.inputDigest);
  } finally {
    rmSync(first.root, { recursive: true, force: true });
    rmSync(second.root, { recursive: true, force: true });
  }
});

test("verifier refuses a tampered consumed output", () => {
  const { root, compiler } = fixture();
  try {
    const raw = `${JSON.stringify(createBuildEvidence(root, compiler), null, 2)}\n`;
    write(root, `${compiler}/dist/governance-mode.js`, "export const mode = 2;\n");
    const verified = verifyBuildEvidence(root, compiler, raw);
    assert.equal(verified.ok, false);
    assert.match(verified.reason, /output digest mismatch/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifier refuses legacy v1 evidence and duplicate keys", () => {
  const { root, compiler } = fixture();
  try {
    const current = createBuildEvidence(root, compiler);
    const legacy = verifyBuildEvidence(root, compiler, JSON.stringify({
      schema: "galerina.compiler-build-evidence.v1",
      algorithm: "sha256",
      trackedInputs: current.inputs.map((entry) => entry.path),
      inputDigest: current.inputDigest,
    }));
    assert.equal(legacy.ok, false);
    assert.match(legacy.reason, /malformed/i);

    const duplicate = [
      "{",
      `  "schema": "rejected-first",`,
      `  "schema": ${JSON.stringify(current.schema)},`,
      `  "algorithm": ${JSON.stringify(current.algorithm)},`,
      `  "package": ${JSON.stringify(current.package)},`,
      `  "inputs": ${JSON.stringify(current.inputs)},`,
      `  "config": ${JSON.stringify(current.config)},`,
      `  "toolchain": ${JSON.stringify(current.toolchain)},`,
      `  "outputs": ${JSON.stringify(current.outputs)},`,
      `  "inputDigest": ${JSON.stringify(current.inputDigest)},`,
      `  "outputDigest": ${JSON.stringify(current.outputDigest)}`,
      "}",
    ].join("\n");
    const duplicated = verifyBuildEvidence(root, compiler, duplicate);
    assert.equal(duplicated.ok, false);
    assert.match(duplicated.reason, /duplicate.*key/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
