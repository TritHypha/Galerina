import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ADMITTED_AI_ACCELERATOR_REQUEST_KINDS,
  AI_ACCELERATOR_HOLD_PIN_SCHEMA,
  AI_ACCELERATOR_KINDS,
  AI_ACCELERATOR_TOPOLOGIES,
  PARKED_AI_ACCELERATOR_KINDS,
  PARKED_AI_ACCELERATOR_TOPOLOGY_TOKENS,
  admitAiAcceleratorCapability,
  claimPhysicalAcceleratorEvidence,
  dispatchAiAcceleratorKernel,
  implementPostV1HbmTopologyReport,
  implementPostV1IsolationReport,
  implementPostV1VpuFpgaAsic,
  prepareAiAcceleratorAdmissionRequest,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "src");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("AI accelerator HOLD pin", () => {
  it("prepareAiAcceleratorAdmissionRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareAiAcceleratorAdmissionRequest({
      name: "cap-1",
      kind: "npu",
    });
    assert.equal(request.kind, "AI_ACCELERATOR_ADMISSION_REQUEST");
    if (request.kind !== "AI_ACCELERATOR_ADMISSION_REQUEST") return;
    assert.equal(request.schema, AI_ACCELERATOR_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.name, "cap-1");
    assert.equal(request.acceleratorKind, "npu");
    assert.deepEqual({ ...request.requires }, {
      ownerV1ShipDecision: true,
      physicalAcceleratorEvidence: true,
      currentVokReceipt: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority, isolation keys, parked kinds, and parked topology tokens", () => {
    const base = { name: "cap-1", kind: "npu" };
    assert.equal(prepareAiAcceleratorAdmissionRequest({ ...base, admission: true }).code, "AA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ ...base, lease: "x" }).code, "AA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ ...base, isolationLevel: "strict" }).code, "AA_POST_V1_ISOLATION_REPORT_FORBIDDEN");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ ...base, isolation: {} }).code, "AA_POST_V1_ISOLATION_REPORT_FORBIDDEN");
    assert.equal(prepareAiAcceleratorAdmissionRequest(null).code, "AA_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ name: "cap-1" }).code, "AA_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ name: "cap-1", kind: "vpu" }).code, "AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ name: "cap-1", kind: "fpga" }).code, "AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ name: "cap-1", kind: "asic" }).code, "AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ ...base, topology: "mesh" }).code, "AA_POST_V1_HBM_TOPOLOGY_REPORT_FORBIDDEN");
    assert.equal(prepareAiAcceleratorAdmissionRequest({ ...base, topology: "isolation" }).code, "AA_POST_V1_HBM_TOPOLOGY_REPORT_FORBIDDEN");
  });

  it("parked kinds and topology tokens stay outside the live closed sets", () => {
    assert.deepEqual([...ADMITTED_AI_ACCELERATOR_REQUEST_KINDS], [...AI_ACCELERATOR_KINDS]);
    for (const kind of PARKED_AI_ACCELERATOR_KINDS) {
      assert.equal(AI_ACCELERATOR_KINDS.includes(kind), false, kind);
    }
    for (const token of PARKED_AI_ACCELERATOR_TOPOLOGY_TOKENS) {
      assert.equal(AI_ACCELERATOR_TOPOLOGIES.includes(token), false, token);
    }
  });

  it("admit / evidence / dispatch / POST-V1 acts always refuse", () => {
    const request = prepareAiAcceleratorAdmissionRequest({ name: "cap-1", kind: "npu" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      isolationLevel: "strict",
      hbmReport: true,
    };
    const cases = [
      [admitAiAcceleratorCapability, "AA_PHYSICAL_ADMISSION_FORBIDDEN"],
      [claimPhysicalAcceleratorEvidence, "AA_PHYSICAL_EVIDENCE_FORBIDDEN"],
      [dispatchAiAcceleratorKernel, "AA_KERNEL_DISPATCH_FORBIDDEN"],
      [implementPostV1VpuFpgaAsic, "AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN"],
      [implementPostV1IsolationReport, "AA_POST_V1_ISOLATION_REPORT_FORBIDDEN"],
      [implementPostV1HbmTopologyReport, "AA_POST_V1_HBM_TOPOLOGY_REPORT_FORBIDDEN"],
    ];
    for (const [fn, code] of cases) {
      for (const input of [request, forged, null, { ok: true }]) {
        const refused = fn(input);
        assert.equal(refused.kind, "REFUSED", code);
        assert.equal(refused.code, code);
        assertNonAuthorizing(refused);
      }
    }
  });

  it("src never loads node:fs or core-compute; index never admits parked kinds", () => {
    const files = readdirSync(SRC_DIR).filter((name) => name.endsWith(".ts"));
    assert.ok(files.includes("index.ts"));
    assert.ok(files.includes("ai-accelerator-hold-pin.ts"));
    for (const name of files) {
      const source = readFileSync(join(SRC_DIR, name), "utf8");
      assert.equal(/from ["']node:fs["']/.test(source), false, name);
      assert.equal(/from ["']@galerina\/core-compute["']/.test(source), false, name);
    }
    const index = readFileSync(join(SRC_DIR, "index.ts"), "utf8");
    assert.equal(/\bisolation[- ]level\b/i.test(index), false);
    assert.equal(index.includes("admitAiAcceleratorCapability("), false);
    assert.equal(index.includes("implementPostV1VpuFpgaAsic("), false);
    const kindsBlock = index.slice(
      index.indexOf("export const AI_ACCELERATOR_KINDS"),
      index.indexOf("export const AI_ACCELERATOR_KINDS") + 400,
    );
    for (const kind of PARKED_AI_ACCELERATOR_KINDS) {
      assert.equal(kindsBlock.includes('"' + kind + '"'), false, kind);
    }
  });
});
