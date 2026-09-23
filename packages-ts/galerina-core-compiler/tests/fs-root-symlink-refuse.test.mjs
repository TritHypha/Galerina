import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { callStdlib } from "../dist/stdlib.js";

const ctx = {
  recordEffect() {},
  resolveIdentifier() { return undefined; },
  async callFlow() { return { __tag: "void" }; },
  async applyFn() { return { __tag: "void" }; },
};

function str(v) {
  return { __tag: "string", value: v };
}

async function writeText(rel) {
  return callStdlib("fs.writeText", undefined, [str(rel), str("payload")], ctx);
}

async function readText(rel) {
  return callStdlib("fs.readText", undefined, [str(rel)], ctx);
}

test("fs.writeText writes a regular file inside GALERINA_FS_ROOT", async () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-fs-ok-"));
  const prev = process.env.GALERINA_FS_ROOT;
  process.env.GALERINA_FS_ROOT = root;
  try {
    const r = await writeText("inside.txt");
    assert.equal(r.__tag, "ok");
    assert.equal(readFileSync(join(root, "inside.txt"), "utf8"), "payload");
  } finally {
    if (prev === undefined) delete process.env.GALERINA_FS_ROOT;
    else process.env.GALERINA_FS_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: dangling symlink inside the root cannot write outside it", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "galerina-fs-link-"));
  const outside = join(root, "..", `galerina-fs-outside-${process.pid}.txt`);
  const link = join(root, "escape.txt");
  const prev = process.env.GALERINA_FS_ROOT;
  process.env.GALERINA_FS_ROOT = root;
  try {
    try {
      symlinkSync(outside, link);
    } catch (err) {
      t.skip(`symlink creation refused on this host: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const r = await writeText("escape.txt");
    assert.equal(r.__tag, "err", "write through dangling symlink must refuse");
    assert.match(String(r.error?.value ?? ""), /symbolic link|symlink/);
    assert.equal(existsSync(outside), false, "outside target must not be created");
  } finally {
    if (prev === undefined) delete process.env.GALERINA_FS_ROOT;
    else process.env.GALERINA_FS_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
    try { rmSync(outside, { force: true }); } catch { /* ignore */ }
  }
});

test("fs.readText reads a regular file inside GALERINA_FS_ROOT", async () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-fs-read-ok-"));
  const prev = process.env.GALERINA_FS_ROOT;
  process.env.GALERINA_FS_ROOT = root;
  try {
    writeFileSync(join(root, "inside.txt"), "hello");
    const r = await readText("inside.txt");
    assert.equal(r.__tag, "ok");
    assert.equal(r.value.__tag, "string");
    assert.equal(r.value.value, "hello");
  } finally {
    if (prev === undefined) delete process.env.GALERINA_FS_ROOT;
    else process.env.GALERINA_FS_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: symlink inside the root cannot be read as an outside file", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "galerina-fs-read-link-"));
  const outside = join(root, "..", `galerina-fs-read-outside-${process.pid}.txt`);
  writeFileSync(outside, "secret");
  const link = join(root, "escape.txt");
  const prev = process.env.GALERINA_FS_ROOT;
  process.env.GALERINA_FS_ROOT = root;
  try {
    try {
      symlinkSync(outside, link);
    } catch (err) {
      t.skip(`symlink creation refused on this host: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const r = await readText("escape.txt");
    assert.equal(r.__tag, "err", "read through symlink must refuse");
    assert.match(String(r.error?.value ?? r.message ?? ""), /symbolic link|symlink|not a regular file|ELOOP|EINVAL/i);
  } finally {
    if (prev === undefined) delete process.env.GALERINA_FS_ROOT;
    else process.env.GALERINA_FS_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
    try { rmSync(outside, { force: true }); } catch { /* ignore */ }
  }
});
