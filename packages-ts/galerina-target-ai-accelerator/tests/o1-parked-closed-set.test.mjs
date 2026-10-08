import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AI_ACCELERATOR_KINDS,
  AI_ACCELERATOR_TOPOLOGIES,
  INTEL_GAUDI3_HL338_PROFILE,
  createAiAcceleratorTargetReport,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARKED_KINDS = Object.freeze(["vpu", "fpga", "asic"]);

function capability(over = {}) {
  return {
    name: "cap-1",
    kind: "npu",
    supportedPrecisions: ["INT8"],
    features: [],
    ...over,
  };
}

describe("O1 closed set: VPU/FPGA/ASIC and HBM/topology stay parked", () => {
  it("freezes eight admitted kinds; parked VPU/FPGA/ASIC are absent", () => {
    assert.equal(Object.isFrozen(AI_ACCELERATOR_KINDS), true);
    assert.deepEqual([...AI_ACCELERATOR_KINDS], [
      "npu", "tpu", "ane", "dsp", "ai-chip", "inference-accelerator", "training-accelerator", "plan-only",
    ]);
    for (const kind of PARKED_KINDS) {
      assert.equal(AI_ACCELERATOR_KINDS.includes(kind), false, kind);
    }
  });

  it("freezes five admitted topologies; unknown extra tokens are absent", () => {
    assert.equal(Object.isFrozen(AI_ACCELERATOR_TOPOLOGIES), true);
    assert.deepEqual([...AI_ACCELERATOR_TOPOLOGIES], [
      "single-card", "pooled_1x4", "pooled_2x4", "independent_4x1", "unknown",
    ]);
    assert.equal(AI_ACCELERATOR_TOPOLOGIES.includes("mesh"), false);
    assert.equal(AI_ACCELERATOR_TOPOLOGIES.includes("isolation"), false);
  });

  it("refuses parked VPU/FPGA/ASIC kinds with Galerina_AI_ACCELERATOR_INPUT_REFUSED", () => {
    for (const kind of PARKED_KINDS) {
      const report = createAiAcceleratorTargetReport({ capabilities: [capability({ kind })] });
      assert.equal(report.capabilities.length, 0, kind);
      assert.ok(
        report.refusedSelections.some((row) => row.diagnostics.some((d) => d.code === "Galerina_AI_ACCELERATOR_INPUT_REFUSED" && d.path === "capabilities.0.kind")),
        kind,
      );
    }
  });

  it("refuses an unknown topology token on a capability", () => {
    const report = createAiAcceleratorTargetReport({
      capabilities: [capability({ topology: "mesh" })],
    });
    assert.equal(report.capabilities.length, 0);
    assert.ok(report.refusedSelections.some((row) => row.diagnostics.some((d) => d.code === "Galerina_AI_ACCELERATOR_INPUT_REFUSED" && d.path === "capabilities.0.topology")));
  });

  it("keeps Gaudi 3 HBM numbers on a passive profile; src has no isolation-level vocabulary", () => {
    assert.equal(INTEL_GAUDI3_HL338_PROFILE.passiveProfile, true);
    assert.equal(typeof INTEL_GAUDI3_HL338_PROFILE.memory.hbmBytes, "number");
    assert.equal(typeof INTEL_GAUDI3_HL338_PROFILE.memory.hbmBandwidthBytesPerSecond, "number");
    assert.deepEqual([...INTEL_GAUDI3_HL338_PROFILE.topologies], ["single-card", "pooled_1x4", "pooled_2x4", "independent_4x1"]);
    const src = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.equal(/\bisolation[- ]level\b/i.test(src), false);
    const kindsBlock = src.slice(src.indexOf("export const AI_ACCELERATOR_KINDS"), src.indexOf("export const AI_ACCELERATOR_KINDS") + 400);
    for (const kind of PARKED_KINDS) {
      assert.equal(kindsBlock.includes('"' + kind + '"'), false, kind);
    }
  });
});
