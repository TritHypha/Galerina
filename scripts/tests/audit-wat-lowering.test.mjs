import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanFungiCorpus,
  coverageProblems,
  collectSites,
  MAX_WAT_CORPUS_FILE_BYTES,
} from "../audit-wat-lowering.mjs";

const GOOD = `@version 1
record R { a: Int }
pure flow f() -> Int contract { intent { "x" } } { return 0 }
`;

test("readable corpus with no parse skip is covered", () => {
  const root = mkdtempSync(join(tmpdir(), "wat-low-ok-"));
  try {
    writeFileSync(join(root, "ok.fungi"), GOOD);
    const scan = scanFungiCorpus(root);
    assert.equal(scan.scanned, 1);
    assert.equal(scan.parseErr, 0);
    assert.equal(scan.unread, 0);
    assert.equal(coverageProblems(scan).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: parse-skipped .fungi is not a clean coverage result", () => {
  const root = mkdtempSync(join(tmpdir(), "wat-low-parse-"));
  try {
    writeFileSync(join(root, "ok.fungi"), GOOD);
    writeFileSync(join(root, "bad.fungi"), "\0\0not-a-program");
    const parsed = collectSites("\0\0not-a-program", "bad.fungi");
    assert.equal(parsed.parseError, true);
    const scan = scanFungiCorpus(root);
    assert.ok(scan.parseErr >= 1);
    assert.ok(coverageProblems(scan).some((p) => /parse-skipped/.test(p)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hostile: unread oversize .fungi is not a clean coverage result", () => {
  const root = mkdtempSync(join(tmpdir(), "wat-low-unread-"));
  try {
    writeFileSync(join(root, "ok.fungi"), GOOD);
    writeFileSync(join(root, "huge.fungi"), Buffer.alloc(MAX_WAT_CORPUS_FILE_BYTES + 1, 0x61));
    const scan = scanFungiCorpus(root);
    assert.equal(scan.scanned, 1);
    assert.ok(scan.unread >= 1);
    assert.ok(coverageProblems(scan).some((p) => /unread/.test(p)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("empty root is not a clean WAT lowering sweep", () => {
  const root = mkdtempSync(join(tmpdir(), "wat-low-empty-"));
  try {
    mkdirSync(join(root, "empty"), { recursive: true });
    const scan = scanFungiCorpus(join(root, "empty"));
    assert.equal(scan.scanned, 0);
    assert.ok(coverageProblems(scan).length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
