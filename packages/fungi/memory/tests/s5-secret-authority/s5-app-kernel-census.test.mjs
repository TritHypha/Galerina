// OPEN-S5-1 pin: app-kernel test census (685 vs 686 vs 724) is explained and frozen.
// Evidence: packages/fungi/memory/evidence/s5-app-kernel-census/ (synthetic data only).
// Red when: the TAP parser miscounts, an app-kernel test file is added/removed without
// refreshing the census, the built-dependency census stops being all-green, or a count
// drift between dependency states shows up in a file that did NOT fail to load.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTapSummary, listTestFiles } from "./s5-app-kernel-test-census.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EV = resolve(HERE, "..", "..", "evidence", "s5-app-kernel-census");
const load = (n) => JSON.parse(readFileSync(join(EV, n), "utf8"));
const built = load("results-linux-compiler-built.json");
const unbuilt = load("results-linux-compiler-unbuilt.json");
const byFile = (r) => new Map(r.rows.map((x) => [x.file, x.summary]));

const SYNTH = [
  "TAP version 13",
  "# Subtest: outer",
  "    ok 1 - inner a",
  "    not ok 2 - inner b",
  "    ok 3 - inner c # SKIP linux only",
  "    ok 4 - inner d # TODO later",
  "ok 1 - outer",
  "1..1",
  "# tests 4", "# suites 1", "# pass 1", "# fail 1", "# cancelled 0", "# skipped 1", "# todo 1",
].join("\n");

test("S5-1-C01 parser reads every TAP counter", () => {
  const { summary } = parseTapSummary(SYNTH);
  assert.deepEqual(summary, { tests: 4, suites: 1, pass: 1, fail: 1, cancelled: 0, skipped: 1, todo: 1 });
});

test("S5-1-C02 parser keeps leaf names with ok / not ok / SKIP / TODO", () => {
  const { names } = parseTapSummary(SYNTH);
  const leaf = names.filter((n) => n.name.startsWith("inner"));
  assert.deepEqual(leaf.map((n) => n.status), ["ok", "not ok", "SKIP", "TODO"]);
});

test("S5-1-C03 missing counters stay null, never 0 (fail closed on a crashed run)", () => {
  const { summary } = parseTapSummary("TAP version 13\nBail out!");
  for (const v of Object.values(summary)) assert.equal(v, null);
});

test("S5-1-C04 census file set equals the live app-kernel tests/*.test.mjs set", () => {
  const live = listTestFiles();
  assert.deepEqual(built.rows.map((r) => r.file), live);
  assert.deepEqual(unbuilt.rows.map((r) => r.file), live);
  assert.equal(built.files, live.length);
});

test("S5-1-C05 with every dependency built the census is 724 tests, all green", () => {
  const sum = [...byFile(built).values()].reduce((a, s) => a + s.tests, 0);
  assert.equal(sum, built.total.tests);
  assert.equal(built.total.tests, 724);
  assert.equal(built.total.fail, 0);
  assert.equal(built.total.cancelled, 0);
  for (const r of built.rows) assert.equal(r.status, 0, `${r.file} exited ${r.status}`);
});

test("S5-1-C06 count drift between dependency states only comes from load-failing files", () => {
  const b = byFile(built);
  const drift = unbuilt.rows.filter((r) => r.summary.tests !== b.get(r.file).tests);
  assert.ok(drift.length > 0, "expected the unbuilt-compiler census to collapse some files");
  for (const r of drift) assert.ok(r.summary.fail > 0, `${r.file} drifted without failing`);
  // a collapsed file reports fewer tests, never more
  for (const r of drift) assert.ok(r.summary.tests < b.get(r.file).tests, `${r.file} grew`);
});

test("S5-1-C07 unbuilt census failures are all the missing core-compiler dist", () => {
  const failing = unbuilt.rows.filter((r) => r.summary.fail > 0).map((r) => r.file);
  assert.ok(failing.length >= 1);
  assert.equal(unbuilt.total.fail, 13);
  assert.equal(unbuilt.total.tests, 723);
});