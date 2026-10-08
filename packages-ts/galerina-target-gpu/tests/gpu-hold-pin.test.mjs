import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GPU_DIAGNOSTIC_CODES,
  GPU_HOLD_PIN_SCHEMA,
  PROPOSED_FUNGI_GPU_MAPPING,
  PROPOSED_FUNGI_GPU_MAPPING_SCHEMA,
  PROPOSED_FUNGI_GPU_STATUS,
  admitGpuCapability,
  claimPhysicalGpuEvidence,
  dispatchGpuKernel,
  executeGpuFallback,
  implementPostV1GpuContract,
  prepareGpuAdmissionRequest,
  promoteGpuDiagnosticsToFungi,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "src");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("GPU HOLD pin", () => {
  it("prepareGpuAdmissionRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareGpuAdmissionRequest({
      backend: "cuda",
      flow: "matmul",
      operations: ["gemm"],
    });
    assert.equal(request.kind, "GPU_ADMISSION_REQUEST");
    if (request.kind !== "GPU_ADMISSION_REQUEST") return;
    assert.equal(request.schema, GPU_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.backend, "cuda");
    assert.equal(request.flow, "matmul");
    assert.deepEqual([...request.operations], ["gemm"]);
    assert.deepEqual({ ...request.requires }, {
      physicalGpuEvidence: true,
      coreComputeSchemaOwner: true,
      ownerV1ShipDecision: true,
      currentVokReceipt: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepareGpuAdmissionRequest refuses authority and malformed input", () => {
    const base = { backend: "cuda", flow: "matmul", operations: ["gemm"] };
    assert.equal(prepareGpuAdmissionRequest({ ...base, admission: true }).code, "GPU_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareGpuAdmissionRequest({ ...base, lease: "x" }).code, "GPU_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareGpuAdmissionRequest({ ...base, dispatch: {} }).code, "GPU_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareGpuAdmissionRequest({ ...base, allow: true }).code, "GPU_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareGpuAdmissionRequest(null).code, "GPU_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareGpuAdmissionRequest({ backend: "cuda", flow: "matmul" }).code, "GPU_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareGpuAdmissionRequest({ backend: " ", flow: "matmul", operations: ["gemm"] }).code, "GPU_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareGpuAdmissionRequest({ backend: "cuda", flow: "matmul", operations: [] }).code, "GPU_HOLD_REQUEST_MALFORMED");
  });

  it("admit / dispatch / fallback / evidence / post-v1 acts always refuse", () => {
    const request = prepareGpuAdmissionRequest({
      backend: "cuda",
      flow: "matmul",
      operations: ["gemm"],
    });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      precision: "FP16",
      fallback: true,
    };
    const cases = [
      [admitGpuCapability, "GPU_PHYSICAL_ADMISSION_FORBIDDEN"],
      [dispatchGpuKernel, "GPU_KERNEL_DISPATCH_FORBIDDEN"],
      [executeGpuFallback, "GPU_FALLBACK_EXECUTE_FORBIDDEN"],
      [claimPhysicalGpuEvidence, "GPU_PHYSICAL_EVIDENCE_FORBIDDEN"],
      [implementPostV1GpuContract, "GPU_POST_V1_CONTRACT_FORBIDDEN"],
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

  it("promoteGpuDiagnosticsToFungi always GPU_FUNGI_PROMOTION_FORBIDDEN", () => {
    const forged = {
      kind: "PROMOTED",
      authorityReleased: true,
      codes: ["FUNGI-GPU-001"],
    };
    for (const input of [PROPOSED_FUNGI_GPU_MAPPING, forged, null, { ownerApproved: true }]) {
      const refused = promoteGpuDiagnosticsToFungi(input);
      assert.equal(refused.kind, "REFUSED");
      assert.equal(refused.code, "GPU_FUNGI_PROMOTION_FORBIDDEN");
      assertNonAuthorizing(refused);
    }
  });

  it("proposed FUNGI-GPU mapping is frozen 5-row PROPOSED_NOT_ADMITTED", () => {
    assert.equal(PROPOSED_FUNGI_GPU_MAPPING_SCHEMA, "galerina.target-gpu.proposed-fungi-gpu-mapping.v1");
    assert.equal(PROPOSED_FUNGI_GPU_STATUS, "PROPOSED_NOT_ADMITTED");
    assert.equal(Object.isFrozen(PROPOSED_FUNGI_GPU_MAPPING), true);
    assert.equal(PROPOSED_FUNGI_GPU_MAPPING.length, 5);
    assert.deepEqual(
      PROPOSED_FUNGI_GPU_MAPPING.map((row) => row.legacy),
      [...GPU_DIAGNOSTIC_CODES],
    );
    assert.deepEqual(
      PROPOSED_FUNGI_GPU_MAPPING.map((row) => row.fungi),
      ["FUNGI-GPU-001", "FUNGI-GPU-002", "FUNGI-GPU-003", "FUNGI-GPU-004", "FUNGI-GPU-005"],
    );
    for (const row of PROPOSED_FUNGI_GPU_MAPPING) {
      assert.equal(Object.isFrozen(row), true);
      assert.equal(GPU_DIAGNOSTIC_CODES.includes(row.fungi), false);
      assert.equal(GPU_DIAGNOSTIC_CODES.includes(row.legacy), true);
    }
  });

  it("HOLD pin codes are not live diagnostic registry members", () => {
    for (const code of [
      "GPU_PHYSICAL_ADMISSION_FORBIDDEN",
      "GPU_KERNEL_DISPATCH_FORBIDDEN",
      "GPU_FALLBACK_EXECUTE_FORBIDDEN",
      "GPU_PHYSICAL_EVIDENCE_FORBIDDEN",
      "GPU_FUNGI_PROMOTION_FORBIDDEN",
      "GPU_POST_V1_CONTRACT_FORBIDDEN",
      "FUNGI-GPU-001",
      "FUNGI-GPU-005",
    ]) {
      assert.equal(GPU_DIAGNOSTIC_CODES.includes(code), false, code);
    }
  });

  it("src never loads node:fs or core-compute; index never emits proposed Fungi GPU names", () => {
    const files = readdirSync(SRC_DIR).filter((name) => name.endsWith(".ts"));
    assert.ok(files.includes("index.ts"));
    assert.ok(files.includes("gpu-hold-pin.ts"));
    assert.ok(files.includes("proposed-fungi-gpu-mapping.ts"));
    for (const name of files) {
      const source = readFileSync(join(SRC_DIR, name), "utf8");
      assert.equal(/from ["']node:fs["']/.test(source), false, name);
      assert.equal(/from ["']@galerina\/core-compute["']/.test(source), false, name);
      assert.equal(/galerina-core-compute/.test(source), false, name);
    }
    const index = readFileSync(join(SRC_DIR, "index.ts"), "utf8");
    assert.equal(/["']FUNGI-GPU-/.test(index), false);
    assert.equal(index.includes("authorityReleased"), false);
    assert.equal(index.includes("admitGpuCapability("), false);
    assert.equal(index.includes("implementPostV1GpuContract("), false);
  });
});
