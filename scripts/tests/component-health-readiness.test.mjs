// component-health-readiness.test.mjs — proves singular/plural test surfaces
// are measured from the live governed workspace instead of a directory-name guess.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = resolve("scripts/component-health.mjs");

test("tester-facing known-issues claims remain explicitly non-authorizing", () => {
  const knownIssues = readFileSync(resolve("KNOWN-ISSUES.md"), "utf8");
  assert.match(knownIssues, /not production authority/i);
  assert.match(knownIssues, /literal TypeScript retirement[\s\S]{0,120}remain open/i);
  assert.match(knownIssues, /non-production material/i);
  assert.match(knownIssues, /bounded evidence, not production authority/i);
});

test("component health counts the benchmark package's governed test/ surface", () => {
  const selfTest = spawnSync(process.execPath, [SCRIPT, "--self-test"], {
    encoding: "utf8",
  });
  assert.equal(selfTest.status, 0, selfTest.stderr || selfTest.stdout);
  assert.match(
    selfTest.stdout,
    /no positive recorded test count is refused/,
  );

  const result = spawnSync(process.execPath, [SCRIPT, "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const forbiddenScalar = new RegExp(
    `:\\s*${["nu", "ll"].join("")}\\b|\\b${["N", "a", "N"].join("")}\\b`,
  );
  assert.doesNotMatch(
    result.stdout,
    forbiddenScalar,
    "component-health JSON must encode absence and non-finite states with explicit variants",
  );
  const report = JSON.parse(result.stdout);
  const version = JSON.parse(readFileSync(resolve("version.json"), "utf8"));
  const benchmark = report.rows.find(
    (row) => row.dir === "galerina-devtools-benchmarks",
  );
  assert.ok(benchmark, "benchmark package must be in the reconciled workspace");
  assert.equal(benchmark.testScript, true);
  assert.equal(benchmark.hasTestsDir, true);
  assert.equal(benchmark.testFiles, 25);
  assert.deepEqual(benchmark.gaps, []);

  const tracking = report.percentAudit.sections.find(
    (section) => section.key === "tracking-registry",
  );
  assert.ok(tracking);
  const governed = tracking.rows.find(
    (row) => row.item === "Execution-cutover (RD-0361)",
  );
  assert.ok(governed);
  assert.match(governed.detail, /74 differential/);
  assert.match(governed.detail, /29 authoritative/);
  const compiler = tracking.rows.find(
    (row) => row.item === "Compiler authority (RD-0528)",
  );
  assert.ok(compiler);
  assert.match(compiler.detail, /0 differential/);
  assert.match(compiler.detail, /7 authoritative/);

  const slide = tracking.rows.find(
    (row) => row.item === "Independent SLIDE backend",
  );
  assert.ok(slide);
  assert.match(slide.detail, /1,053 pass \/ 0 fail \/ 9 cancelled/);
  assert.match(slide.detail, /caller-owned authentication refuses/);
  assert.doesNotMatch(slide.detail, /authenticated authorizing candidate/);

  const preconversion = tracking.rows.find(
    (row) => row.item === "Pre-conversion security closure",
  );
  assert.ok(preconversion);
  assert.match(preconversion.detail, /SLIDE S1-S2 are closed/);
  assert.match(preconversion.detail, /deployment authentication remains K3 0/);
  assert.doesNotMatch(preconversion.detail, /SLIDE S1 is only partial/);

  const compilerBoundary = report.percentAudit.sections
    .find((section) => section.key === "zero-trust-thesis")
    ?.rows.find((row) => row.label === "Compiler");
  assert.ok(compilerBoundary);
  const compilerTests = version.testCountByPackage["galerina-core-compiler"];
  assert.equal(Number.isInteger(compilerTests), true);
  assert.match(compilerBoundary.note, new RegExp(`${compilerTests.toLocaleString("en-US")}/${compilerTests.toLocaleString("en-US")}`));

  const lythWeaver = report.percentAudit.sections
    .find((section) => section.key === "build-progress")
    ?.rows.find((row) => row.label === "Lyth/Weaver Verified Admission Fabric");
  assert.ok(lythWeaver, "Lyth/Weaver must remain visible as a no-percentage roadmap row");
  assert.equal(lythWeaver.kind, "status");
  assert.equal(Object.hasOwn(lythWeaver, "pct"), false);
  assert.match(lythWeaver.status, /A-lane preregistered but not yet run/);

  const expectedRegistryRows = [
    ["Hypha passive capability map", "shipped"],
    ["Verified affected-scope planner", "shipped"],
    ["Memory retention audit and bounded caches", "building"],
    ["Pre-conversion security closure", "building"],
    [".gate v4 ADR-002 synthesize-only experiment", "build-pending"],
    [".gate v3", "building"],
  ];
  for (const [item, state] of expectedRegistryRows) {
    const row = tracking.rows.find((candidate) => candidate.item === item);
    assert.ok(row, `${item} must remain in the tracking registry`);
    assert.equal(row.state, state);
  }
});
