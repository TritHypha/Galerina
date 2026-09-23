import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "galerina.mjs");

function runPackageBuild(pkgDir) {
  return spawnSync(
    process.execPath,
    [CLI, "build", "--package", pkgDir],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env },
      shell: false,
      timeout: 30_000,
    },
  );
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function writeDescriptor(pkgDir, name) {
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.fungi.json"),
    JSON.stringify({ name, entry: "src/index.fungi" }),
  );
}

test("hostile: package descriptor names with path separators or .. are refused", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-pkg-name-"));
  try {
    for (const name of ["../evil", "..\\evil", "foo/bar", "foo..bar", "a/../../outside"]) {
      const pkgDir = join(root, "pkg");
      writeDescriptor(pkgDir, name);
      const result = runPackageBuild(pkgDir);
      assert.equal(result.status, 1, `name ${name} must refuse: ${output(result)}`);
      assert.match(output(result), /not an admitted filename/);
      assert.equal(existsSync(join(root, "evil.wasm")), false);
      assert.equal(existsSync(join(dirname(root), "outside.wasm")), false);
      rmSync(pkgDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an admitted package name proceeds past the filename gate", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-pkg-name-ok-"));
  try {
    writeDescriptor(root, "okpkg");
    const result = runPackageBuild(root);
    assert.notEqual(output(result), "");
    assert.doesNotMatch(output(result), /not an admitted filename/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
