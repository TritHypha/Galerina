import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateOpticalChannelLayout,
  validatePhotonicLoweringPlan,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

describe("validateOpticalChannelLayout — physical validity", () => {
  it("accepts a physical channel", () => {
    const diags = validateOpticalChannelLayout({
      channelId: "c0", wavelengthNm: 1550, phaseDegrees: 90, amplitude: 0.5,
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects a non-positive wavelength", () => {
    const diags = validateOpticalChannelLayout({ channelId: "c0", wavelengthNm: 0 });
    assert.deepEqual(codes(diags), ["Galerina_PHOTONIC_WAVELENGTH_INVALID"]);
    assert.ok(diags[0].suggestedFix);
  });

  it("rejects an amplitude outside (0, 1]", () => {
    assert.deepEqual(
      codes(validateOpticalChannelLayout({ channelId: "c", wavelengthNm: 1550, amplitude: 1.5 })),
      ["Galerina_PHOTONIC_AMPLITUDE_INVALID"],
    );
    assert.deepEqual(
      codes(validateOpticalChannelLayout({ channelId: "c", wavelengthNm: 1550, amplitude: 0 })),
      ["Galerina_PHOTONIC_AMPLITUDE_INVALID"],
    );
  });

  it("requires a channel id and finite phase", () => {
    const diags = validateOpticalChannelLayout({
      channelId: "", wavelengthNm: 1550, phaseDegrees: Number.POSITIVE_INFINITY,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_PHOTONIC_CHANNEL_ID_REQUIRED",
      "Galerina_PHOTONIC_PHASE_INVALID",
    ]);
  });
});

describe("validatePhotonicLoweringPlan — no silent unsupported ops", () => {
  const mapped = [{ operation: "matrix-multiply", sourceOperation: "mm", targetOperation: "photonic-mm", channels: [] }];

  it("accepts a compatible plan that maps an operation", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "photonic-compatible",
      mappedOperations: mapped, unsupportedOperations: [],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects an unsupported op that lacks a reason or fallback", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "fallback-required",
      mappedOperations: mapped,
      unsupportedOperations: [{ operation: "signal-routing", reason: "", suggestedFallback: "" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_PHOTONIC_UNSUPPORTED_OP_UNEXPLAINED"]);
  });

  it("flags a compatible plan that still carries unsupported ops (inconsistent)", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "photonic-compatible",
      mappedOperations: mapped,
      unsupportedOperations: [{ operation: "x", reason: "r", suggestedFallback: "cpu" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_PHOTONIC_STATUS_INCONSISTENT"]);
  });

  it("rejects an unknown status and an empty non-unsupported plan", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "quantum",
      mappedOperations: [], unsupportedOperations: [],
    });
    assert.ok(codes(diags).includes("Galerina_PHOTONIC_STATUS_INVALID"));
    assert.ok(codes(diags).includes("Galerina_PHOTONIC_PLAN_EMPTY"));
  });
});
