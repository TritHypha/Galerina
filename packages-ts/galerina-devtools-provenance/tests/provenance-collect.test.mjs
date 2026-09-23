import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectFungiCorpus } from "../dist/index.js";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

test("complete empty root is clean coverage, not a refused walk", () => {
  const root = mkdtempSync(join(tmpdir(), "prov-empty-"));
  try {
    const collected = collectFungiCorpus(root);
    assert.equal(collected.complete, true);
    assert.equal(collected.files.length, 0);
    const audit = spawnSync(process.execPath, [CLI, "audit", root], { encoding: "utf8", timeout: 15_000, shell: false });
    assert.equal(audit.status, 0, audit.stderr);
    const report = spawnSync(process.execPath, [CLI, "report", root], { encoding: "utf8", timeout: 15_000, shell: false });
    assert.equal(report.status, 0, report.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: symlink .fungi outside the root makes audit/report incomplete", (t) => {
  const root = mkdtempSync(join(tmpdir(), "prov-link-"));
  const outside = join(root, "..", `prov-secret-${process.pid}.fungi`);
  writeFileSync(outside, "pure flow x() -> Int { return 1 }\n");
  try {
    try {
      symlinkSync(outside, join(root, "escape.fungi"));
    } catch (err) {
      t.skip(`symlink creation refused on this host: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const collected = collectFungiCorpus(root);
    assert.equal(collected.complete, false);
    assert.equal(collected.files.length, 0);
    const audit = spawnSync(process.execPath, [CLI, "audit", root], { encoding: "utf8", timeout: 15_000, shell: false });
    assert.equal(audit.status, 2, audit.stderr);
    assert.match(audit.stderr, /incomplete traversal/);
    const report = spawnSync(process.execPath, [CLI, "report", root], { encoding: "utf8", timeout: 15_000, shell: false });
    assert.equal(report.status, 2, report.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
    try { rmSync(outside, { force: true }); } catch { /* ignore */ }
  }
});
