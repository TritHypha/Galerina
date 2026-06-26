import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { describe, it } from "node:test";

import { parseProgram } from "../dist/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOk(source, label) {
  const result = parseProgram(source, label ?? "test.spore");
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  assert.equal(
    errors.length,
    0,
    `Expected no errors, got:\n${errors.map((e) => `  ${e.code}: ${e.message}`).join("\n")}`,
  );
  return result;
}

// ── Phase 26: getPatient example ──────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

const getPatientSource = readFileSync(
  join(__dirname, "../../../examples/healthcare/getPatient.spore"),
  "utf8",
);

describe("Phase 26: getPatient example parses correctly", () => {
  it("produces 0 parse errors", () => {
    parseOk(getPatientSource, "getPatient.spore");
  });

  it("effects include phi.read and audit.write", () => {
    const result = parseOk(getPatientSource, "getPatient.spore");
    const flow = result.flows.find((f) => f.name === "getPatient");
    assert.ok(flow !== undefined, "Expected a flow named getPatient");
    const effects = flow.declaredEffects;
    assert.ok(
      effects.includes("phi.read"),
      `Expected phi.read in declaredEffects, got: [${effects.join(", ")}]`,
    );
    assert.ok(
      effects.includes("audit.write"),
      `Expected audit.write in declaredEffects, got: [${effects.join(", ")}]`,
    );
  });
});
