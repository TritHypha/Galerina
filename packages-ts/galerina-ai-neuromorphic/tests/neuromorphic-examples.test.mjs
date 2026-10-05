import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createNeuromorphicReport, validateNeuromorphicPlan, validateSpikingModel } from "../dist/index.js";

const EXAMPLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const readExample = (name) => JSON.parse(readFileSync(join(EXAMPLE_DIR, name), "utf8"));

describe("checked-in non-authorizing neuromorphic target report examples", () => {
  it("the model example validates cleanly", () => {
    assert.deepEqual(validateSpikingModel(readExample("model.example.json")), []);
  });

  it("the report example is exactly what createNeuromorphicReport produces for the plans example", () => {
    assert.deepEqual(createNeuromorphicReport(readExample("plans.example.json")), readExample("report.example.json"));
  });

  it("the report is non-authorizing: only plans and warnings, no execution, hardware or authority fields", () => {
    const report = readExample("report.example.json");
    assert.deepEqual(Object.keys(report).sort(), ["plans", "warnings"]);
    const text = JSON.stringify(report);
    for (const word of ["execute", "actuator", "hardware", "authority", "implant", "topology"]) assert.equal(text.includes(word), false, word);
    assert.equal(report.plans[0].fallback, "reject", "the primary example refuses rather than falling back");
  });

  it("keeps the examples load-bearing: an unbounded plan is an error", () => {
    const { plans } = readExample("plans.example.json");
    const codes = validateNeuromorphicPlan({ ...plans[0], maxEvents: 0, timeoutMs: 0 }).map((d) => d.code);
    assert.ok(codes.includes("Galerina_NEUROMORPHIC_PLAN_MAX_EVENTS_REQUIRED"));
    assert.ok(codes.includes("Galerina_NEUROMORPHIC_PLAN_TIMEOUT_REQUIRED"));
  });
});
