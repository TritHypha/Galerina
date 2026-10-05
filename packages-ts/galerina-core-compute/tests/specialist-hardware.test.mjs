import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SPECIALIST_HARDWARE_CLASSES,
  freezeSpecialistHardwareTarget,
  specialistTargetAllowsSensitivity,
  validateSpecialistHardwareTarget,
} from "../dist/specialist/specialist-hardware.js";

const cpu = () => freezeSpecialistHardwareTarget({
  schema: "galerina.compute.specialist-hardware.v1",
  id: "cpu.generic",
  hardwareClass: "cpu",
  vendor: "generic",
  availability: "available",
  maxDataSensitivity: "internal",
  auditRequired: true,
  features: ["scalar", "simd"],
});

describe("specialist hardware taxonomy", () => {
  it("names the seven TODO classes", () => {
    assert.deepEqual([...SPECIALIST_HARDWARE_CLASSES], ["cpu", "gpu", "npu", "tpu", "vpu", "fpga", "asic"]);
  });

  it("accepts a valid cpu target and freezes it", () => {
    const t = cpu();
    assert.deepEqual(validateSpecialistHardwareTarget(t), []);
    assert.ok(Object.isFrozen(t) && Object.isFrozen(t.features));
  });

  it("refuses non-cpu availability=available under the v1 freeze", () => {
    const bad = { ...cpu(), hardwareClass: "gpu", id: "gpu.x", availability: "available" };
    const d = validateSpecialistHardwareTarget(bad);
    assert.ok(d.some((x) => x.code === "Galerina_COMPUTE_SPECIALIST_V1_FREEZE"));
  });

  it("allows gpu as planning_only", () => {
    const t = freezeSpecialistHardwareTarget({ ...cpu(), id: "gpu.plan", hardwareClass: "gpu", availability: "planning_only", maxDataSensitivity: undefined, features: [] });
    assert.deepEqual(validateSpecialistHardwareTarget(t), []);
  });

  it("omitted maxDataSensitivity admits nothing", () => {
    const t = freezeSpecialistHardwareTarget({ ...cpu(), maxDataSensitivity: undefined, features: ["scalar"] });
    assert.equal(specialistTargetAllowsSensitivity(t, "public"), false);
  });

  it("sensitivity cap is fail-closed and ranked", () => {
    const t = cpu();
    assert.equal(specialistTargetAllowsSensitivity(t, "public"), true);
    assert.equal(specialistTargetAllowsSensitivity(t, "internal"), true);
    assert.equal(specialistTargetAllowsSensitivity(t, "confidential"), false);
  });

  it("refuses unknown fields, bad schema, and auditRequired false without echoing junk", () => {
    const marker = "do-not-echo-91c";
    const d = validateSpecialistHardwareTarget({ ...cpu(), auditRequired: false, [marker]: true, schema: "nope" });
    assert.ok(d.some((x) => x.code === "Galerina_COMPUTE_SPECIALIST_AUDIT_REQUIRED"));
    assert.ok(d.some((x) => x.code === "Galerina_COMPUTE_SPECIALIST_FIELD_UNKNOWN"));
    assert.ok(d.some((x) => x.code === "Galerina_COMPUTE_SPECIALIST_SCHEMA_INVALID"));
    assert.ok(!JSON.stringify(d).includes(marker));
  });
});