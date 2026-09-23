import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkLoadGraph, MAX_LOAD_GRAPH_FILE_BYTES } from "../dist/load-graph.js";

test("walkLoadGraph admits a tiny regular entry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-ok-"));
  const entry = join(dir, "entry.js");
  writeFileSync(entry, "export const n = 1;\n");
  try {
    const g = await walkLoadGraph(entry);
    assert.equal(g.ok, true);
    assert.equal(g.files.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hostile: oversize source is refused before parse", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-big-"));
  const entry = join(dir, "entry.js");
  writeFileSync(entry, Buffer.concat([Buffer.from("export const n = 1;\n"), Buffer.alloc(MAX_LOAD_GRAPH_FILE_BYTES, 0x61)]));
  try {
    const g = await walkLoadGraph(entry);
    assert.equal(g.ok, false);
    assert.match(g.reason, /file-too-large|unresolved-entry/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hostile: symlink entry is refused", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lg-link-"));
  const real = join(dir, "real.js");
  const link = join(dir, "entry.js");
  writeFileSync(real, "export const n = 1;\n");
  try {
    try { symlinkSync(real, link); } catch (err) {
      t.skip(`symlink refused: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const g = await walkLoadGraph(link);
    assert.equal(g.ok, false);
    assert.match(g.reason, /unresolved-entry|symlink/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
