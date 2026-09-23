import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  admitOutputDir,
  writeOutputFile,
} from "../lib/requirement-output-admission.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "galerina-req-out-"));
  mkdirSync(join(root, "build"), { recursive: true });
  return root;
}

test("admitOutputDir admits a real directory under build/", () => {
  const root = makeRoot();
  try {
    const dir = join(root, "build", "ok");
    const resolved = admitOutputDir(dir, "TEST", root);
    assert.equal(existsSync(dir), true);
    assert.ok(resolved.toLowerCase().includes("build"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: writeOutputFile refuses a junctioned output directory", () => {
  const root = makeRoot();
  const outside = join(root, "outside");
  mkdirSync(outside);
  const linked = join(root, "build", "linked-out");
  try {
    symlinkSync(outside, linked, "junction");
    assert.throws(() => admitOutputDir(linked, "TEST", root), /TEST_LINKED|TEST_ESCAPED/);
    assert.throws(
      () => writeOutputFile(join(linked, "receipt.json"), "leaked\n", "TEST", root),
      /TEST_LINKED/,
    );
    assert.equal(existsSync(join(outside, "receipt.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: writeOutputFile refuses a dangling output symlink", (t) => {
  const root = makeRoot();
  const outside = join(root, "outside");
  mkdirSync(outside);
  const destDir = join(root, "build", "out");
  mkdirSync(destDir);
  const dest = join(destDir, "receipt.json");
  const target = join(outside, "secret.txt");
  try {
    try {
      symlinkSync(target, dest);
    } catch (err) {
      t.skip(`file symlink not permitted: ${err && err.code}`);
      return;
    }
    assert.throws(() => writeOutputFile(dest, "leaked\n", "TEST", root), /TEST_LINKED/);
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeOutputFile writes into an admitted real build directory", () => {
  const root = makeRoot();
  try {
    const dir = join(root, "build", "ok");
    admitOutputDir(dir, "TEST", root);
    const file = join(dir, "receipt.json");
    writeOutputFile(file, "ok\n", "TEST", root);
    assert.equal(readFileSync(file, "utf8"), "ok\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
