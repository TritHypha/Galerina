import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TRI_FALSE,
  TRI_TRUE,
  TRI_UNKNOWN,
  createDecisionLogicDefinition,
  createDecisionLogicState,
  createLogicDefinition,
  createLogicState,
  createOmniLogicDefinition,
  createTriLogicDefinition,
  triAnd,
  triToLogicState,
  logicStateToTri,
  triNor,
  triNot,
  triOr,
  triToBool,
  validateLogicDefinition,
  validateOmniLogicDefinition,
  validateTruthTable,
} from "../dist/index.js";

describe("galerina-core-logic contracts", () => {
  it("implements deterministic Tri operations", () => {
    assert.equal(triNot(TRI_TRUE), TRI_FALSE);
    assert.equal(triNot(TRI_UNKNOWN), TRI_UNKNOWN);
    assert.equal(triAnd(TRI_TRUE, TRI_UNKNOWN), TRI_UNKNOWN);
    assert.equal(triAnd(TRI_FALSE, TRI_TRUE), TRI_FALSE);
    assert.equal(triOr(TRI_FALSE, TRI_UNKNOWN), TRI_UNKNOWN);
    assert.equal(triNor(TRI_FALSE, TRI_FALSE), TRI_TRUE);
  });

  it("requires explicit Tri to Bool conversion policy", () => {
    assert.equal(triToBool(TRI_TRUE, "unknown_as_error"), true);
    assert.equal(triToBool(TRI_UNKNOWN, "unknown_as_false"), false);
    assert.equal(triToBool(TRI_UNKNOWN, "unknown_as_true"), true);
    assert.throws(
      () => triToBool(TRI_UNKNOWN, "unknown_as_error"),
      /Cannot convert Tri unknown/,
    );
  });

  it("rejects malformed logic definitions before use", () => {
    const diagnostics = validateLogicDefinition({
      name: "Decision",
      width: 3,
      states: ["Deny", "Review", "Review"],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "SPORE-LOGIC-005",
      ),
      true,
    );
    assert.throws(
      () => createLogicDefinition("Decision", 3, ["Deny", "Review"]),
      /state count/,
    );
  });

  it("bounds logic states to the declared width", () => {
    const definition = createLogicDefinition("Decision", 3, [
      "Deny",
      "Review",
      "Allow",
    ]);

    assert.deepEqual(createLogicState(definition, 2), {
      width: 3,
      state: 2,
    });
    assert.throws(() => createLogicState(definition, 3), /outside/);
  });

  it("defines canonical Tri and Decision logic states", () => {
    assert.deepEqual(createTriLogicDefinition(), {
      name: "Tri",
      width: 3,
      states: ["Negative", "Neutral", "Positive"],
    });
    assert.deepEqual(triToLogicState(TRI_FALSE), { width: 3, state: 0 });
    assert.deepEqual(triToLogicState(TRI_UNKNOWN), { width: 3, state: 1 });
    assert.equal(logicStateToTri({ width: 3, state: 2 }), TRI_TRUE);
    assert.deepEqual(createDecisionLogicDefinition(), {
      name: "Decision",
      width: 3,
      states: ["Deny", "Review", "Allow"],
    });
    assert.deepEqual(createDecisionLogicState("Review"), { width: 3, state: 1 });
  });

  it("reports duplicate, invalid and incomplete truth table rows", () => {
    const definition = createLogicDefinition("Decision", 3, [
      "Deny",
      "Review",
      "Allow",
    ]);
    const deny = createLogicState(definition, 0);
    const allow = createLogicState(definition, 2);
    const invalid = { width: 3, state: 3 };
    const diagnostics = validateTruthTable(definition, [
      { inputs: [deny], output: deny },
      { inputs: [deny], output: allow },
      { inputs: [invalid], output: allow },
    ]);

    assert.equal(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "SPORE-LOGIC-013",
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "SPORE-LOGIC-011",
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "SPORE-LOGIC-014",
      ),
      true,
    );
  });

  it("loads the Decision truth table example", async () => {
    const example = JSON.parse(
      await (await import("node:fs/promises")).readFile(
        new URL("../examples/decision-truth-table.json", import.meta.url),
        "utf8",
      ),
    );
    const diagnostics = validateTruthTable(example.logic, example.truthTable);

    assert.equal(diagnostics.length, 0);
  });

  it("defines bounded Omni logic contracts", () => {
    const omni = createOmniLogicDefinition("ReviewScale", [
      "Reject",
      "Escalate",
      "Approve",
      "Audit",
    ]);

    assert.equal(omni.kind, "Omni");
    assert.equal(omni.bounded, true);
    assert.equal(validateOmniLogicDefinition(omni).length, 0);
    assert.throws(
      () =>
        createOmniLogicDefinition(
          "TooWide",
          Array.from({ length: 257 }, (_value, index) => `State${index}`),
        ),
      /256 states/,
    );
  });
});
