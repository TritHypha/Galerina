import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createPhotonicReport,
  defineOpticalSignal,
  validateOpticalSignal,
  validatePhotonicMapping,
} from "../dist/index.js";

describe("galerina-core-photonic contracts", () => {
  it("defines bounded optical signals", () => {
    assert.deepEqual(defineOpticalSignal({
      nanometers: 1550,
      phaseDegrees: 90,
      amplitude: 0.75,
    }), {
      wavelength: { nanometers: 1550 },
      phase: { degrees: 90 },
      amplitude: { value: 0.75 },
    });
    assert.equal(
      validateOpticalSignal({
        wavelength: { nanometers: -1 },
        phase: { degrees: 0 },
        amplitude: { value: 2 },
      }).length,
      2,
    );
  });

  it("validates logic-state mappings", () => {
    const signal = defineOpticalSignal({
      nanometers: 1310,
      phaseDegrees: 0,
      amplitude: 1,
    });
    const diagnostics = validatePhotonicMapping({
      logicPackage: "@galerina/core-logic",
      logicName: "Tri",
      states: [
        { state: "Positive", signal },
        { state: "Positive", signal },
      ],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_PHOTONIC_MAPPING_STATE_DUPLICATE",
      ),
      true,
    );
  });

  it("creates photonic reports", () => {
    const signal = defineOpticalSignal({
      nanometers: 1550,
      phaseDegrees: 180,
      amplitude: 0.5,
    });
    const report = createPhotonicReport({
      name: "tri-plan",
      mode: "planning",
      channels: [{ name: "positive", signal }],
      mappings: [],
      report: true,
    });

    assert.equal(report.channelCount, 1);
    assert.equal(report.diagnostics.length, 0);
  });

  it("loads the Tri optical mapping example", async () => {
    const plan = JSON.parse(
      await readFile(
        new URL("../examples/tri-optical-mapping-plan.json", import.meta.url),
        "utf8",
      ),
    );
    const report = createPhotonicReport(plan);

    assert.equal(report.diagnostics.length, 0);
    assert.equal(report.channelCount, 3);
    assert.equal(report.plan.mappings[0]?.logicName, "Tri");
  });
});
