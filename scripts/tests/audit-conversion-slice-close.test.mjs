import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const AUDIT = join(import.meta.dirname, "..", "audit-conversion-slice-close.mjs");

function fixture(body, name = "candidate-fungi-conversion-2026-08-12.md") {
  const root = mkdtempSync(join(tmpdir(), "galerina-slice-close-"));
  const path = join(root, "docs", "reports", name);
  mkdirSync(dirname(path), { recursive: true });
  const baseline = join(root, "governance", "conversion-slice-close-baseline.json");
  mkdirSync(dirname(baseline), { recursive: true });
  writeFileSync(baseline, '{"schemaVersion":1,"legacyReports":[]}\n');
  writeFileSync(path, body);
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [AUDIT, "--root", root], { encoding: "utf8" });
}

const digest = (character) => `sha256:${character.repeat(64)}`;
const gates = ["project-corpus", "differential", "strict-fungi", "physical-slide-vok"];
const exclusions = [
  { name: "full-tooling", authority: "task-5-plan" },
  { name: "graph-all", authority: "task-5-plan" },
  { name: "normal-phase-close", authority: "task-5-plan" },
];

function conversionReceipt() {
  return {
    schema: "galerina.conversion-slice-receipt.v2",
    authorizing: false,
    status: "PASS",
    product: "galerina",
    scope: { package: "example", file: "packages-ts/example/src/index.ts", symbol: "Candidate" },
    source: { head: "a".repeat(40), tree: "b".repeat(40), contentDigest: digest("c") },
    target: {
      locator: "packages/fungi/products/galerina/example/slice.fungi#Candidate",
      candidateDigest: digest("d"),
    },
    governance: { rdDigest: digest("e"), planDigest: digest("f") },
    physicalProfile: 1,
    projectCorpusReceiptDigest: digest("1"),
    gates: gates.map((name, index) => ({
      name, status: "PASS", evidenceDigest: digest(["2", "3", "4", "5"][index]),
    })),
    exclusions: exclusions.map((entry) => ({ ...entry })),
  };
}

const receiptLine = () => `Conversion receipt: ${JSON.stringify(conversionReceipt())}\n`;

const base = `# Candidate Fungi Conversion Report

## Slice-close receipt

Skill disposition: SKILL_UPDATE aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Threadability: PARALLEL_PURE
Source classification: CANDIDATE
Bounded closure: COMPLETE
${receiptLine()}
`;

const forward = `# Slice 323 Candidate Fungi conversion adjudication

Scope: \`packages-ts/example/src/index.ts#Candidate\`.

Evidence: source build point \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\`;
source SHA-256 \`BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\`;

## Slice-close receipt

Skill disposition: NO_SKILL_UPDATE: translating skill already covers this boundary
Authoring skill disposition: NO_SKILL_UPDATE: no Fungi candidate was authorized
Threadability: UNKNOWN
Source classification: BLOCKED
Bounded closure: COMPLETE
${receiptLine()}
`;

const qualifiedScript = forward
  .replace(
    "packages-ts/example/src/index.ts#Candidate",
    "packages-ts/example/scripts/run-tests.mjs#SearchGraph.setFile",
  );

test("complete exact slice-close receipt passes", () => {
  const result = run(fixture(base));
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("historical scope-less receipts cannot replay unless frozen in the baseline", () => {
  assert.equal(run(fixture(base.replace(/^Conversion receipt:.*\n/mu, ""))).status, 1);
});

test("source scope, candidate scope, required gate and exclusion mutations refuse", () => {
  const mutations = [
    (receipt) => ({ ...receipt, scope: { ...receipt.scope, file: "packages-ts/other/src/index.ts" } }),
    (receipt) => ({ ...receipt, target: { ...receipt.target, locator: "packages/fungi/products/trametes/example/slice.fungi#Candidate" } }),
    (receipt) => ({ ...receipt, gates: receipt.gates.slice(1) }),
    (receipt) => ({ ...receipt, exclusions: receipt.exclusions.slice(1) }),
  ];
  for (const mutate of mutations) {
    const body = base.replace(/^Conversion receipt:.*$/mu, `Conversion receipt: ${JSON.stringify(mutate(conversionReceipt()))}`);
    assert.equal(run(fixture(body)).status, 1);
  }
});

test("missing, duplicate and vague skill dispositions refuse", () => {
  for (const body of [
    base.replace(/Skill disposition:.*\n/u, ""),
    `${base}\nSkill disposition: NO_SKILL_UPDATE: duplicate\n`,
    base.replace(/SKILL_UPDATE [a-f0-9]{40}/u, "NO_SKILL_UPDATE:"),
  ]) {
    assert.equal(run(fixture(body)).status, 1);
  }
});

test("unknown and non-runtime threadability are valid fail-closed receipts", () => {
  assert.equal(run(fixture(base.replace("PARALLEL_PURE", "UNKNOWN"))).status, 0);
  assert.equal(run(fixture(base.replace("PARALLEL_PURE", "N/A"))).status, 0);
});

test("unrecognised threadability and incomplete closure refuse", () => {
  assert.equal(run(fixture(base.replace("PARALLEL_PURE", "MAYBE"))).status, 1);
  assert.equal(run(fixture(base.replace("COMPLETE", "INCOMPLETE"))).status, 1);
});

test("forward slice receipts require both skills and exact source identity", () => {
  const name = "slice-323-candidate-fungi-conversion-2026-08-13.md";
  const complete = run(fixture(forward, name));
  assert.equal(complete.status, 0, complete.stderr || complete.stdout);
  for (const body of [
    forward.replace(/Authoring skill disposition:.*\n/u, ""),
    forward.replace(/Scope:.*\n/u, ""),
    forward.replace(/Evidence: source build point.*\n/u, ""),
    forward.replace(/source SHA-256.*\n/u, ""),
  ]) {
    assert.equal(run(fixture(body, name)).status, 1);
  }
});

test("forward scopes accept scripts and qualified methods", () => {
  const name = "slice-448-qualified-script-fungi-conversion-2026-08-13.md";
  const result = run(fixture(qualifiedScript, name));
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("forward scopes accept canonical tests and bench module scopes", () => {
  const name = "slice-583-test-module-fungi-conversion-2026-08-13.md";
  for (const scope of [
    "packages-ts/example/tests/search.test.ts#module",
    "packages-ts/example/bench/flight-boot.mjs#module",
  ]) {
    const body = forward.replace(
      "packages-ts/example/src/index.ts#Candidate",
      scope,
    );
    const result = run(fixture(body, name));
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test("forward scopes refuse traversal and empty path segments", () => {
  const name = "slice-448-noncanonical-scope-fungi-conversion-2026-08-13.md";
  for (const scope of [
    "packages-ts/example/scripts/../src/index.ts#Candidate",
    "packages-ts/example/scripts/./run-tests.mjs#module",
    "packages-ts/example/scripts//run-tests.mjs#module",
    "packages-ts/example/tests/../src/index.ts#Candidate",
    "packages-ts/example/bench//flight-boot.mjs#module",
  ]) {
    const body = forward.replace(
      "packages-ts/example/src/index.ts#Candidate",
      scope,
    );
    assert.equal(run(fixture(body, name)).status, 1);
  }
});

test("a frozen legacy report is exempt but cannot hide a new report", () => {
  const root = fixture(base);
  const legacy = join(root, "docs", "reports", "legacy-fungi-conversion-2026-08-11.md");
  writeFileSync(legacy, "# Legacy report without a receipt\n");
  writeFileSync(
    join(root, "governance", "conversion-slice-close-baseline.json"),
    '{"schemaVersion":1,"legacyReports":["legacy-fungi-conversion-2026-08-11.md"]}\n',
  );
  assert.equal(run(root).status, 0);
  writeFileSync(join(root, "docs", "reports", "new-fungi-conversion-2026-08-12.md"), "# Missing receipt\n");
  assert.equal(run(root).status, 1);
});
