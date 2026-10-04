import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  scanFungiCorpus,
  coverageProblems,
  collectSites,
  legA,
  rootCauseOf,
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

// E5 boundary: Float16 stays refused (RED, a Leg-A site); Float32 is admitted (GREEN, no Leg-A site).
const recordProgram = (fields) => `@version 1
record R { ${fields} }
pure flow f() -> Int contract { intent { "x" } } { return 0 }
`;

test("RED: a Float16 record field stays a Leg-A site attributed to the narrow-float root cause", () => {
  const parsed = collectSites(recordProgram("x: Float16"), "red-f16.fungi");
  assert.equal(parsed.parseError, false);
  const sites = legA(parsed.sites);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].base, "Float16");
  assert.equal(sites[0].name, "x");
  assert.equal(rootCauseOf(sites[0]), "missing-f16-scalar-lane");
});

test("GREEN: a Float32 record field is collected but is not a Leg-A site (E5 admits f32 slots)", () => {
  const parsed = collectSites(recordProgram("x: Float32"), "green-f32.fungi");
  assert.equal(parsed.parseError, false);
  assert.ok(parsed.sites.some((s) => s.kind === "record-field" && s.base === "Float32"), "the Float32 field is collected, so the GREEN result is not vacuous");
  assert.equal(legA(parsed.sites).length, 0);
});

test("discriminating: a record with Float16 beside Float32 flags only the Float16 field", () => {
  const parsed = collectSites(recordProgram("h: Float16; s: Float32"), "mixed.fungi");
  assert.equal(parsed.parseError, false);
  assert.equal(parsed.sites.filter((s) => s.kind === "record-field").length, 2);
  const sites = legA(parsed.sites);
  assert.deepEqual(sites.map((s) => `${s.name}:${s.base}`), ["h:Float16"]);
});

test("corpus scan: a Float16 field is an inventoried Leg-A site and a Float32 field is not", () => {
  const root = mkdtempSync(join(tmpdir(), "wat-low-narrow-"));
  try {
    writeFileSync(join(root, "f16.fungi"), recordProgram("x: Float16"));
    writeFileSync(join(root, "f32.fungi"), recordProgram("x: Float32"));
    const scan = scanFungiCorpus(root);
    assert.equal(scan.scanned, 2);
    assert.equal(coverageProblems(scan).length, 0);
    assert.deepEqual(scan.aSites.map((s) => `${s.rel}:${s.base}`), ["f16.fungi:Float16"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("baseline migration: the root-cause id is missing-f16-scalar-lane; the retired missing-f32-scalar-lane id is gone", () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "../../packages-ts/galerina-core-compiler/tests/fixtures/wat-lowering-baseline.json");
  const causes = Object.keys(JSON.parse(readFileSync(fixture, "utf8")).rootCauses);
  assert.deepEqual(causes.sort(), ["decimal-f64-wart", "missing-f16-scalar-lane"]);
  const red = legA(collectSites(recordProgram("x: Float16"), "red-f16.fungi").sites);
  assert.equal(red.length, 1);
  assert.ok(causes.includes(rootCauseOf(red[0])), "a Float16 Leg-A site attributes to a declared root-cause id");
});
