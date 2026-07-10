import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateSpikeTrain,
  validateSpikingModel,
  validateNeuromorphicPlan,
  createNeuromorphicReport,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);
const errorCodes = (diags) => diags.filter((d) => d.severity === "error").map((d) => d.code);

describe("validateSpikeTrain — physically-meaningful spikes only", () => {
  it("accepts a well-formed, time-ordered train", () => {
    const diags = validateSpikeTrain({
      source: "retina",
      spikes: [
        { neuron: "n1", timeMs: 0 },
        { neuron: "n2", timeMs: 1.5, amplitude: 0.8 },
      ],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("requires a source", () => {
    const diags = validateSpikeTrain({ source: "  ", spikes: [] });
    assert.deepEqual(codes(diags), ["Galerina_NEUROMORPHIC_SPIKE_SOURCE_REQUIRED"]);
  });

  it("rejects an unnamed neuron, negative time and non-positive amplitude", () => {
    const diags = validateSpikeTrain({
      source: "s",
      spikes: [
        { neuron: "", timeMs: -1, amplitude: 0 },
      ],
    });
    assert.deepEqual(errorCodes(diags).sort(), [
      "Galerina_NEUROMORPHIC_SPIKE_AMPLITUDE_INVALID",
      "Galerina_NEUROMORPHIC_SPIKE_NEURON_REQUIRED",
      "Galerina_NEUROMORPHIC_SPIKE_TIME_INVALID",
    ]);
  });

  it("warns exactly once on an out-of-order train (no error)", () => {
    const diags = validateSpikeTrain({
      source: "s",
      spikes: [
        { neuron: "a", timeMs: 5 },
        { neuron: "b", timeMs: 2 },
        { neuron: "c", timeMs: 1 },
      ],
    });
    const order = diags.filter((d) => d.code === "Galerina_NEUROMORPHIC_SPIKE_ORDER_WARNING");
    assert.equal(order.length, 1);
    assert.ok(order.every((d) => d.severity === "warning"));
    assert.deepEqual(errorCodes(diags), []);
  });
});

describe("validateSpikingModel — named, connected, positive topology", () => {
  const base = { name: "snn", inputs: ["in"], outputs: ["out"], neurons: 64, synapses: 256 };

  it("accepts a valid model", () => {
    assert.deepEqual(codes(validateSpikingModel(base)), []);
  });

  it("rejects an unnamed, input-less, output-less model with bad counts", () => {
    const diags = validateSpikingModel({
      name: "",
      inputs: [],
      outputs: [],
      neurons: 0,
      synapses: -3,
    });
    assert.deepEqual(errorCodes(diags).sort(), [
      "Galerina_NEUROMORPHIC_MODEL_INPUTS_REQUIRED",
      "Galerina_NEUROMORPHIC_MODEL_NAME_REQUIRED",
      "Galerina_NEUROMORPHIC_MODEL_NEURONS_INVALID",
      "Galerina_NEUROMORPHIC_MODEL_OUTPUTS_REQUIRED",
      "Galerina_NEUROMORPHIC_MODEL_SYNAPSES_INVALID",
    ]);
  });

  it("rejects a non-integer neuron count", () => {
    assert.deepEqual(errorCodes(validateSpikingModel({ ...base, neurons: 1.5 })), [
      "Galerina_NEUROMORPHIC_MODEL_NEURONS_INVALID",
    ]);
  });

  it("warns (not errors) when a model declares zero synapses", () => {
    const diags = validateSpikingModel({ ...base, synapses: 0 });
    assert.deepEqual(errorCodes(diags), []);
    assert.deepEqual(codes(diags), ["Galerina_NEUROMORPHIC_MODEL_NO_SYNAPSES"]);
  });
});

describe("validateNeuromorphicPlan — bounded, satisfiable plans (fail-closed)", () => {
  const base = {
    flow: "vision",
    model: "snn",
    targetPreference: ["loihi"],
    fallback: "cpu",
    maxEvents: 100_000,
    timeoutMs: 5_000,
  };

  it("accepts a bounded, satisfiable plan", () => {
    assert.deepEqual(codes(validateNeuromorphicPlan(base)), []);
  });

  it("rejects an unbounded event ceiling and non-positive timeout", () => {
    const diags = validateNeuromorphicPlan({ ...base, maxEvents: 0, timeoutMs: 0 });
    assert.deepEqual(errorCodes(diags).sort(), [
      "Galerina_NEUROMORPHIC_PLAN_MAX_EVENTS_REQUIRED",
      "Galerina_NEUROMORPHIC_PLAN_TIMEOUT_REQUIRED",
    ]);
  });

  it("rejects an unknown fallback", () => {
    // deliberately bypass the compile-time union to exercise the runtime guard
    const diags = validateNeuromorphicPlan({ ...base, fallback: "tpu" });
    assert.ok(errorCodes(diags).includes("Galerina_NEUROMORPHIC_PLAN_FALLBACK_INVALID"));
  });

  it("errors when a plan has no target preference AND rejects fallback (unsatisfiable)", () => {
    const diags = validateNeuromorphicPlan({ ...base, targetPreference: [], fallback: "reject" });
    assert.deepEqual(errorCodes(diags), ["Galerina_NEUROMORPHIC_PLAN_UNSATISFIABLE"]);
  });

  it("warns when a plan has no target preference but a usable fallback", () => {
    const diags = validateNeuromorphicPlan({ ...base, targetPreference: [], fallback: "gpu" });
    assert.deepEqual(errorCodes(diags), []);
    assert.deepEqual(codes(diags), ["Galerina_NEUROMORPHIC_PLAN_NO_TARGET_PREFERENCE"]);
  });
});

describe("createNeuromorphicReport — lifts plan warnings to the report", () => {
  it("returns the plans and surfaces warnings", () => {
    const report = createNeuromorphicReport({
      plans: [
        { flow: "a", model: "m", targetPreference: ["loihi"], fallback: "cpu", maxEvents: 10, timeoutMs: 100 },
        { flow: "b", model: "m", targetPreference: [], fallback: "gpu", maxEvents: 10, timeoutMs: 100 },
      ],
    });
    assert.equal(report.plans.length, 2);
    assert.equal(report.warnings.length, 1);
    assert.match(report.warnings[0], /no target preference/);
  });
});
