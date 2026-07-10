import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateWasmArtefact, createWasmTargetReport } from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);
const artefact = {
  path: "out/mod.wasm",
  target: { runtime: "server", features: ["simd"] },
  exports: ["run"],
  imports: [],
};

describe("validateWasmArtefact", () => {
  it("accepts a valid artefact", () => {
    assert.deepEqual(codes(validateWasmArtefact(artefact)), []);
  });

  it("requires a path and a known runtime", () => {
    const diags = validateWasmArtefact({ ...artefact, path: "", target: { runtime: "native", features: [] } });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WASM_ARTEFACT_PATH_REQUIRED",
      "Galerina_WASM_RUNTIME_INVALID",
    ]);
  });

  it("warns (not errors) when an artefact declares no exports", () => {
    const diags = validateWasmArtefact({ ...artefact, exports: [] });
    assert.deepEqual(codes(diags), ["Galerina_WASM_ARTEFACT_NO_EXPORTS"]);
    assert.equal(diags[0].severity, "warning");
  });
});

describe("createWasmTargetReport", () => {
  it("lifts export warnings into the report", () => {
    const { report, diagnostics } = createWasmTargetReport({
      artefacts: [artefact, { ...artefact, path: "out/empty.wasm", exports: [] }],
    });
    assert.equal(report.artefacts.length, 2);
    assert.equal(report.warnings.length, 1);
    assert.ok(diagnostics.some((d) => d.code === "Galerina_WASM_ARTEFACT_NO_EXPORTS"));
  });
});
