import test from "node:test";
import assert from "node:assert/strict";
import { validateBoundedClosureReceipt } from "../lib/bounded-closure-receipt.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const requiredGates = ["project-corpus", "differential", "strict-fungi", "physical-slide-vok"];
const requiredExclusions = [
  { name: "full-tooling", authority: "task-5-plan" },
  { name: "graph-all", authority: "task-5-plan" },
  { name: "normal-phase-close", authority: "task-5-plan" },
];

function receipt() {
  return {
    schema: "galerina.conversion-slice-receipt.v2",
    authorizing: false,
    status: "PASS",
    product: "galerina",
    scope: {
      package: "galerina-core-config",
      file: "packages-ts/galerina-core-config/src/index.ts",
      symbol: "isEnvironmentMode",
    },
    source: {
      head: "1".repeat(40),
      tree: "2".repeat(40),
      contentDigest: digest("a"),
    },
    target: {
      locator: "packages/fungi/products/galerina/rd0873-first-native-slice/slice.fungi#isEnvironmentMode",
      candidateDigest: digest("b"),
    },
    governance: {
      rdDigest: digest("c"),
      planDigest: digest("d"),
    },
    physicalProfile: 1,
    projectCorpusReceiptDigest: digest("e"),
    gates: requiredGates.map((name, index) => ({
      name,
      status: "PASS",
      evidenceDigest: digest(["f", "1", "2", "3"][index]),
    })),
    exclusions: requiredExclusions.map((entry) => ({ ...entry })),
  };
}

function validate(value) {
  const expected = receipt();
  return validateBoundedClosureReceipt(value, {
    requiredGates,
    requiredExclusions,
    expectedProduct: expected.product,
    expectedScope: expected.scope,
    expectedSource: expected.source,
    expectedTarget: expected.target,
    expectedGovernance: expected.governance,
    expectedProjectCorpusReceiptDigest: expected.projectCorpusReceiptDigest,
  });
}

test("an exact product-scoped conversion receipt v2 is accepted", () => {
  assert.deepEqual(validate(receipt()), { kind: "accepted", value: receipt() });
});

test("historical scope-less bounded closure receipts cannot replay into v2", () => {
  const historical = {
    schema: "zt.bounded-closure.v1",
    sliceId: "slice-30",
    sourceDigest: digest("a").slice(7),
    candidateDigest: digest("b").slice(7),
    gates: [],
    excludedAggregates: [],
  };
  assert.deepEqual(validate(historical), { kind: "refused", code: "CLOSURE_RECEIPT_SHAPE" });
});

test("source and candidate scope mutations refuse", () => {
  const cases = [
    { ...receipt(), product: "trametes" },
    { ...receipt(), scope: { ...receipt().scope, package: "other-package" } },
    { ...receipt(), scope: { ...receipt().scope, file: "packages-ts/other-package/src/index.ts" } },
    { ...receipt(), scope: { ...receipt().scope, symbol: "" } },
    { ...receipt(), source: { ...receipt().source, head: "0".repeat(40) } },
    { ...receipt(), source: { ...receipt().source, contentDigest: digest("0") } },
    { ...receipt(), target: { ...receipt().target, locator: "packages/fungi/products/trametes/slice.fungi#isEnvironmentMode" } },
    { ...receipt(), target: { ...receipt().target, candidateDigest: digest("0") } },
  ];
  for (const candidate of cases) assert.equal(validate(candidate).kind, "refused");
});

test("governance, scalar profile, corpus binding and non-authority are exact", () => {
  for (const candidate of [
    { ...receipt(), governance: { ...receipt().governance, rdDigest: digest("0") } },
    { ...receipt(), governance: { ...receipt().governance, planDigest: digest("0") } },
    { ...receipt(), physicalProfile: 64 },
    { ...receipt(), projectCorpusReceiptDigest: digest("0") },
    { ...receipt(), authorizing: true },
    { ...receipt(), status: "HOLD" },
  ]) assert.equal(validate(candidate).kind, "refused");
});

test("missing, duplicate, reordered, failed or surplus gates refuse", () => {
  const gates = receipt().gates;
  const cases = [
    { ...receipt(), gates: gates.slice(1) },
    { ...receipt(), gates: [...gates, gates[0]] },
    { ...receipt(), gates: [gates[1], gates[0], ...gates.slice(2)] },
    { ...receipt(), gates: gates.map((gate, index) => index === 0 ? { ...gate, status: "FAIL" } : gate) },
    { ...receipt(), gates: [...gates, { name: "invented", status: "PASS", evidenceDigest: digest("f") }] },
  ];
  for (const candidate of cases) assert.equal(validate(candidate).kind, "refused");
});

test("exclusion name, order and authority mutations refuse", () => {
  const exclusions = receipt().exclusions;
  for (const candidate of [
    { ...receipt(), exclusions: exclusions.slice(1) },
    { ...receipt(), exclusions: [exclusions[1], exclusions[0], exclusions[2]] },
    { ...receipt(), exclusions: exclusions.map((entry, index) => index === 0 ? { ...entry, name: "hidden" } : entry) },
    { ...receipt(), exclusions: exclusions.map((entry, index) => index === 0 ? { ...entry, authority: "other" } : entry) },
  ]) assert.equal(validate(candidate).kind, "refused");
});

test("surplus, inherited, accessor and hostile records refuse", () => {
  const surplus = { ...receipt(), authorityReleased: true };
  const inherited = Object.create(receipt());
  const accessor = receipt();
  Object.defineProperty(accessor.gates[0], "name", { get: () => "project-corpus", enumerable: true });
  for (const candidate of [surplus, inherited, accessor]) assert.equal(validate(candidate).kind, "refused");
});
