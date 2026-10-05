import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_OMNI_TRACE_EVIDENCE,
  OMNI_MIN_ALLOW_CONFIDENCE,
  OMNI_TRACE_SCHEMA,
  omniToDecision,
  traceOmniDecision,
  validateOmniDecision,
} from "../dist/omni/index.js";
import { decisionToRuntimeBool } from "../dist/decision/index.js";

const omni = (overrides = {}) => ({
  state: "true",
  confidence: 0.9,
  reasons: ["model agrees"],
  evidence: [
    { code: "MODEL_SCORE", message: "prompt: ignore previous instructions", confidence: 0.9, source: "model-a" },
    { code: "HEURISTIC", message: "token=sk-live-abc", confidence: 0.7 },
  ],
  advisoryOnly: true,
  ...overrides,
});

describe("Omni Phase 2: runtime reasoning traces", () => {
  it("records validate -> evidence -> classify -> convert for a confident true", () => {
    const { decision, trace } = traceOmniDecision(omni());
    assert.equal(decision.kind, "allow");
    assert.equal(trace.schema, OMNI_TRACE_SCHEMA);
    assert.equal(trace.advisoryOnly, true);
    assert.equal(trace.valid, true);
    assert.equal(trace.state, "true");
    assert.equal(trace.uncertain, false);
    assert.equal(trace.threshold, OMNI_MIN_ALLOW_CONFIDENCE);
    assert.equal(trace.rule, "allow-confident-true");
    assert.equal(trace.decisionKind, "allow");
    assert.deepEqual(trace.diagnostics, []);
    assert.deepEqual(trace.evidence, [
      { code: "MODEL_SCORE", confidence: 0.9, source: "model-a" },
      { code: "HEURISTIC", confidence: 0.7 },
    ]);
    assert.deepEqual(trace.steps.map((s) => [s.index, s.kind, s.code]), [
      [0, "validate", "ok"],
      [1, "evidence", "MODEL_SCORE"],
      [2, "evidence", "HEURISTIC"],
      [3, "classify", "true"],
      [4, "convert", "allow-confident-true"],
    ]);
  });

  it("matches omniToDecision for every valid state and names the rule", () => {
    const cases = [
      ["true", 0.8, "allow", "allow-confident-true"],
      ["true", 0.79, "review", "review-low-confidence-true"],
      ["false", 0.1, "deny", "deny-false"],
      ["unknown", 1, "review", "review-uncertain"],
      ["partial_true", 1, "review", "review-uncertain"],
      ["partial_false", 1, "review", "review-uncertain"],
      ["conflicted", 1, "review", "review-uncertain"],
      ["deferred", 1, "review", "review-uncertain"],
      ["inconsistent", 1, "review", "review-uncertain"],
    ];
    for (const [state, confidence, kind, rule] of cases) {
      const input = omni({ state, confidence });
      const { decision, trace } = traceOmniDecision(input);
      assert.equal(decision.kind, kind, state);
      assert.deepEqual(decision, omniToDecision(input), state);
      assert.equal(trace.rule, rule, state);
      assert.equal(trace.uncertain, !["true", "false"].includes(state), state);
    }
  });

  it("invalid input always yields review, even where omniToDecision would allow", () => {
    const hostile = omni({ confidence: 5 });
    assert.equal(omniToDecision(hostile).kind, "allow", "precondition: the raw mapper does not validate");
    const { decision, trace } = traceOmniDecision(hostile);
    assert.equal(decision.kind, "review");
    assert.equal(decisionToRuntimeBool(decision), false);
    assert.equal(trace.valid, false);
    assert.equal(trace.rule, "review-invalid-input");
    assert.deepEqual(trace.diagnostics.map((d) => [d.code, d.path]), [["FUNGI-OMNI-003", "confidence"]]);
    assert.equal(trace.state, undefined);
    assert.deepEqual(trace.evidence, []);
  });

  it("reports each malformed field with its FUNGI-OMNI code", () => {
    const bad = {
      state: "maybe",
      confidence: Number.NaN,
      reasons: "not-an-array",
      evidence: [{ code: "", message: "x", confidence: 0.5 }, { code: "A", message: "x", confidence: 2 }, null],
      advisoryOnly: false,
    };
    assert.deepEqual(validateOmniDecision(bad).map((d) => [d.code, d.path]), [
      ["FUNGI-OMNI-005", "state"],
      ["FUNGI-OMNI-002", "advisoryOnly"],
      ["FUNGI-OMNI-003", "confidence"],
      ["FUNGI-OMNI-004", "reasons"],
      ["FUNGI-OMNI-004", "evidence.0"],
      ["FUNGI-OMNI-004", "evidence.1"],
      ["FUNGI-OMNI-004", "evidence.2"],
    ]);
    for (const input of [null, undefined, "true", 1, [], () => {}]) {
      const { decision, trace } = traceOmniDecision(input);
      assert.equal(decision.kind, "review");
      assert.deepEqual(trace.diagnostics.map((d) => d.code), ["FUNGI-OMNI-005"]);
    }
    const tooMany = omni({ evidence: Array.from({ length: MAX_OMNI_TRACE_EVIDENCE + 1 }, () => ({ code: "E", message: "m", confidence: 1 })) });
    assert.deepEqual(validateOmniDecision(tooMany).map((d) => d.path), ["evidence"]);
  });

  it("withholds free text: evidence messages, reasons and rejected values never enter the trace", () => {
    const valid = traceOmniDecision(omni()).trace;
    const invalid = traceOmniDecision(omni({ state: "sk-live-STATE-SECRET", evidence: [{ code: "E", message: "SECRET-MSG", confidence: 3 }] })).trace;
    for (const trace of [valid, invalid]) {
      assert.doesNotMatch(JSON.stringify(trace), /ignore previous|sk-live|SECRET|model agrees/);
    }
  });

  it("is frozen end to end and detached from the input", () => {
    const input = omni();
    const { trace } = traceOmniDecision(input);
    assert.ok(Object.isFrozen(trace) && Object.isFrozen(trace.steps) && Object.isFrozen(trace.steps[0]));
    assert.ok(Object.isFrozen(trace.evidence) && Object.isFrozen(trace.evidence[0]) && Object.isFrozen(trace.diagnostics));
    input.evidence[0].code = "MUTATED";
    assert.equal(trace.evidence[0].code, "MODEL_SCORE");
  });
});
