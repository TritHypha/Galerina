import assert from "node:assert/strict";
import fs, {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { writeReportFiles, normaliseBuildOutputPath } = require("./galerina.js");

test("normaliseBuildOutputPath refuses parent-directory segments", () => {
  assert.throws(() => normaliseBuildOutputPath("../app.ai-guide.md"), /escapes the configured build directory/);
  assert.throws(() => normaliseBuildOutputPath("docs/../../../outside.md"), /escapes/);
  assert.throws(() => normaliseBuildOutputPath("C:/Windows/app.manifest.json"), /escapes|admitted/);
  assert.throws(() => normaliseBuildOutputPath("/etc/passwd"), /escapes|admitted/);
  assert.equal(normaliseBuildOutputPath("./build/app.ai-guide.md"), "app.ai-guide.md");
});

test("writeReportFiles writes AI guide under the build directory", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-aiguide-ok-"));
  try {
    const written = writeReportFiles(root, { "app.ai-guide.md": "# AI Guide\n" });
    assert.equal(readFileSync(join(root, "app.ai-guide.md"), "utf8").includes("# AI Guide"), true);
    assert.equal(written.some((p) => p.endsWith("app.ai-guide.md")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: dangling symlink cannot redirect AI-guide write outside the build directory", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "galerina-aiguide-link-"));
  const root = join(parent, "build");
  const outside = join(parent, "escaped-guide.md");
  try {
    mkdirSync(root, { recursive: true });
    try {
      symlinkSync(outside, join(root, "app.ai-guide.md"));
    } catch (err) {
      t.skip(`symlink creation refused on this host: ${err instanceof Error ? err.message : err}`);
      return;
    }
    assert.throws(
      () => writeReportFiles(root, { "app.ai-guide.md": "# escaped\n" }),
      /link|escapes/,
    );
    assert.equal(existsSync(outside), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

function tryDirSymlink(target, linkPath) {
  const errors = [];
  for (const type of ["dir", "junction", undefined]) {
    try {
      if (type === undefined) symlinkSync(target, linkPath);
      else symlinkSync(target, linkPath, type);
      return true;
    } catch (err) {
      errors.push(`${type ?? "default"}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return errors.join("; ");
}

test("hostile: parent-directory symlink cannot redirect nested report writes", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "galerina-aiguide-dirlink-"));
  const root = join(parent, "build");
  const outsideDir = join(parent, "outside-docs");
  const outsideFile = join(outsideDir, "api-guide.md");
  try {
    mkdirSync(root, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    const linked = tryDirSymlink(outsideDir, join(root, "docs"));
    if (linked !== true) {
      t.skip(`directory symlink creation refused on this host: ${linked}`);
      return;
    }
    assert.throws(
      () => writeReportFiles(root, { "docs/api-guide.md": "# escaped-nested\n" }),
      /link|escapes/,
    );
    assert.equal(existsSync(outsideFile), false, "outside nested report must not be created");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("hostile: dangling leaf refuse survives lstat ENOENT (readlink must not be swallowed)", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "galerina-aiguide-lstat-"));
  const root = join(parent, "build");
  const outside = join(parent, "escaped-lstat.md");
  const origLstat = fs.lstatSync;
  try {
    mkdirSync(root, { recursive: true });
    try {
      symlinkSync(outside, join(root, "app.ai-guide.md"));
    } catch (err) {
      t.skip(`symlink creation refused on this host: ${err instanceof Error ? err.message : err}`);
      return;
    }
    fs.lstatSync = function patchedLstat(p, opts) {
      if (String(p).replace(/\\/g, "/").endsWith("/app.ai-guide.md")) {
        const e = new Error("ENOENT");
        e.code = "ENOENT";
        throw e;
      }
      return origLstat.call(this, p, opts);
    };
    assert.throws(
      () => writeReportFiles(root, { "app.ai-guide.md": "# lstat-enot\n" }),
      /link|escapes/,
    );
    assert.equal(existsSync(outside), false, "lstat ENOENT must not allow writeFile to follow the dangling link");
  } finally {
    fs.lstatSync = origLstat;
    rmSync(parent, { recursive: true, force: true });
  }
});
